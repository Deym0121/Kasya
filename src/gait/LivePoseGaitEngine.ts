import { GaitEngine, GaitScanInput } from './GaitEngine';
import { GaitResult } from './types';
import { analyzeGait } from './ruleEngine';

/**
 * Real on-device gait engine.
 *
 * The capture layer (react-native-vision-camera + a 33-landmark pose frame
 * processor) streams landmarks into `input.frames` on-device; this engine runs
 * the deterministic rule pass on them. No video file is ever created or stored —
 * only the derived landmark time-series and metrics.
 *
 * Wiring the native pose pipeline is the Phase 0 spike (see the re-plan). Until
 * that lands and is benchmarked on a mid-range Android, the app uses
 * MockGaitEngine, which implements the same interface.
 */
export class LivePoseGaitEngine implements GaitEngine {
  readonly name = 'live-pose';

  async analyze(input: GaitScanInput): Promise<GaitResult> {
    return analyzeGait(input.frames);
  }
}
