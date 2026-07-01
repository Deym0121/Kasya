export * from './types';
export * from './GaitEngine';
export { MockGaitEngine } from './MockGaitEngine';
export { LivePoseGaitEngine } from './LivePoseGaitEngine';
export {
  analyzeGait,
  computeCadence,
  assessCaptureQuality,
  gaitSignal,
  type CadenceResult,
} from './ruleEngine';
export { toPoseFrame, type RawLandmark } from './poseMapper';
export { makeSyntheticWalk } from './synthetic';
export { computeFormMetrics, buildFeedback, type FormMetrics, type GaitFeedback } from './form';
export { detectFootEvents, type FootEvents } from './events';
export { analyzeSteps, describeGait, type StepAnalysis } from './stepAnalysis';
export {
  analyzeGaitDetailed,
  downsampleFrames,
  buildDetail,
  type DetailedGait,
  type GaitGraphData,
} from './detailed';

import { GaitEngine } from './GaitEngine';
import { MockGaitEngine } from './MockGaitEngine';

/**
 * The active gait engine used by the app.
 *
 * Phase 0/1 uses the mock so the entire UI runs in Expo Go without any native
 * module. Swap to `new LivePoseGaitEngine()` once the on-device pose spike is
 * green and benchmarked.
 */
export const gaitEngine: GaitEngine = new MockGaitEngine();
