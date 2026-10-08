import { simulateFixes } from './sim';
import { session } from './session';
import type { Sport } from './types';

/**
 * Demo run: replays a synthetic BGC loop into the live session at 10× speed,
 * so the whole record → splits → map flow can be tried on the web (no GPS
 * with the screen off in a browser) and on a simulator at a desk. Fix
 * timestamps advance one second per fix, so the numbers are realistic.
 */
const SPEED: Record<Sport, number> = { run: 3.1, walk: 1.4, hike: 1.1, ride: 7.5 };
const TICK_MS = 100;

let timer: ReturnType<typeof setInterval> | null = null;

export function startDemoFeed(sport: Sport, startedAt: number): void {
  stopDemoFeed();
  const fixes = simulateFixes({
    startT: startedAt,
    durationSec: 2 * 60 * 60,
    speedMps: SPEED[sport],
    loopM: sport === 'ride' ? 6000 : 2500,
    noiseM: 3,
    hillM: sport === 'hike' ? 25 : 6,
    stops: [{ atSec: 420, durSec: 40 }],
    seed: Math.floor(startedAt / 1000) % 1000,
  });
  let i = 0;
  timer = setInterval(() => {
    const rec = session.recorder;
    if (!rec || rec.status === 'finished' || i >= fixes.length) {
      stopDemoFeed();
      return;
    }
    if (rec.status === 'paused') return; // the demo runner waits for you
    session.ingest([fixes[i++]]);
  }, TICK_MS);
}

export function stopDemoFeed(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export const demoFeedRunning = () => timer != null;
