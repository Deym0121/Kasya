export * from './types';
export * from './GaitEngine';
export { MockGaitEngine } from './MockGaitEngine';
export { LivePoseGaitEngine } from './LivePoseGaitEngine';
export {
  analyzeGait,
  computeCadence,
  assessCaptureQuality,
  type CadenceResult,
} from './ruleEngine';

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
