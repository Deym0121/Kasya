import { add, clamp, closedCurve, dot, len, mix, mul, openCurve, perp, polygon, sub, unit, type Pt } from './geometry';

/**
 * The foot, drawn as a real foot skeleton (lateral view) and as a running shoe,
 * anchored on BlazePose's heel and toe (foot index) landmarks so it pitches with
 * the foot through heel strike, flat foot and toe-off.
 *
 * Shapes are authored in a foot-local frame: u runs heel → toe tip (0 → 1, along
 * the measured heel→toe line, so it foreshortens naturally when the foot points
 * at the camera) and v runs up from the sole in units of a reference foot length
 * (≈ 15% of stature). The layout follows the bones of an adult foot seen from the
 * outside: calcaneus, talus, navicular, cuboid, cuneiforms, five metatarsals and
 * the phalanges (two in the big toe, three in the others).
 */

export interface FootFrame {
  heel: Pt;
  /** heel → toe tip, full length (u = 1 at the toe tip) */
  along: Pt;
  /** unit vector from the sole toward the ankle */
  up: Pt;
  /** reference foot length for heights/thickness (frame units) */
  ref: number;
}

export function footFrame(
  heel: Pt | null,
  toe: Pt | null,
  ankle: Pt | null,
  stature: number,
  facing: 1 | -1,
  /** 0 = body in profile … 1 = square-on to the camera */
  frontness = 0,
): FootFrame | null {
  if (!heel || !toe) return null;
  const ref = 0.15 * stature;
  let along = sub(toe, heel);
  if (frontness > 0.6) {
    // Square-on the foot points at / away from the camera, so heel → toe is
    // mostly depth: keep it level and foreshortened, turned out the measured way.
    along = { x: (Math.sign(along.x) || facing) * clamp(Math.abs(along.x), 0.22 * ref, 0.5 * ref), y: 0 };
  } else if (len(along) < 0.03 * ref) {
    // Foot pointing straight at / away from the camera: keep a stable frame.
    along = { x: facing * 0.03 * ref, y: 0 };
  }
  let up = perp(unit(along));
  const toAnkle = ankle ? sub(ankle, heel) : { x: 0, y: -1 };
  if (dot(up, toAnkle) < 0) up = mul(up, -1);
  return { heel, along, up, ref };
}

/** Foot-local (u along heel→toe, v up from the sole in reference lengths) → frame units. */
export function footPoint(f: FootFrame, u: number, v: number): Pt {
  return add(add(f.heel, mul(f.along, u)), mul(f.up, v * f.ref));
}

const outline = (f: FootFrame, pts: [number, number][]) => closedCurve(pts.map(([u, v]) => footPoint(f, u, v)));

/** A slim bone between two foot-local points with knobbed ends (widths in reference lengths). */
function tubular(f: FootFrame, a: [number, number], b: [number, number], base: number, shaft: number, head: number): string {
  const pa = footPoint(f, a[0], a[1]);
  const pb = footPoint(f, b[0], b[1]);
  const axis = unit(sub(pb, pa));
  const n = perp(axis);
  const widths = [base, (base + shaft) / 2, shaft, shaft, (shaft + head) / 2, head].map((w) => (w / 2) * f.ref);
  const k = widths.length;
  const st = (i: number) => mix(pa, pb, i / (k - 1));
  const left = widths.map((w, i) => add(st(i), mul(n, w)));
  const right = widths.map((w, i) => sub(st(i), mul(n, w)));
  return closedCurve([...left, add(pb, mul(axis, head * 0.45 * f.ref)), ...right.reverse(), sub(pa, mul(axis, base * 0.45 * f.ref))]);
}

