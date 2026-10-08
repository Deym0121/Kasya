import type { PoseFrame } from '../gait/types';

/**
 * The SVG viewBox for replaying a saved skeleton. Saved frames are isotropic —
 * both axes in units of the capture frame's HEIGHT — so y always spans 0..1
 * while x spans 0..(width/height): about 0..0.56 for a portrait phone, up to
 * ~1.78 for a landscape webcam (and 0..1 for older web reports saved
 * frame-normalized). A fixed "0 0 1 1" box therefore pinned portrait captures
 * to the left and would crop landscape ones; instead this centres the box on
 * where the body actually moved, widening it only when the motion needs more
 * than one unit of width. Pure (no RN imports) so it's unit-tested in node.
 */
export function skeletonViewBox(frames: PoseFrame[]): { minX: number; minY: number; width: number; height: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const f of frames ?? []) {
    for (const p of f.landmarks) {
      // Dropped landmarks are stored as {x:0,y:0,visibility:0} — never count those.
      if (!p || (p.visibility ?? 1) <= 0.2 || (p.x === 0 && p.y === 0) || !Number.isFinite(p.x)) continue;
      if (p.x < lo) lo = p.x;
      if (p.x > hi) hi = p.x;
    }
  }
  if (!(hi >= lo)) return { minX: 0, minY: 0, width: 1, height: 1 };
  const width = Math.max(1, hi - lo + 0.12);
  const minX = (lo + hi) / 2 - width / 2;
  return { minX, minY: 0, width, height: 1 };
}

/** `skeletonViewBox` formatted for an SVG `viewBox` attribute. */
export function skeletonViewBoxAttr(frames: PoseFrame[]): string {
  const b = skeletonViewBox(frames);
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return `${r(b.minX)} ${r(b.minY)} ${r(b.width)} ${r(b.height)}`;
}
