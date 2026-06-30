import { PoseFrame, GaitResult } from './types';

/** Input to a gait engine: the landmark time-series for one capture. */
export interface GaitScanInput {
  frames: PoseFrame[];
}

/**
 * The seam that lets the whole app be built and demoed against mock data while
 * the real on-device pose engine is developed (re-plan Phase 0). Swap
 * MockGaitEngine → LivePoseGaitEngine without touching any screen.
 */
export interface GaitEngine {
  readonly name: string;
  analyze(input: GaitScanInput): Promise<GaitResult>;
}
