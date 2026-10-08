import { describe, it, expect } from 'vitest';
import { Recorder, replay } from '../recorder';
import { simulateFixes, simulatedDistance } from '../sim';
import type { Fix } from '../types';

const T0 = Date.UTC(2026, 9, 8, 22, 0, 0);
const feed = (r: Recorder, fixes: Fix[]) => fixes.forEach((f) => r.addFix(f));

describe('Recorder hardening (audit findings)', () => {
  it('ignores Android 0.0 altitude placeholders (no phantom climb)', () => {
    const fixes = simulateFixes({ startT: T0, durationSec: 600, speedMps: 3, noiseM: 3 }).map((f) => ({ ...f, alt: 1600 }));
    // 10 fused fixes with no altitude → Android reports alt 0, altAcc 0
    for (let i = 100; i < 600; i += 50) fixes[i] = { ...fixes[i], alt: 0, altAcc: 0 };
    const r = new Recorder('run', T0);
    feed(r, fixes);
    expect(r.elevGainM).toBeLessThan(5);
  });

  it('does not stay auto-paused when the OS reports speed 0.0 while moving', () => {
    const fixes = simulateFixes({ startT: T0, durationSec: 600, speedMps: 3, noiseM: 3 }).map((f, i) =>
      i > 200 && i < 540 ? { ...f, speed: 0 } : f,
    );
    const r = new Recorder('run', T0);
    feed(r, fixes);
    expect(r.movingSec).toBeGreaterThan(580);
  });

  it('drops a stale cached fix from before Start', () => {
    const fixes = simulateFixes({ startT: T0, durationSec: 300, speedMps: 3, noiseM: 2 });
    const stale: Fix = { ...fixes[0], t: T0 - 20 * 60_000, lat: fixes[0].lat + 0.018 }; // 2 km away, 20 min old
    const r = new Recorder('run', T0);
    feed(r, [stale, ...fixes]);
    const clean = new Recorder('run', T0);
    feed(clean, fixes);
    expect(Math.abs(r.distanceM - clean.distanceM)).toBeLessThan(5);
    expect(Math.abs(r.movingSec - clean.movingSec)).toBeLessThan(2);
  });

  it('re-seeds after a bad first fix instead of locking out good fixes', () => {
    const fixes = simulateFixes({ startT: T0, durationSec: 300, speedMps: 3, noiseM: 2 });
    const bad: Fix = { ...fixes[0], t: T0 + 200, lat: fixes[0].lat + 0.002, acc: 15 }; // ~220 m off
    const r = new Recorder('run', T0);
    feed(r, [bad, ...fixes.slice(1)]);
    const truth = simulatedDistance({ startT: T0, durationSec: 300, speedMps: 3, noiseM: 2 });
    expect(Math.abs(r.distanceM - truth) / truth).toBeLessThan(0.05);
    expect(r.points[0].lat).toBeCloseTo(fixes[5].lat, 3);
  });

  it('does not count climbing done while manually paused', () => {
    const fixes = simulateFixes({ startT: T0, durationSec: 600, speedMps: 3, noiseM: 2 }).map((f, i) => ({
      ...f,
      alt: i < 300 ? 20 : 420, // gondola up 400 m during the pause
    }));
    const r = new Recorder('run', T0);
    feed(r, fixes.slice(0, 250));
    r.pause();
    feed(r, fixes.slice(250, 350));
    r.resume(fixes[350].t);
    feed(r, fixes.slice(350));
    expect(r.elevGainM).toBeLessThan(5);
  });

  it('replay stays exact with resume times', () => {
    const fixes = simulateFixes({ startT: T0, durationSec: 500, speedMps: 3, noiseM: 3 });
    const log = [
      ...fixes.slice(0, 200).map((fix) => ({ kind: 'fix' as const, fix })),
      { kind: 'pause' as const, t: fixes[200].t },
      { kind: 'resume' as const, t: fixes[260].t },
      ...fixes.slice(260).map((fix) => ({ kind: 'fix' as const, fix })),
    ];
    const a = replay('run', T0, log);
    const b = replay('run', T0, log);
    expect(a.points).toEqual(b.points);
    expect(a.distanceM).toBeGreaterThan(1000);
  });
});
