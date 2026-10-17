/** 2D vector + smooth-path helpers shared by the replay body and foot models. Pure. */

export type Pt = { x: number; y: number };

export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const len = (a: Pt) => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt) => len(sub(a, b));
export const unit = (a: Pt): Pt => {
  const l = len(a) || 1e-9;
  return { x: a.x / l, y: a.y / l };
};
export const perp = (a: Pt): Pt => ({ x: -a.y, y: a.x });
export const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
export const mix = (a: Pt, b: Pt, u: number): Pt => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
export const mid = (a: Pt, b: Pt) => mix(a, b, 0.5);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const P = (p: Pt) => `${r4(p.x)},${r4(p.y)}`;

/** Smooth closed path through `pts` (Catmull-Rom → cubic Bézier). */
export function closedCurve(pts: Pt[]): string {
  const n = pts.length;
  if (n < 3) return '';
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
    const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return `${d}Z`;
}

/** Smooth open path through `pts`. */
export function openCurve(pts: Pt[]): string {
  const n = pts.length;
  if (n < 2) return '';
  let d = `M${P(pts[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
    const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
    d += `C${P(c1)} ${P(c2)} ${P(p2)}`;
  }
  return d;
}

/** Straight-edged closed polygon path (for crisp shapes such as a shoe sole). */
export function polygon(pts: Pt[]): string {
  return pts.length < 3 ? '' : `M${pts.map(P).join('L')}Z`;
}
