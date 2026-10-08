import { haversine } from './geo';
import type { Fix, Sport, TrackPoint } from './types';

/**
 * The GPS recording engine — pure TypeScript, no RN imports.
 *
 * Fed an ordered stream of events (start / fix / pause / resume), it filters
 * bad fixes, smooths the position with a light Kalman filter, accumulates
 * moving distance + moving time, auto-pauses when you stop, and tracks
 * elevation gain with hysteresis. Because it is deterministic, a recording
 * that was interrupted (app killed mid-marathon) is rebuilt exactly by
 * replaying the persisted event log through a fresh Recorder.
 *
 * It mutates in place for speed (a 4-hour ride is ~15k fixes); callers that
 * need immutable snapshots take one with `stats()`.
 */

export interface SportTuning {
  /** reject fixes whose horizontal accuracy is worse than this (m) */
  maxAccuracyM: number;
  /** reject jumps implying a faster speed than this (m/s) */
  maxSpeedMps: number;
  /** Kalman process noise: how fast the true position can drift (m/s) */
  processNoiseMps: number;
  /** auto-pause when moving slower than this … */
  pauseBelowMps: number;
  /** … for at least this long (s) */
  pauseAfterSec: number;
  /** and resume once faster than this (m/s) — higher than pauseBelow (hysteresis) */
  resumeAboveMps: number;
  /** minimum climb counted as elevation gain (m) */
  elevThresholdM: number;
  /** distance gate: hold the anchor until the smoothed position moved this far (m) */
  minStepM: number;
}

export const TUNING: Record<Sport, SportTuning> = {
  run: { maxAccuracyM: 25, maxSpeedMps: 10, processNoiseMps: 3, pauseBelowMps: 0.6, pauseAfterSec: 4, resumeAboveMps: 1.0, elevThresholdM: 4, minStepM: 7 },
  walk: { maxAccuracyM: 25, maxSpeedMps: 6, processNoiseMps: 2, pauseBelowMps: 0.4, pauseAfterSec: 6, resumeAboveMps: 0.7, elevThresholdM: 4, minStepM: 9 },
  hike: { maxAccuracyM: 30, maxSpeedMps: 6, processNoiseMps: 2, pauseBelowMps: 0.3, pauseAfterSec: 8, resumeAboveMps: 0.6, elevThresholdM: 4, minStepM: 9 },
  ride: { maxAccuracyM: 30, maxSpeedMps: 30, processNoiseMps: 8, pauseBelowMps: 1.2, pauseAfterSec: 4, resumeAboveMps: 2.2, elevThresholdM: 4, minStepM: 10 },
};

/** Events in the order they happened. This exact union is what gets persisted. */
export type RecorderEvent =
  | { kind: 'fix'; fix: Fix }
  | { kind: 'pause'; t: number }
  | { kind: 'resume'; t: number };

export type RecorderStatus = 'recording' | 'paused' | 'finished';

export interface RecorderStats {
  sport: Sport;
  status: RecorderStatus;
  autoPaused: boolean;
  startedAt: number;
  distanceM: number;
  movingSec: number;
  elevGainM: number;
  /** last accepted fix time (ms), null until GPS locks */
  lastFixAt: number | null;
  /** time (ms) up to which movingSec is counted — the live timer extrapolates from here */
  movingAsOf: number | null;
  /** horizontal accuracy of the newest fix (m), for the GPS-strength chip */
  gpsAccuracyM: number | null;
  pointCount: number;
}

/** Gaps longer than this with almost no movement count as stopped, not moving. */
const GAP_SEC = 60;
/** Speed window for auto-pause when the OS gives no doppler speed. */
const WINDOW_SEC = 6;
/** EMA weight for altitude smoothing. */
const ALT_ALPHA = 0.25;
/** The distance gate never holds the anchor longer than this (s). */
const GATE_MAX_SEC = 8;
/** fixes timestamped this long before Start/Resume are cached leftovers */
const STALE_GRACE_MS = 2000;
/** consecutive teleport rejections before trusting the new position */
const RESEED_AFTER = 5;

export class Recorder {
  readonly sport: Sport;
  readonly startedAt: number;
  readonly tuning: SportTuning;
  readonly autoPauseEnabled: boolean;

  status: RecorderStatus = 'recording';
  autoPaused = false;
  points: TrackPoint[] = [];
  distanceM = 0;
  movingSec = 0;
  elevGainM = 0;
  lastFixAt: number | null = null;
  gpsAccuracyM: number | null = null;

  private seg = 0;
  /** smoothed position + its variance (m²) */
  private kf: { lat: number; lon: number; variance: number; t: number } | null = null;
  /** last raw accepted fix — the reference for the implausible-jump check */
  private lastRaw: Fix | null = null;
  /** last smoothed point that distance was measured from */
  private anchor: { t: number; lat: number; lon: number } | null = null;
  private window: { t: number; lat: number; lon: number }[] = [];
  private lowSince: number | null = null;
  private altEma: number | null = null;
  private elevRef: number | null = null;
  /** when the current segment began (Start / Resume) — older fixes are stale cache */
  private segmentStart: number;
  /** consecutive "teleport" rejections — a run of them means the anchor was the bad fix */
  private rejectStreak = 0;

