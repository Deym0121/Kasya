/**
 * Domain types for the StrideFit gait core.
 *
 * The core is intentionally pure TypeScript (no React Native imports) so it can
 * be unit-tested in isolation and reused by both the mock and the real
 * (on-device pose) engines. See the re-plan: cadence is the one strongly-validated
 * headline metric; everything else is a hedged "estimate".
 */

/** A single pose landmark in normalized image coordinates (0..1), plus optional depth. */
export interface Landmark {
  /** horizontal position, normalized 0..1 (left→right of frame) */
  x: number;
  /** vertical position, normalized 0..1 (top→bottom of frame) */
  y: number;
  /** optional depth / world-z (model dependent) */
  z?: number;
  /** model confidence / visibility in [0,1] */
  visibility?: number;
}

/**
 * MediaPipe Pose / BlazePose 33-landmark topology indices (the subset gait uses).
 * Chosen over MoveNet because we need a distinct heel landmark for future
 * foot-strike work (gated behind slow-mo, out of MVP).
 */
export const LANDMARK = {
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

/** The full landmark count for a BlazePose frame. */
export const LANDMARK_COUNT = 33;

/** Landmarks that must be visible for a gait measurement to be trustworthy. */
export const KEY_LANDMARKS: number[] = [
  LANDMARK.LEFT_HIP,
  LANDMARK.RIGHT_HIP,
  LANDMARK.LEFT_KNEE,
  LANDMARK.RIGHT_KNEE,
  LANDMARK.LEFT_ANKLE,
  LANDMARK.RIGHT_ANKLE,
];

/** One captured frame: a full set of landmarks plus a timestamp. */
export interface PoseFrame {
  /** timestamp in milliseconds from capture start */
  t: number;
  /** landmarks indexed by the BlazePose topology (length === LANDMARK_COUNT) */
  landmarks: Landmark[];
}

export type Confidence = 'high' | 'medium' | 'low';

/** A single hedged metric value with its unit and a confidence band. */
export interface MetricEstimate {
  value: number;
  unit: string;
  confidence: Confidence;
}

/** Quality assessment of a capture — drives whether we trust/show metrics. */
export interface CaptureQuality {
  /** mean fraction of KEY_LANDMARKS adequately visible across frames, [0,1] */
  visibilityScore: number;
  /** number of full gait cycles (stride = 2 steps) detected */
  gaitCyclesDetected: number;
  /** true when the capture is good enough to surface metrics */
  ok: boolean;
  /** human-readable problems found (empty when ok) */
  issues: string[];
}

/** The structured, privacy-safe result that is persisted (never the video). */
export interface GaitResult {
  /** steps per minute — the headline, strongly-validated metric */
  cadence: MetricEstimate;
  /** number of detected steps over the capture */
  stepCount: number;
  /** capture duration in seconds */
  durationSec: number;
  /** capture quality / trust assessment */
  captureQuality: CaptureQuality;
}
