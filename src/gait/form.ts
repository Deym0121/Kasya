import { PoseFrame, LANDMARK } from './types';
import { gaitSignal } from './ruleEngine';
import { isWalkingGoal } from './insights';

/** Hedged, 2D-defensible form estimates derived from the landmark time-series. */
export interface FormMetrics {
  /** hip vertical bounce as a % of leg length (lower = smoother) */
  verticalOscillationPct: number;
  /** knee bend range through the stride, degrees */
  kneeFlexionRangeDeg: number;
  /** 0..100, higher = feet land further ahead of the hips (more overstriding) */
  overstrideScore: number;
  /** 0..100, higher = steadier step rhythm */
  rhythmRegularityPct: number;
  /** 0..100, higher = left/right look more alike */
  symmetryPct: number;
}

export interface GaitFeedback {
  summary: string;
  observations: string[];
  recommendations: string[];
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const span = (a: number[]) => {
  if (!a.length) return 0;
  let mn = Infinity;
  let mx = -Infinity;
  for (const v of a) {
    if (v < mn) mn = v;
    if (v > mx) mx = v;
  }
  return mx - mn;
};
const p90 = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(0.9 * (s.length - 1))];
};

function angleDeg(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const v1x = ax - bx;
  const v1y = ay - by;
  const v2x = cx - bx;
  const v2y = cy - by;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 0;
  let c = (v1x * v2x + v1y * v2y) / (m1 * m2);
  c = Math.max(-1, Math.min(1, c));
  return (Math.acos(c) * 180) / Math.PI;
}

export function computeFormMetrics(frames: PoseFrame[]): FormMetrics {
  const empty: FormMetrics = {
    verticalOscillationPct: 0,
    kneeFlexionRangeDeg: 0,
    overstrideScore: 0,
    rhythmRegularityPct: 0,
    symmetryPct: 0,
  };
  if (frames.length < 3) return empty;
  const L = LANDMARK;

  const hipY: number[] = [];
  const legLen: number[] = [];
  const kneeL: number[] = [];
  const kneeR: number[] = [];
  const aheadL: number[] = [];
  const aheadR: number[] = [];

  for (const f of frames) {
    const lh = f.landmarks[L.LEFT_HIP];
    const rh = f.landmarks[L.RIGHT_HIP];
    const la = f.landmarks[L.LEFT_ANKLE];
    const ra = f.landmarks[L.RIGHT_ANKLE];
    const lk = f.landmarks[L.LEFT_KNEE];
    const rk = f.landmarks[L.RIGHT_KNEE];
    if (!lh || !rh || !la || !ra || !lk || !rk) continue;

    const hcx = (lh.x + rh.x) / 2;
    hipY.push((lh.y + rh.y) / 2);
    const ll = Math.max(1e-3, (la.y - lh.y + (ra.y - rh.y)) / 2);
    legLen.push(ll);
    kneeL.push(angleDeg(lh.x, lh.y, lk.x, lk.y, la.x, la.y));
    kneeR.push(angleDeg(rh.x, rh.y, rk.x, rk.y, ra.x, ra.y));
    aheadL.push(Math.abs(la.x - hcx) / ll);
    aheadR.push(Math.abs(ra.x - hcx) / ll);
  }

  const verticalOscillationPct = clampPct((span(hipY) / 2 / (mean(legLen) || 1)) * 100);
  const rangeL = span(kneeL);
  const rangeR = span(kneeR);
  const kneeFlexionRangeDeg = Math.round((rangeL + rangeR) / 2);
  const overstrideScore = clampPct(Math.max(p90(aheadL), p90(aheadR)) * 220);

  const { stepIndices, times } = gaitSignal(frames);
  let rhythmRegularityPct = 0;
  if (stepIndices.length >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < stepIndices.length; i++) {
      intervals.push(times[stepIndices[i]] - times[stepIndices[i - 1]]);
    }
    const m = mean(intervals);
    rhythmRegularityPct = clampPct((1 - (m > 0 ? std(intervals) / m : 1)) * 100);
  }

  const denom = Math.max(rangeL, rangeR, 1e-6);
  const symmetryPct = clampPct((1 - Math.abs(rangeL - rangeR) / denom) * 100);

  return {
    verticalOscillationPct: Math.round(verticalOscillationPct * 10) / 10,
    kneeFlexionRangeDeg,
    overstrideScore: Math.round(overstrideScore),
    rhythmRegularityPct: Math.round(rhythmRegularityPct),
    symmetryPct: Math.round(symmetryPct),
  };
}