  constructor(sport: Sport, startedAt: number, opts: { autoPause?: boolean } = {}) {
    this.sport = sport;
    this.startedAt = startedAt;
    this.segmentStart = startedAt;
    this.tuning = TUNING[sport];
    this.autoPauseEnabled = opts.autoPause ?? true;
  }

  apply(ev: RecorderEvent): void {
    if (this.status === 'finished') return;
    if (ev.kind === 'pause') this.pause();
    else if (ev.kind === 'resume') this.resume(ev.t);
    else this.addFix(ev.fix);
  }

  pause(): void {
    if (this.status !== 'recording') return;
    this.status = 'paused';
  }

  resume(t?: number): void {
    if (this.status !== 'paused') return;
    this.status = 'recording';
    if (t != null) this.segmentStart = t;
    // Never draw or measure a line across a manual pause: start a new segment
    // and re-lock the filter, since you may have walked off while paused.
    this.seg += 1;
    this.kf = null;
    this.anchor = null;
    this.lastRaw = null;
    this.window = [];
    this.lowSince = null;
    this.autoPaused = false;
    this.rejectStreak = 0;
    // a gondola / car ride while paused is not climbing
    this.altEma = null;
    this.elevRef = null;
  }

  finish(): void {
    this.status = 'finished';
  }

