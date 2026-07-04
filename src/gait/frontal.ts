import { PoseFrame, LANDMARK, KEY_LANDMARKS } from './types';
import { median } from './signal';

/**
 * The rear (frontal-plane) view — the second, optional angle. A side-on camera
 * can't see left↔right motion, so this pass adds only the things a view from
 * behind reveals: how level the hips stay, how wide the feet land, side-to-side
 * sway, and left/right symmetry. All hedged, wellness-only estimates.
 *
 * Deliberately NOT here (not defensible from ordinary 2D video, per the re-plan):
 * pronation, foot-strike type, or any support/stability prescription.
 */
export interface FrontalMetrics {
  /** 0..100, how much the pelvis tilts side to side each step (higher = more dip) */
  hipDropPct: number;
  /** base of support: lateral foot separation as a % of hip width */
  stepWidthPct: number;
  /** 0..100, side-to-side sway of the hips as a % of leg length */
  lateralSwayPct: number;
  /** 0..100, higher = the two sides look more alike from behind */
  symmetryPct: number;
}

export interface FrontalFeedback {
  observations: string[];
  recommendations: string[];
}

/** Quality of the rear capture — drives whether we trust/show the frontal read. */
export interface FrontalQuality {
  visibilityScore: number;
  ok: boolean;
  issues: string[];
}

/** Per-foot estimates from the rear view — honest left/right, NOT pronation. */
export interface FrontalSide {
  /** 0..100, how much this foot lifts through the stride (clearance estimate) */
  liftPct: number;
  /** how far this foot lands from the midline, as a % of hip width */
  placementPct: number;
}

export interface FrontalSides {
  left: FrontalSide;
  right: FrontalSide;
}