// Tarsal bones, lateral view (u, v).
const CALCANEUS: [number, number][] = [
  [0.0, 0.06], [0.01, 0.14], [0.06, 0.2], [0.14, 0.19], [0.22, 0.2], [0.3, 0.16], [0.34, 0.11], [0.3, 0.06], [0.18, 0.035], [0.06, 0.015],
];
const TALUS: [number, number][] = [
  [0.16, 0.2], [0.19, 0.29], [0.26, 0.33], [0.33, 0.31], [0.39, 0.27], [0.45, 0.25], [0.46, 0.2], [0.4, 0.185], [0.3, 0.2], [0.22, 0.19],
];
const NAVICULAR: [number, number][] = [[0.45, 0.265], [0.5, 0.255], [0.525, 0.2], [0.495, 0.16], [0.455, 0.18]];
const CUBOID: [number, number][] = [[0.33, 0.12], [0.42, 0.15], [0.475, 0.13], [0.465, 0.07], [0.36, 0.06]];
const CUNEIFORM_MEDIAL: [number, number][] = [[0.515, 0.245], [0.575, 0.225], [0.585, 0.145], [0.525, 0.135], [0.505, 0.19]];
const CUNEIFORM_LATERAL: [number, number][] = [[0.48, 0.155], [0.55, 0.155], [0.56, 0.095], [0.48, 0.09]];

// Metatarsals 1→5: base, head, widths (base, shaft, head).
const METATARSALS: [[number, number], [number, number], number, number, number][] = [
  [[0.575, 0.185], [0.8, 0.062], 0.055, 0.03, 0.05],
  [[0.585, 0.16], [0.82, 0.052], 0.042, 0.022, 0.036],
  [[0.565, 0.135], [0.81, 0.046], 0.04, 0.021, 0.034],
  [[0.525, 0.112], [0.79, 0.04], 0.038, 0.02, 0.032],
  [[0.47, 0.092], [0.76, 0.034], 0.046, 0.019, 0.03], // tuberosity at the base
];
// Phalanges per toe as joint chains (big toe has two bones).
const TOES: [number, number][][] = [
  [[0.8, 0.062], [0.905, 0.05], [0.975, 0.045]],
  [[0.82, 0.052], [0.9, 0.042], [0.95, 0.036], [1.0, 0.03]],
  [[0.81, 0.046], [0.885, 0.037], [0.93, 0.032], [0.97, 0.027]],
  [[0.79, 0.04], [0.86, 0.032], [0.9, 0.028], [0.935, 0.024]],
  [[0.76, 0.034], [0.825, 0.028], [0.86, 0.025], [0.89, 0.022]],
];

export interface FootBones {
  /** tarsals + metatarsals (filled bone shapes) */
  bones: string[];
  /** phalanges (small filled bones) */
  toes: string[];
}

export function footBones(f: FootFrame): FootBones {
  const bones = [CALCANEUS, TALUS, NAVICULAR, CUBOID, CUNEIFORM_LATERAL, CUNEIFORM_MEDIAL].map((p) => outline(f, p));
  for (const [a, b, w0, w1, w2] of METATARSALS) bones.push(tubular(f, a, b, w0, w1, w2));
  const toes: string[] = [];
  TOES.forEach((chain, t) => {
    const big = t === 0;
    for (let i = 0; i < chain.length - 1; i++) {
      const w = (big ? 0.042 : 0.03) * (1 - i * 0.18);
      toes.push(tubular(f, chain[i], chain[i + 1], w, w * 0.62, w * 0.85));
    }
  });
  return { bones, toes };
}

export interface Shoe {
  upper: string;
  sole: string;
  laces: string[];
}

/** A running shoe around the foot: upper, a cushioned sole, and laces over the instep. */
export function shoe(f: FootFrame): Shoe {
  const upper = outline(f, [
    [-0.045, 0.03], [-0.055, 0.13], [-0.02, 0.26], [0.09, 0.31], [0.2, 0.3], [0.36, 0.28], [0.55, 0.21],
    [0.74, 0.15], [0.9, 0.11], [1.02, 0.07], [1.055, 0.035], [1.0, 0.005], [0.5, 0.0], [0.0, 0.005],
  ]);
  const sole = polygon(
    ([
      [-0.05, 0.035], [0.25, 0.03], [0.7, 0.025], [1.04, 0.035], [1.065, 0.01], [1.02, -0.03], [0.6, -0.042],
      [0.15, -0.045], [-0.035, -0.035], [-0.06, 0.0],
    ] as [number, number][]).map(([u, v]) => footPoint(f, u, v)),
  );
  const laces: string[] = [];
  for (let i = 0; i < 4; i++) {
    const u = 0.42 + i * 0.075;
    const top = 0.27 - i * 0.03;
    laces.push(openCurve([footPoint(f, u - 0.025, top - 0.02), footPoint(f, u + 0.02, top + 0.005)]));
  }
  return { upper, sole, laces };
}
