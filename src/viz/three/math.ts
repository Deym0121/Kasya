/**
 * Small 3D vector toolkit for the replay renderer. Plain objects (no classes)
 * so Hermes keeps them on one hidden class; every function is pure.
 * World space: x = along the walk, y = up, z = toward the camera's side, in
 * units of the subject's stature (a person is 1 unit tall).
 */
export type V3 = { x: number; y: number; z: number };

export const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
export const add3 = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub3 = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const mul3 = (a: V3, k: number): V3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot3 = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross3 = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len3 = (a: V3) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const dist3 = (a: V3, b: V3) => len3(sub3(a, b));
export const norm3 = (a: V3, fallback: V3 = { x: 0, y: 1, z: 0 }): V3 => {
  const l = len3(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l, z: a.z / l } : fallback;
};
export const lerp3 = (a: V3, b: V3, u: number): V3 => ({
  x: a.x + (b.x - a.x) * u,
  y: a.y + (b.y - a.y) * u,
  z: a.z + (b.z - a.z) * u,
});
/** a + b·k */
export const madd3 = (a: V3, b: V3, k: number): V3 => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });

/** The component of `v` perpendicular to unit vector `axis`, normalised. */
export function perpTo(v: V3, axis: V3, fallback: V3): V3 {
  return norm3(madd3(v, axis, -dot3(v, axis)), fallback);
}

/** Rotate `v` about unit `axis` by `angle` radians (Rodrigues). */
export function rotateAbout(v: V3, axis: V3, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = dot3(axis, v) * (1 - c);
  const x = cross3(axis, v);
  return { x: v.x * c + x.x * s + axis.x * k, y: v.y * c + x.y * s + axis.y * k, z: v.z * c + x.z * s + axis.z * k };
}

/**
 * An orthonormal frame: `o` origin, `u` along the segment (up the bone),
 * `f` anterior (front), `s` = f × u (to the body's right for a correctly handed frame).
 */
export interface Frame {
  o: V3;
  u: V3;
  f: V3;
  s: V3;
}

/** Build a frame from an along-axis and a rough front hint. */
export function frameFrom(o: V3, along: V3, frontHint: V3): Frame {
  const u = norm3(along);
  const fallback = Math.abs(u.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
  const f = perpTo(frontHint, u, perpTo(fallback, u, { x: 0, y: 0, z: 1 }));
  return { o, u, f, s: cross3(f, u) };
}

/** World point from frame-local (front, up, side) offsets. */
export function at(fr: Frame, front: number, up: number, side: number): V3 {
  return {
    x: fr.o.x + fr.f.x * front + fr.u.x * up + fr.s.x * side,
    y: fr.o.y + fr.f.y * front + fr.u.y * up + fr.s.y * side,
    z: fr.o.z + fr.f.z * front + fr.u.z * up + fr.s.z * side,
  };
}

/** Blend two frames (normalised lerp of the axes, re-orthonormalised). */
export function blendFrames(a: Frame, b: Frame, t: number): Frame {
  return frameFrom(lerp3(a.o, b.o, t), lerp3(a.u, b.u, t), lerp3(a.f, b.f, t));
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Piecewise-linear lookup in sorted [x, y] stations. */
export function interp(stations: ReadonlyArray<readonly number[]>, x: number): number {
  if (x <= stations[0][0]) return stations[0][1];
  for (let i = 1; i < stations.length; i++) {
    const [x1, y1] = stations[i];
    if (x <= x1) {
      const [x0, y0] = stations[i - 1];
      const u = (x - x0) / (x1 - x0 || 1);
      return y0 + (y1 - y0) * u;
    }
  }
  return stations[stations.length - 1][1];
}

/** Smooth (Catmull-Rom style, monotone-safe enough for body profiles) lookup in sorted stations. */
export function interpSmooth(stations: ReadonlyArray<readonly number[]>, x: number): number {
  const n = stations.length;
  if (x <= stations[0][0]) return stations[0][1];
  if (x >= stations[n - 1][0]) return stations[n - 1][1];
  let i = 1;
  while (i < n - 1 && x > stations[i][0]) i++;
  const [x0, y0] = stations[i - 1];
  const [x1, y1] = stations[i];
  const h = x1 - x0 || 1;
  const t = (x - x0) / h;
  const m0 = i > 1 ? ((y1 - stations[i - 2][1]) / (x1 - stations[i - 2][0])) * h : y1 - y0;
  const m1 = i < n - 1 ? ((stations[i + 1][1] - y0) / (stations[i + 1][0] - x0)) * h : y1 - y0;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
}
