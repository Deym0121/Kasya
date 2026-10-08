import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { Recorder, replay, type RecorderEvent, type RecorderStats } from './recorder';
import { packEvent, unpackEvent, quantize, type PackedEvent } from './pack';
import { newActivityId } from './finalize';
import type { Fix, Sport } from './types';

/**
 * The one live recording, shared by the Record screen and the background
 * location task. Every event is appended to a chunked log in AsyncStorage as
 * it arrives (flushed every few seconds and on every pause/resume/background),
 * so if the OS kills Kasya three hours into a marathon the recording is
 * rebuilt exactly by replaying that log — see Recorder/replay.
 */

const META_KEY = 'kasya:rec:meta:v1';
const chunkKey = (n: number) => `kasya:rec:chunk:v1:${n}`;
/** events per stored chunk — keeps each write small no matter how long the run */
const CHUNK = 150;
const FLUSH_MS = 5000;

interface Meta {
  v: 1;
  id: string;
  sport: Sport;
  startedAt: number;
  autoPause: boolean;
  /** number of chunk keys in use (the last one is the one being appended to) */
  chunks: number;
  demo: boolean;
  /** set once the activity is being saved — a log marked finished is never restored */
  finished?: boolean;
}

export interface SessionSnapshot {
  active: boolean;
  id: string | null;
  stats: RecorderStats | null;
  currentPace: number | null;
  /** bumps whenever the track changes — cheap redraw trigger for maps */
  version: number;
  demo: boolean;
}

const IDLE: SessionSnapshot = { active: false, id: null, stats: null, currentPace: null, version: 0, demo: false };

class RecordingSession {
  private rec: Recorder | null = null;
  private meta: Meta | null = null;
  private chunk: PackedEvent[] = [];
  private dirty = false;
  private lastFlush = 0;
  private version = 0;
  private snap: SessionSnapshot = IDLE;
  private listeners = new Set<() => void>();
  private writes: Promise<void> = Promise.resolve();
  private restoring: Promise<boolean> | null = null;
  private clearing: Promise<void> | null = null;
  private pendingSeals = new Map<number, PackedEvent[]>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snap;

  get recorder(): Recorder | null {
    return this.rec;
  }

  get isDemo(): boolean {
    return !!this.meta?.demo;
  }

  /**
   * Live step count for platforms without a step-history API (Android counts
   * only while subscribed): kept here, not in screen state, so leaving and
   * re-opening the Record screen mid-run doesn't reset it.
   */
  liveSteps: number | null = null;

  /** Load an unfinished recording from storage (idempotent; safe to call often). */
  restore(): Promise<boolean> {
    if (this.rec) return Promise.resolve(this.rec.status !== 'finished');
    // Never read the log while it's being deleted — that would resurrect a
    // just-saved run as a ghost paused recording.
    if (this.clearing) return this.clearing.then(() => this.restore());
    if (!this.restoring) {
      this.restoring = this.load().finally(() => {
        this.restoring = null;
      });
    }
    return this.restoring;
  }

  private async load(): Promise<boolean> {
    try {
      const raw = await AsyncStorage.getItem(META_KEY);
      if (!raw) return false;
      const meta = JSON.parse(raw) as Meta;
      if (meta?.v !== 1 || typeof meta.startedAt !== 'number') return false;
      if (meta.finished) {
        // saved (or being saved) when the app died — leftovers, not a live run
        await this.clearStorage();
        return false;
      }
      const keys = Array.from({ length: Math.max(1, meta.chunks) }, (_, i) => chunkKey(i));
      const pairs = await AsyncStorage.multiGet(keys);
      const events: RecorderEvent[] = [];
      let last: PackedEvent[] = [];
      for (const [, v] of pairs) {
        const arr = v ? (JSON.parse(v) as unknown[]) : [];
        last = Array.isArray(arr) ? (arr as PackedEvent[]) : [];
        for (const a of last) {
          const ev = unpackEvent(a);
          if (ev) events.push(ev);
        }
      }
      if (this.rec) return true; // a new recording started while we were reading
      this.meta = meta;
      this.rec = replay(meta.sport, meta.startedAt, events, { autoPause: meta.autoPause });
      this.chunk = last;
      this.emit(true);
      return true;
    } catch {
      return false;
    }
  }

  async begin(sport: Sport, opts: { autoPause: boolean; demo?: boolean; now?: number }): Promise<void> {
    if (this.clearing) await this.clearing;
    await this.clearStorage();
    this.pendingSeals.clear();
    const startedAt = opts.now ?? Date.now();
    this.meta = { v: 1, id: newActivityId(startedAt), sport, startedAt, autoPause: opts.autoPause, chunks: 1, demo: !!opts.demo };
    this.rec = new Recorder(sport, startedAt, { autoPause: opts.autoPause });
    this.liveSteps = null;
    this.chunk = [];
    this.dirty = true;
    await this.flush();
    this.emit(true);
  }

