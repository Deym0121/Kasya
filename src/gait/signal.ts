/** Small, dependency-free numeric helpers used by the gait rule engine. */

export interface FindPeaksOptions {
  /** ignore local maxima below this value */
  minHeight?: number;
  /** minimum index spacing between accepted peaks (refractory); taller wins */
  minDistance?: number;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Return the indices of local maxima in `signal`.
 *
 * Plateau-aware: a flat top that the signal rises into and then falls out of
 * counts as a single peak at the plateau's center. This matters because a
 * sampled sinusoid's true peak often lands exactly between two equal samples,
 * which a naive strict-greater-than test would miss entirely.
 *
 * - `minHeight`: drop peaks below this value.
 * - `minDistance`: when two peaks are closer than this, keep only the taller.
 */
export function findPeaks(signal: number[], options: FindPeaksOptions = {}): number[] {
  const { minHeight, minDistance = 1 } = options;
  const peaks: number[] = [];
  const n = signal.length;

  let i = 1;
  while (i < n) {
    if (signal[i] > signal[i - 1]) {
      // Strictly rising into i; extend across any equal-valued flat top.
      let j = i;
      while (j + 1 < n && signal[j + 1] === signal[i]) j++;

      // A peak only if the signal then falls (ignore plateaus at the end).
      if (j + 1 < n && signal[j + 1] < signal[i]) {
        const idx = Math.floor((i + j) / 2);
        const v = signal[idx];
        if (minHeight === undefined || v >= minHeight) {
          const last = peaks[peaks.length - 1];
          if (last !== undefined && idx - last < minDistance) {
            if (v > signal[last]) peaks[peaks.length - 1] = idx; // too close: keep the taller
          } else {
            peaks.push(idx);
          }
        }
      }
      i = j + 1;
    } else {
      i++;
    }
  }

  return peaks;
}