/** The rear view's contribution to the single, merged report. */
export interface FrontalAnalysis {
  metrics: FrontalMetrics;
  feedback: FrontalFeedback;
  quality: FrontalQuality;
  /** left vs right, so the UI can show a per-foot breakdown */
  sides: FrontalSides;
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
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

const EMPTY_METRICS: FrontalMetrics = {
  hipDropPct: 0,
  stepWidthPct: 0,
  lateralSwayPct: 0,
  symmetryPct: 0,
};

/** Frontal-plane estimates from a rear-view (facing away) landmark series. */
export function analyzeFrontal(frames: PoseFrame[]): FrontalMetrics {
  if (frames.length < 3) return EMPTY_METRICS;
  const L = LANDMARK;

  const hipWidths: number[] = [];
  const legLens: number[] = [];
  const obliquity: number[] = []; // |leftHipY - rightHipY|
  const pelvisX: number[] = [];
  const ankleSep: number[] = [];
  const ankleLiftL: number[] = [];
  const ankleLiftR: number[] = [];

  for (const f of frames) {
    const lh = f.landmarks[L.LEFT_HIP];
    const rh = f.landmarks[L.RIGHT_HIP];
    const la = f.landmarks[L.LEFT_ANKLE];
    const ra = f.landmarks[L.RIGHT_ANKLE];
    if (!lh || !rh || !la || !ra) continue;

    const hw = Math.abs(lh.x - rh.x);
    if (hw > 1e-4) hipWidths.push(hw);
    legLens.push(Math.max(1e-3, (la.y - lh.y + (ra.y - rh.y)) / 2));
    obliquity.push(Math.abs(lh.y - rh.y));
    pelvisX.push((lh.x + rh.x) / 2);
    ankleSep.push(Math.abs(la.x - ra.x));
    ankleLiftL.push(la.y);
    ankleLiftR.push(ra.y);
  }

  if (!hipWidths.length) return EMPTY_METRICS;
  const hipW = median(hipWidths) || 1e-3;
  const legLen = mean(legLens) || 1;

  const hipDropPct = clampPct((p90(obliquity) / hipW) * 100);
  const stepWidthPct = Math.round((median(ankleSep) / hipW) * 100);
  const lateralSwayPct = clampPct((span(pelvisX) / legLen) * 100);

  // Symmetry: how alike the two feet's vertical swing (lift) ranges are.
  const swingL = span(ankleLiftL);
  const swingR = span(ankleLiftR);
  const symDenom = Math.max(swingL, swingR, 1e-6);
  const symmetryPct = clampPct((1 - Math.abs(swingL - swingR) / symDenom) * 100);

  return {
    hipDropPct: Math.round(hipDropPct * 10) / 10,
    stepWidthPct,
    lateralSwayPct: Math.round(lateralSwayPct * 10) / 10,
    symmetryPct: Math.round(symmetryPct),
  };
}

const EMPTY_SIDE: FrontalSide = { liftPct: 0, placementPct: 0 };

/**
 * Honest per-foot estimates from a rear view: how much each foot lifts (vertical
 * ankle excursion) and how far from the midline it lands (base contribution).
 * Deliberately NOT pronation — that isn't defensible from a single phone camera.
 */
export function analyzeFrontalSides(frames: PoseFrame[]): FrontalSides {
  if (frames.length < 3) return { left: { ...EMPTY_SIDE }, right: { ...EMPTY_SIDE } };
  const L = LANDMARK;
  const hipWidths: number[] = [];
  const legLens: number[] = [];
  const laY: number[] = [];
  const raY: number[] = [];
  const laDx: number[] = [];
  const raDx: number[] = [];

  for (const f of frames) {
    const lh = f.landmarks[L.LEFT_HIP];
    const rh = f.landmarks[L.RIGHT_HIP];
    const la = f.landmarks[L.LEFT_ANKLE];
    const ra = f.landmarks[L.RIGHT_ANKLE];
    if (!lh || !rh || !la || !ra) continue;
    const hw = Math.abs(lh.x - rh.x);
    if (hw > 1e-4) hipWidths.push(hw);
    legLens.push(Math.max(1e-3, (la.y - lh.y + (ra.y - rh.y)) / 2));
    const mid = (lh.x + rh.x) / 2;
    laY.push(la.y);
    raY.push(ra.y);
    laDx.push(Math.abs(la.x - mid));
    raDx.push(Math.abs(ra.x - mid));
  }
  if (!hipWidths.length) return { left: { ...EMPTY_SIDE }, right: { ...EMPTY_SIDE } };
  const hipW = median(hipWidths) || 1e-3;
  const legLen = mean(legLens) || 1;
  const side = (yArr: number[], dxArr: number[]): FrontalSide => ({
    liftPct: Math.round(clampPct((span(yArr) / legLen) * 100) * 10) / 10,
    placementPct: Math.round((median(dxArr) / hipW) * 100),
  });
  return { left: side(laY, laDx), right: side(raY, raDx) };
}

/** Is the rear capture good enough to surface frontal estimates? */
export function assessFrontalQuality(frames: PoseFrame[]): FrontalQuality {
  if (frames.length === 0) {
    return { visibilityScore: 0, ok: false, issues: ['No frames captured.'] };
  }

  let totalFraction = 0;
  let hipWidthSeen = 0;
  let hipWidthCount = 0;
  for (const f of frames) {
    let visible = 0;
    for (const idx of KEY_LANDMARKS) {
      const lm = f.landmarks[idx];
      if (lm && (lm.visibility ?? 0) >= 0.5) visible++;
    }
    totalFraction += visible / KEY_LANDMARKS.length;
    const lh = f.landmarks[LANDMARK.LEFT_HIP];
    const rh = f.landmarks[LANDMARK.RIGHT_HIP];
    if (lh && rh) {
      hipWidthSeen += Math.abs(lh.x - rh.x);
      hipWidthCount++;
    }
  }
  const visibilityScore = totalFraction / frames.length;
  const meanHipWidth = hipWidthCount ? hipWidthSeen / hipWidthCount : 0;

  const issues: string[] = [];
  if (visibilityScore < 0.6) {
    issues.push('Body not clearly visible — improve lighting and keep your whole body in frame.');
  }
  if (frames.length < 15) {
    issues.push('Not enough captured — walk away from the camera for the full recording.');
  }
  if (meanHipWidth < 0.02) {
    issues.push('Stand facing away from the camera so your hips and shoulders are square to it.');
  }

  return { visibilityScore, ok: issues.length === 0, issues };
}

/** Rule-based, wellness-only read of the rear view. No medical / diagnostic language. */
export function buildFrontalFeedback(m: FrontalMetrics, ok: boolean): FrontalFeedback {
  if (!ok) {
    return {
      observations: ['The rear view wasn’t clear enough to read this time.'],
      recommendations: [
        'Record again facing away from the camera, whole body in frame, and walk for the full recording.',
      ],
    };
  }

  const obs: string[] = [];
  const rec: string[] = [];

  if (m.hipDropPct >= 22) {
    obs.push('Your hips dip from side to side a fair amount as you step.');
    rec.push('Gentle hip and glute strengthening often helps steady the hips over each step.');
  } else {
    obs.push('Your hips stay fairly level from step to step.');
  }

  if (m.stepWidthPct >= 130) {
    obs.push('Your feet land quite wide apart.');
  } else if (m.stepWidthPct > 0 && m.stepWidthPct <= 45) {
    obs.push('Your feet land close to a narrow line (a fairly narrow base).');
    rec.push('A slightly wider foot placement can feel more stable for some people.');
  } else if (m.stepWidthPct > 0) {
    obs.push('Your feet land about hip-width apart — a balanced base.');
  }

  if (m.lateralSwayPct >= 14) {
    obs.push('You sway a little from side to side as you move.');
    rec.push('Quicker, lighter steps and a tall posture usually calm side-to-side sway.');
  }

  if (m.symmetryPct > 0 && m.symmetryPct < 80) {
    obs.push('Your left and right sides looked a bit different from behind this scan.');
    rec.push('Re-check with a clean rear-view capture to confirm the left/right difference.');
  } else if (m.symmetryPct >= 90) {
    obs.push('Your two sides looked nicely balanced from behind.');
  }

  if (rec.length === 0) {
    rec.push('Your rear-view estimates look solid — nothing stands out to change.');
  }
  return { observations: obs, recommendations: rec };
}

/** Full frontal (rear-view) pass: metrics + quality + wellness feedback. */
export function analyzeFrontalDetailed(frames: PoseFrame[]): FrontalAnalysis {
  const metrics = analyzeFrontal(frames);
  const quality = assessFrontalQuality(frames);
  const feedback = buildFrontalFeedback(metrics, quality.ok);
  const sides = analyzeFrontalSides(frames);
  return { metrics, feedback, quality, sides };
}

/** One-line, merged summary of the rear view for the combined result. */
export function frontalSummary(m: FrontalMetrics): string {
  const parts: string[] = [];
  parts.push(m.hipDropPct >= 22 ? 'hips dip a bit side to side' : 'hips stay level');
  if (m.stepWidthPct > 0) {
    parts.push(
      m.stepWidthPct >= 130
        ? 'a wide base'
        : m.stepWidthPct <= 45
          ? 'a narrow base'
          : 'a balanced, hip-width base',
    );
  }
  if (m.symmetryPct > 0) {
    parts.push(m.symmetryPct >= 80 ? 'balanced left/right' : 'some left/right difference');
  }
  return `From behind: ${parts.join(', ')}.`;
}
