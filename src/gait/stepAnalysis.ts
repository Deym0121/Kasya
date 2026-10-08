import { PoseFrame, LANDMARK } from './types';
import { detectFootEvents } from './events';
import { detectSteps } from './steps';

/** A detailed, per-step read of the walk. All values are hedged estimates. */
export interface StepAnalysis {
  stepCount: number;
  cadenceSpm: number;
  meanStepTimeSec: number;
  rhythmRegularityPct: number;
  /**
   * % of each stride one foot spends on the ground — contact (foot furthest
   * forward) to toe-off (furthest back). A 2D estimate: close to true stance
   * for walking, reads high for running (the ankle keeps travelling back after
   * toe-off). 0 = not measured.
   */
  stanceRatioPct: number;
  /** 0..100, reach of the foot ahead of the hips at contact */
  overstrideScore: number;
  /** knee angle at foot strike, degrees (180 = straight) */
  kneeContactDeg: number;
  /** peak knee bend through the stride, degrees of flexion from straight */
  kneePeakDeg: number;
  symmetryPct: number;
  leadFoot: 'left' | 'right' | 'unknown';
}

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a: number[]) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
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

const hipCenterX = (f: PoseFrame) =>
  (f.landmarks[LANDMARK.LEFT_HIP].x + f.landmarks[LANDMARK.RIGHT_HIP].x) / 2;

const legLen = (f: PoseFrame) =>
  Math.max(
    1e-3,
    (f.landmarks[LANDMARK.LEFT_ANKLE].y - f.landmarks[LANDMARK.LEFT_HIP].y +
      (f.landmarks[LANDMARK.RIGHT_ANKLE].y - f.landmarks[LANDMARK.RIGHT_HIP].y)) / 2,
  );

function kneeAngle(f: PoseFrame, foot: 'left' | 'right'): number {
  const hip = foot === 'left' ? LANDMARK.LEFT_HIP : LANDMARK.RIGHT_HIP;
  const knee = foot === 'left' ? LANDMARK.LEFT_KNEE : LANDMARK.RIGHT_KNEE;
  const ankle = foot === 'left' ? LANDMARK.LEFT_ANKLE : LANDMARK.RIGHT_ANKLE;
  const h = f.landmarks[hip];
  const k = f.landmarks[knee];
  const a = f.landmarks[ankle];
  if (!h || !k || !a) return 0;
  return angleDeg(h.x, h.y, k.x, k.y, a.x, a.y);
}

const tSec = (frames: PoseFrame[], idx: number) => (frames[idx].t - frames[0].t) / 1000;

const EMPTY: StepAnalysis = {
  stepCount: 0,
  cadenceSpm: 0,
  meanStepTimeSec: 0,
  rhythmRegularityPct: 0,
  stanceRatioPct: 0,
  overstrideScore: 0,
  kneeContactDeg: 0,
  kneePeakDeg: 0,
  symmetryPct: 0,
  leadFoot: 'unknown',
};

/**
 * The per-step breakdown. Step timing — count, cadence, step time, rhythm and
 * left/right timing symmetry — comes from the same shared step detection as
 * the headline cadence (steps.ts), so the walkthrough can never quote a step
 * time that contradicts the report's cadence. Per-foot events (events.ts,
 * direction-aware) supply what needs to know WHICH foot and WHEN it lands:
 * stance share, reach at contact and knee angle at contact.
 */
