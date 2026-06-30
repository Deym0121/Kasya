import { Landmark, PoseFrame, LANDMARK_COUNT } from './types';

/** A landmark as emitted by a MediaPipe/BlazePose result (normalized 0..1). */
export interface RawLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

/**
 * Convert one MediaPipe BlazePose result (an array indexed by the 33-landmark
 * topology) into a PoseFrame the gait engine can analyze.
 *
 * Critical contract: the gait engine reads landmarks BY INDEX
 * (frame.landmarks[LANDMARK.LEFT_ANKLE]) and gates capture quality on
 * `visibility`, so we position by index and always populate visibility.
 */
export function toPoseFrame(raw: ReadonlyArray<RawLandmark | undefined | null>, t: number): PoseFrame {
  const landmarks: Landmark[] = new Array(LANDMARK_COUNT);
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const p = raw[i];
    landmarks[i] = p
      ? { x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? p.presence ?? 1 }
      : { x: 0, y: 0, visibility: 0 };
  }
  return { t, landmarks };
}
