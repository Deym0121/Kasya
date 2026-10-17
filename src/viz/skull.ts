import { add, clamp, closedCurve, mul, openCurve, type Pt } from './geometry';

/**
 * An anatomical skull for the replay: cranium, mandible, orbits, nasal
 * aperture, cheekbones, teeth and the main sutures — not just an oval.
 *
 * Templates are authored in centimetres of an average adult skull, relative to
 * the ear canal (porion) with the Frankfort plane level: x forward (lateral
 * view) or to the viewer's right (square-on), y down. They're scaled by
 * stature (1 cm ≈ 0.0053 × stature), the face length follows the measured
 * ear → nose distance, and the whole skull tilts with the head.
 */

export interface SkullShapes {
  /** braincase + upper face (filled bone) */
  cranium: string;
  /** lower jaw (filled bone) */
  mandible: string;
  /** zygomatic bones / arches (filled bone, drawn over the cranium) */
  cheeks: string[];
  teeth: string[];
  /** dark openings: orbits, nasal aperture, ear canal */
  holes: string[];
  /** suture lines (open strokes) */
  sutures: string[];
}

type C = [number, number];
const CM = 0.0053; // of stature

// ---------- lateral view (x forward) ----------
const L_CRANIUM: C[] = [
  [-9.3, -1.4], [-9.8, -4.6], [-8.3, -9.1], [-5.0, -12.1], [0, -13.0], [4.5, -12.0], [7.8, -8.6], [8.8, -4.3],
  [8.4, -2.8], [9.5, -0.3], [8.5, 0.6], [9.2, 2.6], [8.7, 4.3], [8.8, 5.3], [4.6, 4.8], [3.5, 3.6], [2.4, 2.0],
  [0.6, 1.8], [-0.5, 3.0], [-3.4, 2.1], [-7.4, 1.1],
];
const L_MANDIBLE: C[] = [
  [1.0, -0.2], [1.8, 0.4], [2.5, 2.5], [3.9, 1.4], [3.8, 4.4], [5.0, 5.6], [8.6, 5.5], [8.4, 6.3], [8.1, 7.6],
  [8.5, 9.3], [7.4, 10.4], [4.0, 8.7], [0.9, 7.5], [0.2, 5.0], [0.4, 1.5],
];
const L_ZYGOMA: C[] = [[1.3, -0.6], [4.4, -0.9], [6.0, -1.9], [6.7, 0.5], [5.7, 1.7], [4.3, 0.7], [1.5, 0.5]];
const L_ORBIT: C[] = [[6.0, -3.4], [7.6, -3.6], [8.3, -1.9], [7.8, -0.3], [6.4, -0.2], [5.9, -1.8]];
const L_NASAL: C[] = [[8.6, -0.2], [9.1, 0.5], [8.9, 2.1], [8.4, 1.8], [8.2, 0.6]];
const L_SUTURES: C[][] = [
  [[4.3, -12.1], [3.3, -8.4], [2.7, -4.6]], // coronal
  [[-5.1, -12.0], [-6.9, -6.4], [-7.6, -2.6]], // lambdoid
  [[-3.6, -1.6], [-1.5, -4.4], [1.6, -4.6], [3.2, -2.4]], // squamosal
];

// ---------- square-on (x to the viewer's right) ----------
const mirror = (half: C[]): C[] => [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as C)];
// Right half from the top of the head around to the midline under the teeth.
const F_CRANIUM = mirror([
  [0, -13.0], [4.8, -11.6], [6.9, -8.0], [7.2, -4.0], [6.6, -0.6], [6.9, 0.6], [5.0, 3.0], [3.1, 4.8], [0, 5.4],
]);
const F_MANDIBLE = mirror([[0, 10.5], [1.9, 10.0], [4.6, 7.2], [4.9, 3.0], [4.2, 4.2], [3.0, 5.7], [0, 6.0]]);
const R_CRANIUM = mirror([
  [0, -13.0], [4.8, -11.6], [6.9, -8.0], [7.2, -4.0], [6.6, -0.4], [5.6, 1.8], [4.6, 3.0], [2.6, 1.8], [0, 2.4],
]);
const F_ORBIT: C[] = [[1.6, -3.8], [4.9, -3.6], [5.4, -1.6], [4.6, -0.2], [1.8, -0.2], [1.3, -2.0]];
const F_NASAL: C[] = [[0, -0.6], [1.1, 1.2], [1.0, 2.8], [0, 3.3], [-1.0, 2.8], [-1.1, 1.2]];
const F_CHEEK: C[] = [[5.5, -1.1], [6.6, 0.4], [5.4, 2.0], [3.9, 1.7], [4.3, 0.3]];

