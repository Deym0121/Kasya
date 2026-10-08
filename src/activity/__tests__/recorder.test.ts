import { describe, it, expect } from 'vitest';
import { Recorder, replay, liveMovingSec, type RecorderEvent } from '../recorder';
import { simulateFixes, simulatedDistance } from '../sim';
import { haversine } from '../geo';
import type { Fix } from '../types';

const feed = (r: Recorder, fixes: Fix[]) => fixes.forEach((f) => r.addFix(f));

describe('Recorder — distance and moving time', () => {
  it('measures a clean 20-minute run within 2% of the true path', () => {
    const opts = { durationSec: 1200, speedMps: 3, noiseM: 3 };
    const r = new Recorder('run', 0);
    feed(r, simulateFixes(opts));
    const truth = simulatedDistance(opts);
    expect(Math.abs(r.distanceM - truth) / truth).toBeLessThan(0.02);
    expect(r.movingSec).toBeGreaterThan(1190);
    expect(r.movingSec).toBeLessThanOrEqual(1200);
  });

  it('keeps distance honest under heavy GPS noise (no zig-zag inflation)', () => {
    const opts = { durationSec: 1200, speedMps: 3, noiseM: 8, seed: 3 };
    const r = new Recorder('run', 0);
    feed(r, simulateFixes(opts));
    const truth = simulatedDistance(opts);
    expect(Math.abs(r.distanceM - truth) / truth).toBeLessThan(0.05);
  });

  it('works without OS doppler speed (window speed fallback)', () => {
    const opts = { durationSec: 900, speedMps: 2.8, noiseM: 3, withSpeed: false };
    const r = new Recorder('run', 0);
    feed(r, simulateFixes(opts));
    const truth = simulatedDistance(opts);
    expect(Math.abs(r.distanceM - truth) / truth).toBeLessThan(0.03);
  });
});

describe('Recorder — auto-pause', () => {
  const opts = { durationSec: 900, speedMps: 3, noiseM: 3, stops: [{ atSec: 300, durSec: 120 }] };

  it('stops the moving clock at a traffic light and resumes after', () => {
    const r = new Recorder('run', 0);
    feed(r, simulateFixes(opts));
    // 900 s elapsed, 120 s stopped → ~780 s moving (detection lag adds a few)
    expect(r.movingSec).toBeGreaterThan(770);
    expect(r.movingSec).toBeLessThan(795);
    expect(r.autoPaused).toBe(false);
  });

  it('adds no phantom distance while standing still', () => {
    const r = new Recorder('run', 0);
    feed(r, simulateFixes(opts));
    const truth = simulatedDistance(opts);
    expect(Math.abs(r.distanceM - truth) / truth).toBeLessThan(0.02);
  });

  it('counts the whole stop as moving time when auto-pause is off', () => {
    const r = new Recorder('run', 0, { autoPause: false });
    feed(r, simulateFixes(opts));
    expect(r.movingSec).toBeGreaterThan(895);
  });

  it('is auto-paused in the middle of a long stop', () => {
    const r = new Recorder('run', 0);
    const fixes = simulateFixes(opts);
    feed(r, fixes.slice(0, 380));
    expect(r.autoPaused).toBe(true);
  });
});

describe('Recorder — manual pause', () => {
  it('ignores fixes while paused and never bridges the gap', () => {
    const fixes = simulateFixes({ durationSec: 600, speedMps: 3, noiseM: 2 });
    const r = new Recorder('run', 0);
    feed(r, fixes.slice(0, 200));
    const before = r.distanceM;
    r.pause();
    feed(r, fixes.slice(200, 400)); // walked 600 m while paused
    expect(r.distanceM).toBe(before);
    r.resume();
    feed(r, fixes.slice(400));
    // ~200 s + ~200 s of running counted; the paused 200 s is not
    expect(r.distanceM).toBeGreaterThan(1100);
    expect(r.distanceM).toBeLessThan(1300);
    const segs = new Set(r.points.map((p) => p.seg));
    expect(segs.size).toBe(2);
  });
});

