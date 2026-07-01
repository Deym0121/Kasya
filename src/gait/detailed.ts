import { PoseFrame, GaitResult } from './types';
import { analyzeGait, gaitSignal } from './ruleEngine';
import { computeFormMetrics, buildFeedback, FormMetrics, GaitFeedback } from './form';

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
}

function normalizedSignal(frames: PoseFrame[]): GaitGraphData {
  const sig = gaitSignal(frames);
  let max = 0;
  for (const v of sig.signal) if (v > max) max = v;
  const signal = max > 0 ? sig.signal.map((v) => v / max) : sig.signal.map(() => 0);
  return { signal, steps: sig.stepIndices, times: sig.times };
}

export function analyzeGaitDetailed(frames: PoseFrame[]): DetailedGait {
  const base = analyzeGait(frames);
  const metrics = computeFormMetrics(frames);
  const feedback = buildFeedback(base.cadence.value, base.cadence.confidence, metrics, base.captureQuality.ok);
  return { ...base, metrics, feedback, graph: normalizedSignal(frames) };
}

function roundFrames(frames: PoseFrame[]): PoseFrame[] {
  return frames.map((f) => ({
    t: Math.round(f.t),
    landmarks: f.landmarks.map((p) => ({
      x: Math.round(p.x * 1000) / 1000,
      y: Math.round(p.y * 1000) / 1000,
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

/** Everything we persist alongside a report (metrics, feedback, graph, motion). */
export function buildDetail(
  result: GaitResult,
  frames: PoseFrame[],
): { metrics: FormMetrics; feedback: GaitFeedback; graph: GaitGraphData; frames: PoseFrame[] } {
  const metrics = computeFormMetrics(frames);
  const feedback = buildFeedback(result.cadence.value, result.cadence.confidence, metrics, result.captureQuality.ok);
  return { metrics, feedback, graph: normalizedSignal(frames), frames: downsampleFrames(frames) };
}
