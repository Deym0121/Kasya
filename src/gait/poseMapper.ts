import { Landmark, PoseFrame, LANDMARK_COUNT } from './types';

/** A landmark as emitted by a MediaPipe/BlazePose result (normalized 0..1). */
export interface RawLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}

export interface ToPoseFrameOptions {
  /**
   * Frame width ÷ height of the image the landmarks were normalized against.
   * MediaPipe on the web normalizes x by the frame WIDTH and y by its HEIGHT;
   * passing the aspect multiplies x by it so both axes end up in frame-HEIGHT
   * units — the same isotropic space native capture produces. Without it a
   * 16:9 webcam squashes x by 0.56 against y, skewing anything that mixes the
   * axes (overstride reach ÷ leg length, knee angles, rear-view hip drop).
   * Omit (or 1) when the input is already isotropic.
   */
  aspect?: number;
}

/**
 * Convert one MediaPipe BlazePose result (an array indexed by the 33-landmark
 * topology) into a PoseFrame the gait engine can analyze.
 *
 * Critical contract: the gait engine reads landmarks BY INDEX
 * (frame.landmarks[LANDMARK.LEFT_ANKLE]) and gates capture quality on
 * `visibility`, so we position by index and always populate visibility.
 * Missing landmarks stay {0,0} (never scaled) so viewers can still skip them.
 */
export function toPoseFrame(
  raw: ReadonlyArray<RawLandmark | undefined | null>,
  t: number,
  opts: ToPoseFrameOptions = {},
): PoseFrame {
  const sx = opts.aspect != null && Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : 1;
  const landmarks: Landmark[] = new Array(LANDMARK_COUNT);
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const p = raw[i];
    landmarks[i] = p
      ? { x: p.x * sx, y: p.y, z: p.z, visibility: p.visibility ?? p.presence ?? 1 }
      : { x: 0, y: 0, visibility: 0 };
  }
  return { t, landmarks };
}