  addFix(f: Fix): void {
    if (this.status !== 'recording') return;
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon) || Math.abs(f.lat) > 90 || Math.abs(f.lon) > 180) return;
    if (f.acc != null && (f.acc < 0 || f.acc > this.tuning.maxAccuracyM)) return;
    // The OS often hands over a cached location first — from before you
    // pressed Start/Resume, possibly far away. Never let it seed the track.
    if (f.t < this.segmentStart - STALE_GRACE_MS) return;
    if (this.lastRaw) {
      const dt = (f.t - this.lastRaw.t) / 1000;
      if (dt <= 0) return; // duplicate / out-of-order
      const jump = haversine(this.lastRaw.lat, this.lastRaw.lon, f.lat, f.lon);
      // A teleport (bad multipath fix) — skip it, but only within a short gap:
      // after a long gap (tunnel, GPS loss) a big jump is real travel.
      if (dt < 30 && jump / dt > this.tuning.maxSpeedMps) {
        this.rejectStreak += 1;
        if (this.rejectStreak < RESEED_AFTER) return;
        // Several good-looking fixes all "teleport" from the reference: the
        // reference itself was the bad fix. Re-seed from here without
        // counting the jump (and drop a lone bad starting point).
        this.reseed();
      } else {
        this.rejectStreak = 0;
      }
    }
    this.lastRaw = f;
    this.lastFixAt = f.t;
    this.gpsAccuracyM = f.acc;

    const p = this.smooth(f);
    this.trackSpeedWindow(p);
    // Android reports 0.0 when a fix simply has no speed, so 0 can't be trusted
    // as "stopped" — fall back to the measured window speed.
    const speed = f.speed != null && f.speed > 0 ? f.speed : this.windowSpeed();
    this.updateAltitude(f);

    if (!this.anchor) {
      // first point of a segment
      this.anchor = p;
      this.pushPoint(p);
      return;
    }

    const dt = (p.t - this.anchor.t) / 1000;
    const step = haversine(this.anchor.lat, this.anchor.lon, p.lat, p.lon);

    if (this.autoPauseEnabled && this.autoPaused) {
      if (speed >= this.tuning.resumeAboveMps) {
        this.autoPaused = false;
        this.lowSince = null;
        // Bridge the slow creep made while auto-paused (distance, not time).
        this.distanceM += step;
        this.anchor = p;
        this.pushPoint(p);
      }
      return;
    }

    if (this.autoPauseEnabled) {
      if (speed < this.tuning.pauseBelowMps) {
        if (this.lowSince == null) this.lowSince = p.t;
        if ((p.t - this.lowSince) / 1000 >= this.tuning.pauseAfterSec) {
          this.autoPaused = true;
          return;
        }
      } else {
        this.lowSince = null;
      }
    }

    // Distance gate: hold the anchor until we've clearly moved, so jitter
    // across the path averages out over a longer baseline instead of adding
    // a zig-zag metre every second. Scales up when the fix is poor.
    const minStep = Math.min(12, Math.max(this.tuning.minStepM, 1.0 * (f.acc ?? 0)));
    if (step < minStep && dt < GATE_MAX_SEC) return;

    // A long silent gap with barely any movement was a stop, not running time.
    const stoppedGap = dt > GAP_SEC && step / dt < this.tuning.pauseBelowMps;
    if (!stoppedGap) this.movingSec += dt;
    this.distanceM += step;
    this.anchor = p;
    this.pushPoint(p);
  }

  private reseed() {
    if (this.points.length <= 1) {
      this.points = [];
    } else {
      this.seg += 1; // keep the good track, just don't draw/measure the jump
    }
    this.kf = null;
    this.anchor = null;
    this.lastRaw = null;
    this.window = [];
    this.lowSince = null;
    this.rejectStreak = 0;
  }

  stats(): RecorderStats {
    return {
      sport: this.sport,
      status: this.status,
      autoPaused: this.autoPaused,
      startedAt: this.startedAt,
      distanceM: this.distanceM,
      movingSec: this.movingSec,
      elevGainM: this.elevGainM,
      lastFixAt: this.lastFixAt,
      movingAsOf: this.anchor && !this.autoPaused ? this.anchor.t : null,
      gpsAccuracyM: this.gpsAccuracyM,
      pointCount: this.points.length,
    };
  }

  /**
   * Live "current pace" in s/km over the last ~30 s of moving time (needs at
   * least 25 m of travel inside the window to say anything).
   */
  currentPace(windowSec = 30): number | null {
    const n = this.points.length;
    if (n < 2 || this.autoPaused || this.status !== 'recording') return null;
    const last = this.points[n - 1];
    let i = n - 2;
    while (i > 0 && last.mt - this.points[i].mt < windowSec && this.points[i].seg === last.seg) i--;
    const first = this.points[i];
    const d = last.d - first.d;
    const t = last.mt - first.mt;
    if (d < 25 || t <= 0) return null;
    return t / (d / 1000);
  }

  // ── internals ────────────────────────────────────────────────────────────

  /** 1-D Kalman per axis with variance in m² (the classic "smooth GPS" filter). */
  private smooth(f: Fix): { t: number; lat: number; lon: number } {
    const acc = Math.max(1, f.acc ?? 10);
    if (!this.kf) {
      this.kf = { lat: f.lat, lon: f.lon, variance: acc * acc, t: f.t };
      return { t: f.t, lat: f.lat, lon: f.lon };
    }
    const dt = Math.max(0, (f.t - this.kf.t) / 1000);
    const q = this.tuning.processNoiseMps;
    let variance = this.kf.variance + dt * q * q;
    const k = variance / (variance + acc * acc);
    const lat = this.kf.lat + k * (f.lat - this.kf.lat);
    const lon = this.kf.lon + k * (f.lon - this.kf.lon);
    variance = (1 - k) * variance;
    this.kf = { lat, lon, variance, t: f.t };
    return { t: f.t, lat, lon };
  }

  private trackSpeedWindow(p: { t: number; lat: number; lon: number }) {
    this.window.push(p);
    while (this.window.length > 2 && (p.t - this.window[0].t) / 1000 > WINDOW_SEC) this.window.shift();
  }

  private windowSpeed(): number {
    const w = this.window;
    if (w.length < 2) return Infinity; // unknown → never auto-pause on one point
    const a = w[0];
    const b = w[w.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return Infinity;
    return haversine(a.lat, a.lon, b.lat, b.lon) / dt;
  }

  private updateAltitude(f: Fix) {
    if (f.alt == null || !Number.isFinite(f.alt)) return;
    // altAcc 0 / negative = "no vertical fix" (Android fills 0.0 for missing values)
    if (f.altAcc != null && (f.altAcc <= 0 || f.altAcc > 20)) return;
    if (f.alt === 0 && f.altAcc == null) return;
    this.altEma = this.altEma == null ? f.alt : this.altEma + ALT_ALPHA * (f.alt - this.altEma);
    if (this.elevRef == null) {
      this.elevRef = this.altEma;
      return;
    }
    const diff = this.altEma - this.elevRef;
    if (diff >= this.tuning.elevThresholdM) {
      this.elevGainM += diff;
      this.elevRef = this.altEma;
    } else if (-diff >= this.tuning.elevThresholdM) {
      this.elevRef = this.altEma; // descending: move the reference down
    }
  }

  private pushPoint(p: { t: number; lat: number; lon: number }) {
    this.points.push({
      t: p.t,
      lat: p.lat,
      lon: p.lon,
      alt: this.altEma == null ? null : Math.round(this.altEma * 10) / 10,
      d: this.distanceM,
      mt: this.movingSec,
      seg: this.seg,
    });
  }
}

/** Rebuild a recorder from its persisted log (crash/kill recovery). */
export function replay(
  sport: Sport,
  startedAt: number,
  events: RecorderEvent[],
  opts: { autoPause?: boolean } = {},
): Recorder {
  const r = new Recorder(sport, startedAt, opts);
  for (const ev of events) r.apply(ev);
  return r;
}

/**
 * Moving time shown on the live timer: fix-based moving time, extrapolated
 * smoothly between fixes (capped so a GPS dropout doesn't run the clock).
 */
export function liveMovingSec(s: RecorderStats, now: number): number {
  if (s.status !== 'recording' || s.autoPaused || s.movingAsOf == null) return s.movingSec;
  const since = (now - s.movingAsOf) / 1000;
  return s.movingSec + Math.max(0, Math.min(since, 15));
}