export function analyzeSteps(frames: PoseFrame[]): StepAnalysis {
  if (frames.length < 6) return EMPTY;
  const det = detectSteps(frames);
  if (det.indices.length < 2 || det.cadenceSpm <= 0) return EMPTY;
  const ev = detectFootEvents(frames);
  const contacts = ev.ordered;

  const cadenceSpm = det.cadenceSpm;
  const meanStepTimeSec = 60 / cadenceSpm;
  const stepTimes = det.stepIntervals;
  const m = mean(stepTimes);
  const cv = m > 0 ? std(stepTimes) / m : 1;
  const rhythmRegularityPct = stepTimes.length >= 2 ? clampPct((1 - cv) * 100) : 0;

  // Reach of the landing foot ahead of the hips, in the direction of travel.
  const overs = contacts.map((c) => {
    const f = frames[c.idx];
    const ankle = f.landmarks[c.foot === 'left' ? LANDMARK.LEFT_ANKLE : LANDMARK.RIGHT_ANKLE];
    return Math.max(0, ev.direction[c.idx] * (ankle.x - hipCenterX(f))) / legLen(f);
  });
  const overstrideScore = clampPct(mean(overs) * 220);

  const kneeContactDeg = contacts.length
    ? Math.round(mean(contacts.map((c) => kneeAngle(frames[c.idx], c.foot))))
    : 0;
  let minKnee = 180;
  for (const f of frames) {
    const kl = kneeAngle(f, 'left');
    const kr = kneeAngle(f, 'right');
    if (kl > 0) minKnee = Math.min(minKnee, kl);
    if (kr > 0) minKnee = Math.min(minKnee, kr);
  }
  const kneePeakDeg = Math.round(Math.max(0, 180 - minKnee));

  // Stance share per stride: contact → toe-off over contact → next contact.
  // Strides much longer than the cadence implies span a pause or a turn.
  const strideSec = 120 / cadenceSpm;
  const stanceRatios: number[] = [];
  for (const foot of ['left', 'right'] as const) {
    const { contacts: cs, toeOffs: tos } = ev[foot];
    for (let i = 0; i < cs.length - 1; i++) {
      const c = cs[i];
      const next = cs[i + 1];
      const to = tos.find((x) => x > c && x < next);
      if (to != null) {
        const stride = tSec(frames, next) - tSec(frames, c);
        const stance = tSec(frames, to) - tSec(frames, c);
        if (stride > 0 && stride <= 1.5 * strideSec) stanceRatios.push(clampPct((stance / stride) * 100));
      }
    }
  }
  const stanceRatioPct = stanceRatios.length ? Math.round(mean(stanceRatios)) : 0;

  // Left/right timing: steps starting from one foot's lead vs the other's.
  // (Which sign is "left" doesn't matter for the comparison itself.)
  const aSteps: number[] = [];
  const bSteps: number[] = [];
  det.stepIntervals.forEach((dt, i) => (det.stepIntervalSigns[i] > 0 ? aSteps : bSteps).push(dt));
  const ma = mean(aSteps);
  const mb = mean(bSteps);
  const symmetryPct =
    aSteps.length && bSteps.length ? clampPct((1 - Math.abs(ma - mb) / Math.max(ma, mb, 1e-6)) * 100) : 0;

  // The first step's leading foot: a separation maximum means the left ankle is
  // furthest toward +x, i.e. leading when travelling toward +x.
  const first = det.indices[0];
  const leadFoot: StepAnalysis['leadFoot'] =
    ev.direction.length > first ? (det.signs[0] * ev.direction[first] > 0 ? 'left' : 'right') : 'unknown';

  return {
    stepCount: det.indices.length,
    cadenceSpm,
    meanStepTimeSec,
    // Display scores stored rounded (matching form.ts) so records stay clean.
    rhythmRegularityPct: Math.round(rhythmRegularityPct),
    stanceRatioPct,
    overstrideScore: Math.round(overstrideScore),
    kneeContactDeg,
    kneePeakDeg,
    symmetryPct: Math.round(symmetryPct),
    leadFoot,
  };
}

/**
 * Plain-English, wellness-only walkthrough of what happens during a step.
 * `reportCadenceSpm` is the cadence the report displays — quoting it (rather
 * than re-deriving one from step times) keeps the closing line consistent with
 * the headline. Omitted = no per-minute parenthetical.
 */
export function describeGait(
  a: StepAnalysis,
  verticalOscillationPct: number,
  reportCadenceSpm?: number,
): { summary: string; walkthrough: string[] } {
  if (a.stepCount < 2) {
    return { summary: 'Not enough clear steps to break down — try a longer, side-on capture.', walkthrough: [] };
  }
  const lead = a.leadFoot === 'unknown' ? 'front' : a.leadFoot;
  const reach =
    a.overstrideScore >= 65
      ? 'well ahead of you (that’s overstriding)'
      : a.overstrideScore >= 40
        ? 'a little ahead of you'
        : 'nicely under your body';
  const bounce =
    verticalOscillationPct >= 12 ? 'and your body bounces up and down a fair bit' : 'and your body stays fairly level';
  const rhythm =
    a.rhythmRegularityPct >= 80
      ? ' with a steady rhythm'
      : a.rhythmRegularityPct >= 60
        ? ''
        : ', though your rhythm was a bit uneven';

  // Knee angles read as flexion-from-straight throughout, and only when the
  // sparse capture actually let us estimate them (0 = couldn't estimate).
  const swingKnee = a.kneePeakDeg > 0 ? `, the knee bending toward about ${a.kneePeakDeg}°` : '';
  const contactBendDeg = Math.round(Math.max(0, 180 - a.kneeContactDeg));
  const contactKnee =
    a.kneeContactDeg <= 0
      ? ''
      : contactBendDeg <= 5
        ? `, with the knee nearly straight (about ${contactBendDeg}° of bend) at contact`
        : `, with about ${contactBendDeg}° of knee bend at contact`;
  const stance =
    a.stanceRatioPct > 0
      ? `your weight rolls over the planted foot; each foot spends roughly ${a.stanceRatioPct}% of its stride on the ground (a rough 2D estimate), ${bounce}.`
      : `your weight rolls over the planted foot, ${bounce}.`;
  const perMinute =
    reportCadenceSpm != null && reportCadenceSpm > 0 ? ` (~${Math.round(reportCadenceSpm)} per minute)` : '';

  const walkthrough = [
    `1. Swing — your ${lead} foot lifts off and swings forward${swingKnee}.`,
    `2. Foot strike — it lands ${reach}${contactKnee}.`,
    `3. Stance — ${stance}`,
    `4. Push-off — that foot drives off behind you as the other foot begins its own swing, and the cycle repeats.`,
    `Overall a step lands about every ${a.meanStepTimeSec.toFixed(2)}s${perMinute}${rhythm}.`,
  ];
  return { summary: walkthrough[walkthrough.length - 1], walkthrough };
}