describe('Recorder — fix filtering', () => {
  it('drops inaccurate fixes, teleports, duplicates and out-of-order fixes', () => {
    const fixes = simulateFixes({ durationSec: 120, speedMps: 3, noiseM: 2 });
    const r = new Recorder('run', 0);
    const bad: Fix[] = [
      { ...fixes[10], t: fixes[10].t + 500, acc: 80 }, // inaccurate
      { ...fixes[20], t: fixes[20].t + 500, lat: fixes[20].lat + 0.01 }, // ~1.1 km jump in 0.5 s
      { ...fixes[30] }, // duplicate timestamp
    ];
    const stream = [...fixes.slice(0, 40), ...bad, ...fixes.slice(40)];
    feed(r, stream);
    const clean = new Recorder('run', 0);
    feed(clean, fixes);
    expect(Math.abs(r.distanceM - clean.distanceM)).toBeLessThan(5);
  });

  it('accepts a big jump after a long GPS gap (tunnel) as real travel', () => {
    const fixes = simulateFixes({ durationSec: 400, speedMps: 3, noiseM: 2 });
    const r = new Recorder('run', 0);
    feed(r, [...fixes.slice(0, 100), ...fixes.slice(160)]); // 60 s with no GPS
    const full = new Recorder('run', 0);
    feed(full, fixes);
    // the straight chord across the gap is a bit shorter than the curve, but close
    expect(r.distanceM / full.distanceM).toBeGreaterThan(0.95);
    expect(r.movingSec).toBeGreaterThan(390);
  });
});

describe('Recorder — elevation', () => {
  it('counts the climb of a hill loop and ignores altitude noise on the flat', () => {
    const flat = new Recorder('run', 0);
    feed(flat, simulateFixes({ durationSec: 900, speedMps: 3, hillM: 0 }));
    expect(flat.elevGainM).toBeLessThan(6);

    const hilly = new Recorder('run', 0);
    // 2700 m at 3 m/s on a 2500 m loop with a ±15 m hill → one ~30 m climb
    hilly.elevGainM = 0;
    feed(hilly, simulateFixes({ durationSec: 900, speedMps: 3, hillM: 15 }));
    expect(hilly.elevGainM).toBeGreaterThan(20);
    expect(hilly.elevGainM).toBeLessThan(45);
  });
});

describe('Recorder — replay (crash recovery)', () => {
  it('rebuilds the identical state from the event log', () => {
    const fixes = simulateFixes({ durationSec: 700, speedMps: 3, noiseM: 4, stops: [{ atSec: 200, durSec: 60 }] });
    const log: RecorderEvent[] = [];
    const live = new Recorder('run', 0);
    const push = (ev: RecorderEvent) => {
      log.push(ev);
      live.apply(ev);
    };
    fixes.slice(0, 350).forEach((fix) => push({ kind: 'fix', fix }));
    push({ kind: 'pause', t: fixes[350].t });
    fixes.slice(350, 400).forEach((fix) => push({ kind: 'fix', fix }));
    push({ kind: 'resume', t: fixes[400].t });
    fixes.slice(400).forEach((fix) => push({ kind: 'fix', fix }));

    const rebuilt = replay('run', 0, log);
    expect(rebuilt.distanceM).toBe(live.distanceM);
    expect(rebuilt.movingSec).toBe(live.movingSec);
    expect(rebuilt.elevGainM).toBe(live.elevGainM);
    expect(rebuilt.points).toEqual(live.points);
  });
});

describe('currentPace / liveMovingSec', () => {
  it('reports the recent pace close to the true pace', () => {
    const opts = { durationSec: 300, speedMps: 3.333, noiseM: 2 };
    const r = new Recorder('run', 0);
    feed(r, simulateFixes(opts));
    // the loop's true speed varies along the ellipse — measure the truth over the same 30 s
    const clean = simulateFixes({ ...opts, noiseM: 0 }).slice(-31);
    let d = 0;
    for (let i = 1; i < clean.length; i++) d += haversine(clean[i - 1].lat, clean[i - 1].lon, clean[i].lat, clean[i].lon);
    const truePace = 30 / (d / 1000);
    const pace = r.currentPace();
    expect(pace).not.toBeNull();
    expect(Math.abs(pace! - truePace) / truePace).toBeLessThan(0.1);
  });

  it('extrapolates the timer between fixes but caps a GPS dropout', () => {
    const s = { ...new Recorder("run", 0).stats(), movingSec: 100, movingAsOf: 1_000_000 };
    expect(liveMovingSec(s, 1_000_000 + 3_000)).toBeCloseTo(103);
    expect(liveMovingSec(s, 1_000_000 + 60_000)).toBeCloseTo(115);
    expect(liveMovingSec({ ...s, status: 'paused' }, 1_000_000 + 3_000)).toBe(100);
  });
});