/**
 * Rule-based, wellness-only coaching. No medical / injury / diagnostic language.
 * `goal` (a scan goal from src/goals.ts) switches the cadence bands: walkers are
 * read against typical walking cadences, not running ones. Omitted = running.
 */
export function buildFeedback(
  cadenceSpm: number,
  confidence: string,
  m: FormMetrics,
  captureOk: boolean,
  goal?: string,
): GaitFeedback {
  if (!captureOk || confidence === 'low') {
    return {
      summary: "We couldn't read your stride clearly enough this time.",
      observations: ['The capture was low quality, so these numbers aren’t reliable.'],
      recommendations: [
        'Record again side-on with your whole body in frame, good lighting, and walk for the full ten seconds.',
      ],
    };
  }

  const obs: string[] = [];
  const rec: string[] = [];
  const spm = Math.round(cadenceSpm);

  if (spm > 0) obs.push(`Your cadence is about ${spm} steps per minute.`);
  if (isWalkingGoal(goal)) {
    // Walkers typically land around 90–130 spm — only nudge well below that.
    if (spm > 0 && spm < 95) {
      rec.push('Many walkers feel smoother with slightly quicker, shorter steps — try nudging your cadence up a little.');
    } else if (spm >= 95 && spm <= 130) {
      obs.push('That’s right in the typical walking range — a comfortable step rate.');
    } else if (spm > 130) {
      obs.push('That’s a brisk pace for walking — nice.');
    }
  } else if (spm > 0 && spm < 160) {
    rec.push('Many people feel smoother with slightly quicker, shorter steps — try nudging your cadence up a little.');
  } else if (spm >= 170) {
    obs.push('That’s a brisk, efficient-feeling step rate — nice.');
  }

  if (m.verticalOscillationPct >= 12) {
    obs.push('You bounce up and down a fair amount as you move.');
    rec.push('Quicker, lighter steps usually reduce that vertical bounce and save energy.');
  } else {
    obs.push('Your vertical bounce looks controlled and smooth.');
  }

  if (m.overstrideScore >= 65) {
    obs.push('Your leading foot tends to land well ahead of your hips (overstriding).');
    rec.push('Try to land with your foot a little closer under your body — it often feels smoother.');
  }

  if (m.rhythmRegularityPct > 0 && m.rhythmRegularityPct < 70) {
    obs.push('Your step rhythm was a little uneven this scan.');
    rec.push('A steady beat (count your steps, or use a metronome) can even out your rhythm.');
  } else if (m.rhythmRegularityPct >= 85) {
    obs.push('Your rhythm was nice and steady.');
  }

  if (m.symmetryPct > 0 && m.symmetryPct < 75) {
    obs.push('Your left and right sides looked a bit different this scan.');
    rec.push('Re-check with a clean side-on capture to confirm the left/right difference.');
  }

  if (m.kneeFlexionRangeDeg > 0) {
    obs.push(`Your knees moved through about ${m.kneeFlexionRangeDeg}° of bend.`);
  }

  if (rec.length === 0) {
    rec.push('Keep it up — your form estimates look solid. Re-scan now and then to track changes.');
  }

  const summary = obs.slice(0, 2).join(' ') || 'Here’s a quick read on your walking form.';
  return { summary, observations: obs, recommendations: rec };
}