  /** Fixes from the location task / watcher / demo feed. */
  ingest(fixes: Fix[]): void {
    // While manually paused the recorder ignores fixes anyway — don't log them
    // (a recording left paused for a day would otherwise fill storage).
    if (!this.rec || this.rec.status !== 'recording' || fixes.length === 0) return;
    const before = this.rec.points.length;
    for (const fix of fixes) this.append({ kind: 'fix', fix });
    this.emit(this.rec.points.length !== before);
    if (Date.now() - this.lastFlush > FLUSH_MS) void this.flush();
  }

  pause(t = Date.now()): void {
    if (!this.rec || this.rec.status !== 'recording') return;
    this.append({ kind: 'pause', t });
    this.emit(false);
    void this.flush();
  }

  resume(t = Date.now()): void {
    if (!this.rec || this.rec.status !== 'paused') return;
    this.append({ kind: 'resume', t });
    this.emit(false);
    void this.flush();
  }

  /**
   * Stop recording and hand back the finished Recorder. The stored log is
   * cleared only by `clear()` — call it after the activity is safely saved.
   */
  finish(): { recorder: Recorder; id: string; demo: boolean } | null {
    if (!this.rec || !this.meta) return null;
    this.rec.finish();
    // Persist the fact, so a kill between "saved" and clear() can't bring the
    // run back as a recording on next launch.
    this.meta = { ...this.meta, finished: true };
    this.dirty = true;
    void this.flush();
    this.emit(false);
    return { recorder: this.rec, id: this.meta.id, demo: this.meta.demo };
  }

  /** Forget the recording entirely (after save, or on discard). */
  clear(): Promise<void> {
    if (this.clearing) return this.clearing;
    this.rec = null;
    this.meta = null;
    this.liveSteps = null;
    this.chunk = [];
    this.pendingSeals.clear();
    this.dirty = false;
    this.version += 1;
    this.snap = IDLE;
    this.listeners.forEach((l) => l());
    this.clearing = this.clearStorage().finally(() => {
      this.clearing = null;
    });
    return this.clearing;
  }

  /** Persist whatever hasn't been written yet. Writes are serialised. */
  flush(): Promise<void> {
    if (!this.dirty || !this.meta) return this.writes;
    const meta = { ...this.meta };
    const chunk = this.chunk.slice();
    // Sealed chunks ride along until a write that contains them succeeds.
    const seals = [...this.pendingSeals.entries()];
    this.dirty = false;
    this.lastFlush = Date.now();
    this.writes = this.writes
      .then(async () => {
        await AsyncStorage.multiSet([
          ...seals.map(([i, c]) => [chunkKey(i), JSON.stringify(c)] as [string, string]),
          [chunkKey(meta.chunks - 1), JSON.stringify(chunk)],
          [META_KEY, JSON.stringify(meta)],
        ]);
        for (const [i, c] of seals) if (this.pendingSeals.get(i) === c) this.pendingSeals.delete(i);
      })
      .catch(() => {
        this.dirty = true; // try again (seals included) on the next flush
      });
    return this.writes;
  }

  private append(ev: RecorderEvent) {
    if (!this.rec || !this.meta) return;
    // Quantise first so a replay of the stored log matches this run exactly.
    const q = quantize(ev);
    this.rec.apply(q);
    if (this.chunk.length >= CHUNK) {
      // seal the full chunk (written with the next flush, retried until it
      // lands) and start a new one
      this.pendingSeals.set(this.meta.chunks - 1, this.chunk);
      this.meta = { ...this.meta, chunks: this.meta.chunks + 1 };
      this.chunk = [];
    }
    this.chunk.push(packEvent(q));
    this.dirty = true;
  }

  private emit(trackChanged: boolean) {
    if (trackChanged) this.version += 1;
    this.snap = this.rec
      ? {
          active: this.rec.status !== 'finished',
          id: this.meta?.id ?? null,
          stats: this.rec.stats(),
          currentPace: this.rec.currentPace(),
          version: this.version,
          demo: !!this.meta?.demo,
        }
      : IDLE;
    this.listeners.forEach((l) => l());
  }

  private async clearStorage() {
    await this.writes.catch(() => {});
    try {
      const keys = await AsyncStorage.getAllKeys();
      const ours = keys.filter((k) => k === META_KEY || k.startsWith('kasya:rec:chunk:v1:'));
      if (ours.length) await AsyncStorage.multiRemove(ours);
    } catch {
      // nothing stored
    }
  }
}

export const session = new RecordingSession();

// Never lose more than a few seconds of a run to the OS killing a backgrounded app.
AppState.addEventListener('change', (s) => {
  if (s !== 'active') void session.flush();
});
