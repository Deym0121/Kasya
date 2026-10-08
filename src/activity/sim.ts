import { haversine, metresPerDegree } from './geo';
import type { Fix } from './types';

/**
 * Deterministic synthetic GPS for tests and the web demo run: a smooth loop
 * (BGC, Taguig by default) sampled at 1 Hz with seeded noise, optional stops
 * and a gentle hill. No randomness leaks in — same options, same fixes.
 */
export interface SimOptions {
  startT?: number;
  center?: [number, number];
  /** loop circumference in metres */
  loopM?: number;
  speedMps?: number;
  durationSec: number;
  /** horizontal noise std-dev (m); fixes report this as their accuracy */
  noiseM?: number;
  /**
   * Second-to-second correlation of the noise (0 = white jitter, 0.95 ≈ real
   * phone GPS, whose error drifts slowly rather than jumping every fix).
   */
  noiseCorrelation?: number;
  /** stand still for durSec starting at atSec (elapsed seconds) */
  stops?: { atSec: number; durSec: number }[];
  /** amplitude of a sinusoidal hill along the loop (m) */
  hillM?: number;
  seed?: number;
  /** report OS doppler speed on each fix (iOS does; some Androids don't) */
  withSpeed?: boolean;
}

export function simulateFixes(o: SimOptions): Fix[] {
  const startT = o.startT ?? Date.UTC(2026, 9, 8, 22, 0, 0);
  const [cLat, cLon] = o.center ?? [14.5507, 121.051];
  const loopM = o.loopM ?? 2500;
  const speed = o.speedMps ?? 3;
  const noise = o.noiseM ?? 3;
  const hill = o.hillM ?? 0;
  const rand = mulberry32(o.seed ?? 7);
  const k = metresPerDegree(cLat);
  // An ellipse with a wobble, so it isn't a perfect circle on the map.
  const rx = loopM / (2 * Math.PI) * 1.25;
  const ry = loopM / (2 * Math.PI) * 0.8;

  const rho = o.noiseCorrelation ?? 0.95;
  const innov = Math.sqrt(1 - rho * rho);
  let ex = gauss(rand) * noise;
  let ey = gauss(rand) * noise;

  const out: Fix[] = [];
  let travelled = 0;
  for (let sec = 0; sec <= o.durationSec; sec++) {
    const stopped = (o.stops ?? []).some((s) => sec >= s.atSec && sec < s.atSec + s.durSec);
    if (sec > 0 && !stopped) travelled += speed;
    const theta = (travelled / loopM) * 2 * Math.PI;
    const wob = 1 + 0.06 * Math.sin(theta * 5);
    if (sec > 0) {
      ex = rho * ex + innov * gauss(rand) * noise;
      ey = rho * ey + innov * gauss(rand) * noise;
    }
    const x = rx * wob * Math.cos(theta) + ex;
    const y = ry * wob * Math.sin(theta) + ey;
    out.push({
      t: startT + sec * 1000,
      lat: cLat + y / k.lat,
      lon: cLon + x / k.lon,
      alt: 20 + hill * Math.sin(theta) + gauss(rand) * 1.5,
      acc: Math.max(3, noise),
      altAcc: 6,
      speed: o.withSpeed === false ? null : stopped ? Math.abs(gauss(rand) * 0.15) : Math.max(0, speed + gauss(rand) * 0.2),
    });
  }
  return out;
}

/** True length of the noiseless path the simulator travels, for assertions. */
export function simulatedDistance(o: SimOptions): number {
  const clean = simulateFixes({ ...o, noiseM: 0 });
  let d = 0;
  for (let i = 1; i < clean.length; i++) {
    d += haversine(clean[i - 1].lat, clean[i - 1].lon, clean[i].lat, clean[i].lon);
  }
  return d;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