export function skullShapes(opts: {
  /** ear canal (or the midpoint of both ears square-on) */
  anchor: Pt;
  /** head tilt, degrees (same as the head outline) */
  tilt: number;
  stature: number;
  /** +1 facing right of frame, −1 left */
  facing: 1 | -1;
  /** 0 = pure side view … 1 = square-on */
  frontness: number;
  /** measured ear → nose distance (frame units), if known */
  face?: number | null;
  /** square-on only: true when the face is toward the camera, false for a back view */
  faceToCamera?: boolean;
}): SkullShapes {
  const { anchor, stature: H, facing, frontness } = opts;
  const k = CM * H;
  const rad = (opts.tilt * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const lateral = frontness < 0.55;
  // Face length follows the measured ear → nose distance (≈ 0.065 × stature).
  const faceScale = opts.face ? clamp(opts.face / (0.065 * H), 0.85, 1.2) : 1;
  const sx = lateral ? facing : 1;
  const P = ([x, y]: C): Pt => {
    const lx = sx * x * k * (lateral && x > 0 ? faceScale : 1);
    const ly = y * k;
    return add(anchor, { x: lx * cos - ly * sin, y: lx * sin + ly * cos });
  };
  const closed = (pts: C[]) => closedCurve(pts.map(P));
  const open = (pts: C[]) => openCurve(pts.map(P));
  const tooth = (x0: number, x1: number, y0: number, y1: number) =>
    closed([[x0, y0], [x1, y0], [x1 + (x1 - x0) * 0.05, (y0 + y1) / 2], [x1, y1], [x0, y1], [x0 - (x1 - x0) * 0.05, (y0 + y1) / 2]]);

  if (lateral) {
    const teeth: string[] = [];
    // Upper and lower rows: incisors at the front, molars toward the ramus.
    const xs = [4.9, 5.6, 6.3, 7.0, 7.6, 8.15, 8.65];
    for (let i = 0; i < xs.length - 1; i++) {
      teeth.push(tooth(xs[i] + 0.06, xs[i + 1] - 0.06, 4.6 + i * 0.03, 5.45));
      teeth.push(tooth(xs[i] + 0.06, xs[i + 1] - 0.08, 5.55, 6.2 - i * 0.02));
    }
    const canal = closed([[-0.45, 0], [0, -0.45], [0.45, 0], [0, 0.45]]);
    return {
      cranium: closed(L_CRANIUM),
      mandible: closed(L_MANDIBLE),
      cheeks: [closed(L_ZYGOMA)],
      teeth,
      holes: [closed(L_ORBIT), closed(L_NASAL), canal],
      sutures: L_SUTURES.map(open),
    };
  }

  if (opts.faceToCamera === false) {
    // Seen from behind: occiput, mastoids and the angles of the jaw.
    return {
      cranium: closed(R_CRANIUM),
      mandible: closed(F_MANDIBLE),
      cheeks: [],
      teeth: [],
      holes: [],
      sutures: [open([[0, -13.0], [0, -9.4]]), open([[-6.0, -3.6], [0, -9.4], [6.0, -3.6]])],
    };
  }

  const teeth: string[] = [];
  const xs = [-2.9, -2.15, -1.45, -0.72, 0, 0.72, 1.45, 2.15, 2.9];
  for (let i = 0; i < xs.length - 1; i++) {
    const mid = Math.abs((xs[i] + xs[i + 1]) / 2);
    teeth.push(tooth(xs[i] + 0.05, xs[i + 1] - 0.05, 4.5 + mid * 0.12, 5.5));
    teeth.push(tooth(xs[i] + 0.05, xs[i + 1] - 0.05, 5.6, 6.3 - mid * 0.1));
  }
  const flip = (pts: C[]): C[] => pts.map(([x, y]) => [-x, y]);
  return {
    cranium: closed(F_CRANIUM),
    mandible: closed(F_MANDIBLE),
    cheeks: [closed(F_CHEEK), closed(flip(F_CHEEK))],
    teeth,
    holes: [closed(F_ORBIT), closed(flip(F_ORBIT)), closed(F_NASAL)],
    sutures: [open([[-4.6, -11.6], [0, -12.6], [4.6, -11.6]])],
  };
}

/** Vertebral body (+ spinous process in a side view) as one filled path. */
export function vertebraPath(c: Pt, along: Pt, front: Pt, half: number, depth: number, process: number, drop: number): string {
  const at = (u: number, v: number) => add(c, add(mul(along, u), mul(front, v)));
  const a = half;
  const b = depth;
  const body = closedCurve([
    at(-0.8 * a, b), at(0.8 * a, b), at(a, 0.75 * b), at(a, -0.75 * b),
    at(0.8 * a, -b), at(-0.8 * a, -b), at(-a, -0.75 * b), at(-a, 0.75 * b),
  ]);
  if (process <= 1e-6) return body;
  const spinous = closedCurve([
    at(-0.55 * a, -0.9 * b), at(-0.2 * a + drop * 0.5, -b - process * 0.55), at(drop, -b - process),
    at(drop + 0.35 * a, -b - process * 0.9), at(0.5 * a + drop * 0.4, -b - process * 0.4), at(0.55 * a, -0.9 * b),
  ]);
  return `${body} ${spinous}`;
}
