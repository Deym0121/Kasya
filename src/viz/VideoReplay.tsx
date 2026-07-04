import type { PoseFrame } from '../gait/types';

/**
 * Base type stub for the platform-specific video replay. At runtime Metro resolves
 * VideoReplay.web.tsx (DOM <video> + canvas) or VideoReplay.native.tsx (expo-video
 * + svg); this file exists only so tsc can type the shared import. It is never
 * bundled when a platform-specific file is present.
 */
export function VideoReplay(_props: { videoUri: string; frames: PoseFrame[]; height?: number }): null {
  return null;
}
