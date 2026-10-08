import type { Sport } from './types';

/**
 * Spoken text for the per-km voice cue (pure; unit-tested). Written out in
 * words so every TTS voice reads it the same: "Kilometer 3. Pace 5 minutes
 * 32 seconds per kilometer. Time 16 minutes 40 seconds."
 */
export function kmCueText(o: {
  sport: Sport;
  km: number;
  /** pace of the km just completed, s/km */
  splitPaceSec: number | null;
  movingSec: number;
}): string {
  const parts = [`Kilometer ${o.km}.`];
  if (o.splitPaceSec != null && Number.isFinite(o.splitPaceSec) && o.splitPaceSec > 0) {
    if (o.sport === 'ride') {
      const kmh = 3600 / o.splitPaceSec;
      parts.push(`Speed ${kmh.toFixed(1)} kilometers per hour.`);
    } else {
      parts.push(`Pace ${spokenDuration(o.splitPaceSec)} per kilometer.`);
    }
  }
  parts.push(`Time ${spokenDuration(o.movingSec)}.`);
  return parts.join(' ');
}

/** 3725 → "1 hour 2 minutes 5 seconds"; 332 → "5 minutes 32 seconds". */
export function spokenDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const out: string[] = [];
  if (h) out.push(unit(h, 'hour'));
  if (m) out.push(unit(m, 'minute'));
  if (sec || out.length === 0) out.push(unit(sec, 'second'));
  return out.join(' ');
}
