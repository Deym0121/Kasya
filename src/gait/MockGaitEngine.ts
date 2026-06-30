import { GaitEngine, GaitScanInput } from './GaitEngine';
import { GaitResult } from './types';

/**
 * Returns a believable, trustworthy gait result without needing real frames, so
 * every screen / report / paywall can be built and demoed before the on-device
 * pose engine exists. The real engine (LivePoseGaitEngine) implements the same
 * interface.
 */
export class MockGaitEngine implements GaitEngine {
  readonly name = 'mock';

  async analyze(_input: GaitScanInput): Promise<GaitResult> {
    return {
      cadence: { value: 162, unit: 'spm', confidence: 'high' },
      stepCount: 27,
      durationSec: 10,
      captureQuality: {
        visibilityScore: 0.97,
        gaitCyclesDetected: 13,
        ok: true,
        issues: [],
      },
    };
  }
}
