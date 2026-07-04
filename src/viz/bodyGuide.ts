/**
 * A stylized standing figure used as a "stand here / fit yourself in frame"
 * positioning guide, shown over the camera before recording. Pure geometry so
 * both the web (DOM svg) and native (react-native-svg) scan screens can draw the
 * exact same outline. Coordinates are in the viewBox space below.
 */
export const BODY_GUIDE_VIEWBOX = '0 0 200 460';

export const BODY_GUIDE = {
  /** the head, drawn as a circle */
  head: { cx: 100, cy: 52, r: 30 },
  /** bones, drawn as dashed lines: [x1, y1, x2, y2] */
  lines: [
    [100, 82, 100, 250], // spine
    [58, 120, 142, 120], // shoulders
    [58, 120, 44, 220], // left arm
    [142, 120, 156, 220], // right arm
    [70, 250, 130, 250], // hips
    [70, 250, 60, 430], // left leg
    [130, 250, 140, 430], // right leg
    [60, 430, 46, 444], // left foot
    [140, 430, 154, 444], // right foot
  ] as const,
};
