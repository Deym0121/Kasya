import { PoseFrame, GaitResult } from './types';
import { analyzeGait, gaitSignal } from './ruleEngine';
import { computeFormMetrics, buildFeedback, FormMetrics, GaitFeedback } from './form';
import { analyzeSteps, describeGait, StepAnalysis } from './stepAnalysis';
import { analyzeFrontalDetailed, FrontalAnalysis } from './frontal';

/** Data needed to draw the saved gait graph (never a video). */
export interface GaitGraphData {
  signal: number[];
  steps: number[];
  times: number[];
}

export interface DetailedGait extends GaitResult {
  metrics: FormMetrics;
  feedback: GaitFeedback;
  graph: GaitGraphData;
  steps: StepAnalysis;
  walkthrough: string[];
}

function normalizedSignal(frames: PoseFrame[]): GaitGraphData {
  const sig = gaitSignal(frames);
  let max = 0;
  for (const v of sig.signal) if (v > max) max = v;
  const signal = max > 0 ? sig.signal.map((v) => v / max) : sig.signal.map(() => 0);
  return { signal, steps: sig.stepIndices, times: sig.times };
}

// The smart metrics prefer the per-step analysis (foot-strike based) over the
// coarser whole-signal estimates for overstride, rhythm, and symmetry. Rounded
// to integers here too (matching form.ts) so the UI never shows raw floats.
function smartMetrics(frames: PoseFrame[], steps: StepAnalysis): FormMetrics {
  const base = computeFormMetrics(frames);
  return {
    ...base,
    overstrideScore: Math.round(steps.overstrideScore),
    rhythmRegularityPct: Math.round(steps.rhythmRegularityPct),
    symmetryPct: Math.round(steps.symmetryPct),
  };
}

export function analyzeGaitDetailed(frames: PoseFrame[], goal?: string): DetailedGait {
  const base = analyzeGait(frames);
  const steps = analyzeSteps(frames);
  const metrics = smartMetrics(frames, steps);
  const feedback = buildFeedback(base.cadence.value, base.cadence.confidence, metrics, base.captureQuality.ok, goal);
  const { walkthrough } = describeGait(steps, metrics.verticalOscillationPct, base.cadence.value);
  return { ...base, metrics, feedback, graph: normalizedSignal(frames), steps, walkthrough };
}

function roundFrames(frames: PoseFrame[]): PoseFrame[] {
  return frames.map((f) => ({
    t: Math.round(f.t),
    landmarks: f.landmarks.map((p) => ({
      x: Math.round(p.x * 1000) / 1000,
      y: Math.round(p.y * 1000) / 1000,
      // Keep depth (rounded) so the saved skeleton can drive the rotatable 3D view.
      z: p.z != null ? Math.round(p.z * 1000) / 1000 : undefined,
      visibility: p.visibility != null ? Math.round(p.visibility * 100) / 100 : undefined,
    })),
  }));
}

/** Evenly subsample + round frames so the motion persists for replay without bloat. */
export function downsampleFrames(frames: PoseFrame[], max = 120): PoseFrame[] {
  if (frames.length <= max) return roundFrames(frames);
  const out: PoseFrame[] = [];
  const step = (frames.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) out.push(frames[Math.round(i * step)]);
  return roundFrames(out);
}

/**
 * The rear-view (frontal) pass persisted alongside a report: its analysis plus a
 * downsampled skeleton for the rear-view replay. Never video — only landmarks.
 */
export function buildFrontalDetail(frontalFrames: PoseFrame[]): {
  frontal: FrontalAnalysis;
  frontalFrames: PoseFrame[];
} {
  return {
    frontal: analyzeFrontalDetailed(frontalFrames),
    frontalFrames: downsampleFrames(frontalFrames),
  };
}

/** Everything we persist alongside a report (metrics, feedback, graph, motion, steps). */
export function buildDetail(
  result: GaitResult,
  frames: PoseFrame[],
  goal?: string,
): {
  metrics: FormMetrics;
  feedback: GaitFeedback;
  graph: GaitGraphData;
  frames: PoseFrame[];
  steps: StepAnalysis;
  walkthrough: string[];
} {
  const steps = analyzeSteps(frames);
  const metrics = smartMetrics(frames, steps);
  const feedback = buildFeedback(
    result.cadence.value,
    result.cadence.confidence,
    metrics,
    result.captureQuality.ok,
    goal,
  );
  const { walkthrough } = describeGait(steps, metrics.verticalOscillationPct, result.cadence.value);
  return {
    metrics,
    feedback,
    graph: normalizedSignal(frames),
    frames: downsampleFrames(frames),
    steps,
    walkthrough,
  };
}
