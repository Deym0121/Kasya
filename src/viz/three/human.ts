import {
  clamp01,
  dist3,
  frameFrom,
  interpSmooth,
  lerp3,
  madd3,
  norm3,
  perpTo,
  smooth,
  sub3,
  blendFrames,
  v3,
  type Frame,
  type V3,
} from './math';
import { blob, hex, limbPath, mixRGBA, tube, withEdges, withMeshCache, type Mat, type Part, type RGBA, type TubeStation } from './mesh';
import type { Body, LimbJoints, Rig, Side } from './rig';

/**
 * The 3D runner: one continuous lofted torso, legs and arms that bend smoothly
 * through knees and elbows, a sculpted head with a face, hair, and running kit.
 * Male and female builds differ where real bodies do — shoulder/hip ratio,
 * waist, chest, limb girth, a ponytail — using adult anthropometric averages
 * (fractions of stature; nothing here is a measurement of the user).
 * Clothing is the same surface pushed out and recoloured, never a second
 * layer, so nothing z-fights under the painter's-algorithm renderer.
 */

type Row = readonly number[];
const col = (rows: readonly Row[], k: number) => rows.map((r) => [r[0], r[k]] as const);
const at4 = (fr: Frame, front: number, up: number, side: number): V3 => ({
  x: fr.o.x + fr.f.x * front + fr.u.x * up + fr.s.x * side,
  y: fr.o.y + fr.f.y * front + fr.u.y * up + fr.s.y * side,
  z: fr.o.z + fr.f.z * front + fr.u.z * up + fr.s.z * side,
});

// [h above hip-joint level, half-width, front depth, back depth] for a 0.29 trunk.
const TORSO_M: Row[] = [
  [-0.052, 0.034, 0.028, 0.038],
  [-0.042, 0.066, 0.043, 0.064],
  [-0.028, 0.086, 0.051, 0.075],
  [-0.01, 0.095, 0.055, 0.075],
  [0.015, 0.097, 0.058, 0.068],
  [0.045, 0.09, 0.06, 0.058],
  [0.08, 0.083, 0.06, 0.052],
  [0.11, 0.084, 0.062, 0.054],
  [0.145, 0.09, 0.066, 0.058],
  [0.18, 0.097, 0.072, 0.062],
  [0.215, 0.103, 0.072, 0.064],
  [0.25, 0.106, 0.066, 0.062],
  [0.278, 0.1, 0.056, 0.058],
  [0.3, 0.086, 0.048, 0.057],
  [0.32, 0.064, 0.043, 0.055],
  [0.337, 0.047, 0.039, 0.049],
  [0.35, 0.04, 0.036, 0.044],
];
const TORSO_F: Row[] = [
  [-0.05, 0.034, 0.028, 0.04],
  [-0.04, 0.07, 0.044, 0.068],
  [-0.027, 0.093, 0.051, 0.081],
  [-0.008, 0.102, 0.054, 0.08],
  [0.015, 0.103, 0.056, 0.07],
  [0.045, 0.092, 0.055, 0.058],
  [0.085, 0.074, 0.054, 0.05],
  [0.115, 0.078, 0.056, 0.052],
  [0.15, 0.085, 0.06, 0.054],
  [0.185, 0.09, 0.062, 0.056],
  [0.215, 0.093, 0.06, 0.058],
  [0.248, 0.095, 0.055, 0.056],
  [0.275, 0.09, 0.048, 0.052],
  [0.297, 0.076, 0.043, 0.051],
  [0.317, 0.056, 0.038, 0.048],
  [0.333, 0.041, 0.034, 0.042],
  [0.345, 0.035, 0.031, 0.038],
];
// [s (0 hip, 1 knee, 2 ankle), front, back, lateral, medial]
const LEG_M: Row[] = [
  [0, 0.044, 0.05, 0.045, 0.04],
  [0.12, 0.05, 0.055, 0.051, 0.046],
  [0.3, 0.049, 0.05, 0.05, 0.046],
  [0.55, 0.043, 0.04, 0.043, 0.042],
  [0.75, 0.038, 0.034, 0.037, 0.04],
  [0.9, 0.034, 0.03, 0.033, 0.036],
  [1, 0.033, 0.029, 0.032, 0.033],
  [1.1, 0.029, 0.032, 0.03, 0.031],
  [1.28, 0.026, 0.04, 0.032, 0.036],
  [1.45, 0.024, 0.036, 0.029, 0.031],
  [1.65, 0.02, 0.026, 0.023, 0.024],
  [1.85, 0.017, 0.019, 0.02, 0.02],
  [2, 0.017, 0.019, 0.021, 0.021],
];
const LEG_F: Row[] = [
  [0, 0.045, 0.052, 0.048, 0.041],
  [0.12, 0.052, 0.058, 0.056, 0.048],
  [0.3, 0.049, 0.05, 0.051, 0.047],
  [0.55, 0.042, 0.039, 0.042, 0.042],
  [0.75, 0.036, 0.032, 0.035, 0.039],
  [0.9, 0.032, 0.028, 0.031, 0.034],
  [1, 0.031, 0.027, 0.03, 0.031],
  [1.1, 0.027, 0.03, 0.028, 0.029],
  [1.28, 0.024, 0.037, 0.029, 0.033],
  [1.45, 0.022, 0.033, 0.027, 0.028],
  [1.65, 0.018, 0.023, 0.021, 0.022],
  [1.85, 0.016, 0.018, 0.018, 0.018],
  [2, 0.016, 0.018, 0.019, 0.019],
];
// [s (0 shoulder, 1 elbow, 2 wrist), front, back, lateral, medial]
const ARM_M: Row[] = [
  [0, 0.031, 0.032, 0.033, 0.028],
  [0.2, 0.029, 0.03, 0.03, 0.026],
  [0.45, 0.028, 0.029, 0.026, 0.026],
  [0.75, 0.024, 0.025, 0.023, 0.024],
  [1, 0.021, 0.024, 0.022, 0.023],
  [1.2, 0.024, 0.023, 0.025, 0.025],
  [1.5, 0.02, 0.019, 0.021, 0.021],
  [1.85, 0.018, 0.018, 0.014, 0.014],
  [2, 0.017, 0.017, 0.013, 0.013],
];
const ARM_F: Row[] = ARM_M.map((r) => [r[0], r[1] * 0.91, r[2] * 0.91, r[3] * 0.9, r[4] * 0.91]);

// Head as stacked horizontal slices, in the head frame (origin just above the
// ear canal): [up, centre offset forward, front radius, back radius, half-width,
// front taper (narrows the face toward the chin)].
const HEAD_M: Row[] = [
  [-0.062, 0.034, 0.024, 0.027, 0.022, 0.3],
  [-0.056, 0.033, 0.03, 0.031, 0.029, 0.32],
  [-0.045, 0.028, 0.036, 0.035, 0.035, 0.28],
  [-0.033, 0.02, 0.045, 0.042, 0.04, 0.2],
  [-0.021, 0.012, 0.052, 0.046, 0.043, 0.14],
  [-0.009, 0.004, 0.058, 0.054, 0.046, 0.12],
  [0.003, 0, 0.056, 0.058, 0.046, 0.1],
  [0.012, 0, 0.058, 0.06, 0.047, 0.08],
  [0.024, -0.002, 0.06, 0.06, 0.047, 0.05],
  [0.036, -0.003, 0.058, 0.059, 0.046, 0],
  [0.048, -0.004, 0.053, 0.055, 0.043, 0],
];
const HEAD_F: Row[] = HEAD_M.map((r) => {
  const y = r[0];
  // softer, narrower jaw and a shorter chin; slightly rounder cranium
  const jaw = y < -0.04 ? 0.84 : y < -0.025 ? 0.88 : y < -0.01 ? 0.94 : 1;
  const yy = y < 0 ? y * 0.93 : y * 0.98;
  return [yy, r[1] * 0.96, r[2] * (y < -0.02 ? 0.93 : 0.98), r[3] * 0.98, r[4] * 0.97 * jaw, r[5] * 0.8];
});
// nose protrusion along the face midline by height
const NOSE: Row[] = [[-0.023, 0], [-0.019, 0.006], [-0.015, 0.0115], [-0.009, 0.0095], [0, 0.0055], [0.008, 0.0025], [0.014, 0]];
// hairline height by front component of the direction (−1 back … +1 face)
const HAIRLINE_M: Row[] = [[-1, -0.036], [-0.5, -0.026], [0, 0.01], [0.35, 0.03], [0.6, 0.04], [0.85, 0.043], [1, 0.044]];
const HAIRLINE_F: Row[] = [[-1, -0.032], [-0.5, -0.022], [0, 0.0], [0.35, 0.02], [0.6, 0.033], [0.85, 0.039], [1, 0.04]];

interface Palette {
  skin: RGBA;
  skinShade: RGBA;
  lip: RGBA;
  hair: RGBA;
  top: RGBA;
  topHem: RGBA;
  bottom: RGBA;
  bottomHem: RGBA;
  sock: RGBA;
  upper: RGBA;
  accent: RGBA;
  midsole: RGBA;
  outsole: RGBA;
  lace: RGBA;
  eye: RGBA;
  iris: RGBA;
}
const SKIN = hex('#C68863');
const PALETTE: Record<Body, Palette> = {
  male: {
    skin: SKIN,
    skinShade: hex('#A86C4C'),
    lip: hex('#A2584A'),
    hair: hex('#1B1411'),
    top: hex('#FF5A1F'),
    topHem: hex('#D9440F'),
    bottom: hex('#232937'),
    bottomHem: hex('#141821'),
    sock: hex('#F2F2F0'),
    upper: hex('#2A2F3A'),
    accent: hex('#FF5A1F'),
    midsole: hex('#F4F4F1'),
    outsole: hex('#3B404B'),
    lace: hex('#D8DCE2'),
    eye: hex('#DCD6CB'),
    iris: hex('#2B1B12'),
  },
  female: {
    skin: hex('#CB8E69'),
    skinShade: hex('#AE7150'),
    lip: hex('#B25D66'),
    hair: hex('#231914'),
    top: hex('#FF5A1F'),
    topHem: hex('#D9440F'),
    bottom: hex('#262A35'),
    bottomHem: hex('#1B1E26'),
    sock: hex('#F2F2F0'),
    upper: hex('#F3F3F1'),
    accent: hex('#FF5A1F'),
    midsole: hex('#FFFFFF'),
    outsole: hex('#C9CDD4'),
    lace: hex('#FF8A5C'),
    eye: hex('#DCD6CB'),
    iris: hex('#2B1B12'),
  },
};

export interface HumanOptions {
  /** seconds, drives the ponytail sway */
  time?: number;
  /** skin-only shell for the X-ray view: no clothes, hair, eyes or shoes (bare feet) */
  shell?: boolean;
}

/**
 * Running kit as hard-edged bands along each tube: [from, to) in that tube's
 * parameter (torso: height above the hip joints; limbs: 0 joint → 2 end).
 * Bands are applied in order, later ones on top; `lift` is cloth thickness.
 */
type Band = { from: number; to: number; color: keyof Palette; lift: number };
const KIT: Record<Body, { torso: Band[]; arm: Band[]; leg: Band[] }> = {
  male: {
    torso: [
      { from: -1, to: 0.035, color: 'bottom', lift: 0.0026 },
      { from: 0.035, to: 0.043, color: 'topHem', lift: 0.0046 },
      { from: 0.043, to: 0.333, color: 'top', lift: 0.0032 },
    ],
    arm: [
      { from: -1, to: 0.36, color: 'top', lift: 0.0045 },
      { from: 0.36, to: 0.4, color: 'topHem', lift: 0.0058 },
    ],
    leg: [
      { from: -1, to: 0.38, color: 'bottom', lift: 0.0055 },
      { from: 0.38, to: 0.42, color: 'bottomHem', lift: 0.0075 },
      { from: 1.85, to: 3, color: 'sock', lift: 0.0015 },
    ],
  },
  female: {
    torso: [
      { from: -1, to: 0.05, color: 'bottom', lift: 0.0013 },
      { from: 0.05, to: 0.062, color: 'bottomHem', lift: 0.0022 },
      { from: 0.062, to: 0.069, color: 'topHem', lift: 0.0034 },
      { from: 0.069, to: 0.322, color: 'top', lift: 0.0024 },
    ],
    arm: [
      { from: -1, to: 0.17, color: 'top', lift: 0.0022 },
      { from: 0.17, to: 0.2, color: 'topHem', lift: 0.0032 },
    ],
    leg: [
      { from: -1, to: 1.69, color: 'bottom', lift: 0.0012 },
      { from: 1.69, to: 1.72, color: 'bottomHem', lift: 0.0018 },
      { from: 1.9, to: 3, color: 'sock', lift: 0.0015 },
    ],
  },
};
const bandEdges = (bands: Band[]) => [...new Set(bands.flatMap((b) => [b.from, b.to]).filter((e) => e > -1 && e < 3))];
function bandAt(bands: Band[], v: number): Band | null {
  let hit: Band | null = null;
  for (const b of bands) if (v >= b.from && v < b.to) hit = b;
  return hit;
}

export function buildHuman(rig: Rig, body: Body, opts: HumanOptions = {}): Part[] {
  return withMeshCache(`human:${body}:${opts.shell ? 'shell' : 'kit'}`, () => buildHumanParts(rig, body, opts));
}

function buildHumanParts(rig: Rig, body: Body, opts: HumanOptions): Part[] {
  const pal = PALETTE[body];
  const shell = !!opts.shell;
  const skinMat: Mat = shell ? 'xshell' : 'skin';
  const parts: Part[] = [];
  parts.push(torso(rig, body, pal, shell));
  parts.push(neck(rig, body, pal, shell));
  parts.push(...head(rig, body, pal, shell, opts.time ?? 0));
  for (const side of ['r', 'l'] as Side[]) {
    parts.push(leg(rig, side, body, pal, shell));
    parts.push(arm(rig, side, body, pal, shell));
    parts.push(...hand(rig, side, body, pal, skinMat));
    parts.push(shell ? bareFoot(rig, side, body, pal) : shoe(rig, side, body, pal));
  }
  return parts;
}

// ---------------------------------------------------------------------------

function torso(rig: Rig, body: Body, pal: Palette, shell: boolean): Part {
  const table = body === 'female' ? TORSO_F : TORSO_M;
  const W = col(table, 1);
  const DF = col(table, 2);
  const DB = col(table, 3);
  const P = rig.pelvis;
  const C = rig.chest;
  const Lt = dist3(P.o, C.o) || 0.29;
  const k = Lt / 0.29;
  const h0 = table[0][0];
  const h1 = table[table.length - 1][0];
  const bands = shell ? [] : KIT[body].torso;
  const N = 30;
  const levels: number[] = [];
  for (let i = 0; i < N; i++) levels.push(h0 + ((h1 - h0) * i) / (N - 1));
  for (const e of bandEdges(bands)) levels.push(e - 1e-4, e + 1e-4);
  levels.sort((x, y) => x - y);

  const stations: TubeStation[] = levels.map((h) => {
    const ha = h <= 0 ? h : h >= 0.29 ? Lt + (h - 0.29) : h * k;
    const t = clamp01(ha / Lt);
    const pa = madd3(P.o, P.u, ha);
    const pc = madd3(C.o, C.u, ha - Lt);
    const c = lerp3(pa, pc, smooth(0, 1, t));
    const fr = blendFrames(P, C, smooth(0.12, 0.85, t));
    return {
      c,
      t: fr.u,
      front: fr.f,
      lateral: fr.s,
      rf: interpSmooth(DF, h),
      rb: interpSmooth(DB, h),
      rl: interpSmooth(W, h),
      rm: interpSmooth(W, h),
      p: 2.35,
      v: h,
    };
  });
  const female = body === 'female';
  const bustAmp = female ? 0.026 : 0.007;
  const bustH = female ? 0.188 : 0.2;

  return tube(stations, {
    segs: 32,
    mat: shell ? 'xshell' : 'cloth',
    capStart: 0.5,
    capEnd: 0.4,
    shape: (h, cf, cs, r) => {
      const xl = cs * r;
      // Chest: two lobes merging smoothly (a sports top compresses them).
      const lobes = Math.exp(-(((Math.abs(xl) - 0.042) / 0.03) ** 2));
      const vert = h < bustH ? Math.exp(-(((h - bustH) / 0.022) ** 2)) : Math.exp(-(((h - bustH) / 0.042) ** 2));
      return r + bustAmp * lobes * vert * Math.pow(Math.max(0, cf), 1.5) + (bandAt(bands, h)?.lift ?? 0);
    },
    color: (h) => {
      const b = bandAt(bands, h);
      return b ? pal[b.color] : pal.skin;
    },
  });
}

function neck(rig: Rig, body: Body, pal: Palette, shell: boolean): Part {
  const s = body === 'female' ? 0.86 : 1;
  const top = at4(rig.head, -0.012, -0.045, 0);
  const a = madd3(rig.neckBase, rig.chest.u, -0.02);
  const dir = norm3(sub3(top, a), rig.chest.u);
  const front = rig.head.f;
  const stations: TubeStation[] = [0, 0.33, 0.66, 1].map((u) => ({
    c: lerp3(a, top, u),
    t: dir,
    front,
    lateral: rig.chest.s,
    rf: 0.035 * s,
    rb: 0.039 * s,
    rl: 0.037 * s,
    rm: 0.037 * s,
  }));
  const part = tube(stations, { segs: 24, mat: shell ? 'xshell' : 'skin', capStart: 0.3, capEnd: 0.3, color: () => pal.skin });
  part.bias = 0.01;
  return part;
}

function head(rig: Rig, body: Body, pal: Palette, shell: boolean, time: number): Part[] {
  const female = body === 'female';
  const k = female ? 1.0 : 1.04; // a touch over life size reads better at phone scale
  const table = female ? HEAD_F : HEAD_M;
  const cols = [1, 2, 3, 4, 5].map((i) => col(table, i));
  const H = rig.head;
  const y0 = table[0][0];
  const y1 = table[table.length - 1][0];
  const N = 28;
  const hairline = female ? HAIRLINE_F : HAIRLINE_M;
  const hairThick = female ? 0.0095 : 0.0058;
  const prof = (y: number) => ({
    c: interpSmooth(cols[0], y),
    rf: interpSmooth(cols[1], y),
    rb: interpSmooth(cols[2], y),
    w: interpSmooth(cols[3], y),
    taper: interpSmooth(cols[4], y),
  });
  const stations: TubeStation[] = [];
  for (let i = 0; i < N; i++) {
    const y = y0 + ((y1 - y0) * i) / (N - 1);
    const p = prof(y);
    stations.push({
      c: at4(H, p.c * k, y * k, 0),
      t: H.u,
      front: H.f,
      lateral: H.s,
      rf: p.rf * k,
      rb: p.rb * k,
      rl: p.w * k,
      rm: p.w * k,
      p: 2.15,
      v: y,
    });
  }
  const gauss = (x: number, m: number, sd: number) => Math.exp(-(((x - m) / sd) ** 2));
  const hairMask = (y: number, cf: number, cs: number) => {
    if (shell) return 0;
    // sideburn: keep the area just in front of the ear down to cheek level
    // keep the ears clear (tucked behind them), with a short sideburn in front
    if (Math.abs(cs) > 0.8 && cf > -0.5 && cf < 0.2 && y < 0.022) return 0;
    const line = interpSmooth(hairline, cf) - (Math.abs(cs) > 0.75 && cf > 0.2 && cf < 0.45 ? 0.012 : 0);
    return smooth(-0.003, 0.003, y - line);
  };
  const parts: Part[] = [];
  const headPart = tube(stations, {
    segs: 36,
    mat: shell ? 'xshell' : 'skin',
    capStart: 0.28,
    capEnd: 0.32,
    capSteps: 4,
    shape: (y, cf, cs, r) => {
      const lat = cs * r;
      const front = smooth(0.25, 0.75, cf);
      // narrow the face toward the chin (diagonal directions only)
      let out = r * (1 - interpSmooth(cols[4], y) * 4 * cf * cf * cs * cs * (cf > 0 ? 1 : 0.2));
      if (!shell && front > 0) {
        out += front * interpSmooth(NOSE, y) * gauss(lat, 0, 0.0105 * k) * (female ? 0.88 : 1);
        out += front * 0.0018 * gauss(y, 0.013, 0.004) * (Math.abs(lat) < 0.032 ? 1 : 0); // brow ridge
        out -= front * 0.0032 * gauss(y, 0.003, 0.006) * gauss(Math.abs(lat), 0.0175 * k, 0.009); // eye sockets
        out += front * 0.0022 * gauss(y, -0.054, 0.006) * gauss(lat, 0, 0.014); // chin
        out += 0.002 * gauss(y, -0.006, 0.006) * gauss(Math.abs(lat), 0.038 * k, 0.008); // cheekbones
      }
      return out + hairThick * hairMask(y, cf, cs) * (0.6 + 0.4 * smooth(0, 0.05, y));
    },
    color: (y, cf, cs) => {
      if (shell) return pal.skin;
      const lat = cs * interpSmooth(cols[3], y) * k;
      let c = pal.skin;
      if (cf > 0.55) c = mixRGBA(c, pal.skinShade, 0.9 * gauss(lat, 0, 0.016) * gauss(y, -0.0325, 0.0016)); // mouth line
      return mixRGBA(c, pal.hair, hairMask(y, cf, cs));
    },
  });
  parts.push(headPart);
  if (shell) return parts;

  // ears, on the side of the head just behind the centre
  const earW = interpSmooth(cols[3], 0) * k;
  for (const sgn of [1, -1]) {
    const o = at4(H, -0.008 * k, -0.004 * k, sgn * (earW + 0.0015));
    const fr: Frame = { o, f: H.f, u: H.u, s: H.s };
    parts.push(
      blob(fr, { f: 0.0105 * k, b: 0.0115 * k, u: 0.0185 * k, d: 0.0155 * k, s: 0.0052 * k }, {
        rings: 8,
        segs: 12,
        mat: 'skin',
        color: (fx, uy, sz) => (sz * sgn > 0.4 && Math.abs(fx) < 0.6 && Math.abs(uy) < 0.7 ? pal.skinShade : pal.skin),
      }),
    );
  }
  // eyes: seated in the sockets so only the front of the eyeball shows
  const ey = 0.0035;
  const ep = prof(ey);
  const elat = 0.0175 * k;
  const surface = ep.c * k + ep.rf * k * Math.sqrt(Math.max(0, 1 - (elat / (ep.w * k)) ** 2)) - 0.0032;
  const er = (female ? 0.006 : 0.0056) * k;
  for (const sgn of [1, -1]) {
    const o = at4(H, surface - er * 0.62, ey * k, sgn * elat);
    const fr: Frame = { o, f: H.f, u: H.u, s: H.s };
    parts.push(
      blob(fr, { f: er, u: er, s: er }, {
        rings: 8,
        segs: 12,
        mat: 'eye',
        color: (fx) => (fx > 0.86 ? hex('#0B0806') : fx > 0.5 ? pal.iris : pal.eye),
      }),
    );
  }
  // lips and brows as their own small shapes: crisp at phone scale, where a
  // painted band on the head would blur across a few vertices
  const faceAt = (y: number, lat: number, lift: number) => {
    const p = prof(y);
    const q = Math.max(0, 1 - (lat / (p.w * k)) ** 2);
    const cf = Math.sqrt(q);
    const taper = 1 - p.taper * 4 * cf * cf * (1 - q);
    const fx = p.c * k + p.rf * k * cf * taper;
    return at4(H, fx + lift, y * k, lat);
  };
  const strip = (pts: V3[], radii: number[], color: RGBA, mat: Mat, depth: number) =>
    tube(
      limbPath(pts, 2, 0.4).map((q) => {
        const r = interpSmooth(radii.map((v, i) => [i / (radii.length - 1), v] as const), q.s / (pts.length - 1));
        return { c: q.c, t: q.t, front: H.u, lateral: H.f, rf: r, rb: r, rl: depth, rm: depth };
      }),
      { segs: 6, mat, capStart: 0.6, capEnd: 0.6, capSteps: 1, color: () => color },
    );
  const lw = (female ? 0.0118 : 0.0122) * k;
  const lipC = female ? pal.lip : mixRGBA(pal.lip, pal.skin, 0.35);
  parts.push(
    strip(
      [-1, -0.5, 0, 0.5, 1].map((u) => faceAt(-0.0287 + 0.001 * (1 - u * u), u * lw, 0.0006 - 0.0016 * u * u)),
      [0.0007, 0.0017, 0.0021, 0.0017, 0.0007].map((r) => r * k * (female ? 1.15 : 1)),
      lipC,
      'lip',
      0.0019 * k,
    ),
  );
  parts.push(
    strip(
      [-1, -0.5, 0, 0.5, 1].map((u) => faceAt(-0.0352 - 0.0006 * (1 - u * u), u * lw * 0.88, 0.0006 - 0.0018 * u * u)),
      [0.0008, 0.002, 0.0024, 0.002, 0.0008].map((r) => r * k * (female ? 1.15 : 1)),
      lipC,
      'lip',
      0.0021 * k,
    ),
  );
  for (const sgn of [1, -1]) {
    const bw = female ? 0.0012 : 0.0016;
    parts.push(
      strip(
        [0.0065, 0.013, 0.019, 0.025, 0.029].map((l, i) => faceAt(0.0128 + (female ? 0.0022 : 0.0012) * Math.sin((i / 4) * Math.PI) - 0.0006 * i, sgn * l * k, 0.003)),
        [bw * 1.1, bw * 1.2, bw, bw * 0.8, bw * 0.45].map((r) => r * k),
        pal.hair,
        'hair',
        0.0012 * k,
      ),
    );
  }
  if (female) parts.push(...ponytail(rig, pal, time));
  return parts;
}

function ponytail(rig: Rig, pal: Palette, time: number): Part[] {
  const H = rig.head;
  const down = v3(0, -1, 0);
  const sway = Math.sin(time * 2 * Math.PI * 1.4) * 0.01;
  const swing = rig.chest.s;
  const p0 = at4(H, -0.058, 0.028, 0);
  const p1 = madd3(madd3(p0, H.f, -0.02), down, 0.006);
  const p2 = madd3(madd3(madd3(p1, H.f, -0.012), down, 0.034), swing, sway * 0.6);
  const p3 = madd3(madd3(madd3(p2, H.f, -0.004), down, 0.04), swing, sway);
  const p4 = madd3(madd3(p3, down, 0.03), swing, sway * 1.3);
  const path = limbPath([p0, p1, p2, p3, p4], 3, 0.3);
  const radii = [0.013, 0.018, 0.017, 0.012, 0.004];
  const stations: TubeStation[] = path.map((q) => {
    const r = interpSmooth(radii.map((v, i) => [i, v] as const), q.s);
    return { c: q.c, t: q.t, front: H.f, lateral: H.s, rf: r, rb: r, rl: r * 0.9, rm: r * 0.9 };
  });
  const tail = tube(stations, { segs: 12, mat: 'hair', capStart: 0.4, capEnd: 0.5, color: () => pal.hair });
  const tdir = norm3(sub3(p1, p0));
  const band = tube(
    [0, 1].map((u) => ({ c: lerp3(p0, madd3(p0, tdir, 0.008), u), t: tdir, front: H.u, lateral: H.s, rf: 0.0145, rb: 0.0145, rl: 0.0145, rm: 0.0145 })),
    { segs: 12, mat: 'cloth', capStart: 0.2, capEnd: 0.2, color: () => pal.accent },
  );
  return [tail, band];
}

function leg(rig: Rig, side: Side, body: Body, pal: Palette, shell: boolean): Part {
  const j = rig.limbs[side];
  const table = body === 'female' ? LEG_F : LEG_M;
  const cols = [1, 2, 3, 4].map((k) => col(table, k));
  const lateral = side === 'r' ? rig.pelvis.s : { x: -rig.pelvis.s.x, y: -rig.pelvis.s.y, z: -rig.pelvis.s.z };
  const bands = shell ? [] : KIT[body].leg;
  const path = withEdges(limbPath([j.hip, j.knee, j.ankle], 12, 0.18), bandEdges(bands));
  const stations: TubeStation[] = path.map((q) => ({
    c: q.c,
    t: q.t,
    front: rig.pelvis.f,
    lateral,
    rf: interpSmooth(cols[0], q.s),
    rb: interpSmooth(cols[1], q.s),
    rl: interpSmooth(cols[2], q.s),
    rm: interpSmooth(cols[3], q.s),
    v: q.s,
  }));
  const part = tube(stations, {
    segs: 20,
    mat: shell ? 'xshell' : 'skin',
    capStart: 1,
    capEnd: 0.5,
    shape: (s, _cf, _cs, r) => r + (bandAt(bands, s)?.lift ?? 0),
    color: (s) => {
      const b = bandAt(bands, s);
      return b ? pal[b.color] : pal.skin;
    },
  });
  // The thigh tops sit inside the pelvis: where the surfaces meet, the hips win.
  part.bias = 0.012;
  return part;
}

function arm(rig: Rig, side: Side, body: Body, pal: Palette, shell: boolean): Part {
  const j = rig.limbs[side];
  const table = body === 'female' ? ARM_F : ARM_M;
  const cols = [1, 2, 3, 4].map((k) => col(table, k));
  const lateral = side === 'r' ? rig.chest.s : { x: -rig.chest.s.x, y: -rig.chest.s.y, z: -rig.chest.s.z };
  const bands = shell ? [] : KIT[body].arm;
  const path = withEdges(limbPath([j.shoulder, j.elbow, j.wrist], 11, 0.2), bandEdges(bands));
  const stations: TubeStation[] = path.map((q) => ({
    c: q.c,
    t: q.t,
    front: rig.chest.f,
    lateral,
    rf: interpSmooth(cols[0], q.s),
    rb: interpSmooth(cols[1], q.s),
    rl: interpSmooth(cols[2], q.s),
    rm: interpSmooth(cols[3], q.s),
    v: q.s,
  }));
  return tube(stations, {
    segs: 16,
    mat: shell ? 'xshell' : 'skin',
    capStart: 1,
    capEnd: 0.4,
    shape: (s, _cf, _cs, r) => r + (bandAt(bands, s)?.lift ?? 0),
    color: (s) => {
      const b = bandAt(bands, s);
      return b ? pal[b.color] : pal.skin;
    },
  });
}

function hand(rig: Rig, side: Side, body: Body, pal: Palette, mat: Mat): Part[] {
  const j = rig.limbs[side];
  const k = body === 'female' ? 0.88 : 1;
  const dir = norm3(sub3(j.hand, j.wrist), norm3(sub3(j.wrist, j.elbow)));
  const o = madd3(j.wrist, dir, 0.034 * k);
  const fr = frameFrom(o, dir, rig.chest.f);
  const bodyRight = rig.chest.s;
  const medial = side === 'r' ? -1 : 1; // medial = toward the midline
  const m = Math.sign(fr.s.x * bodyRight.x * medial + fr.s.y * bodyRight.y * medial + fr.s.z * bodyRight.z * medial) || 1;
  const palm = blob(fr, { f: 0.023 * k, b: 0.02 * k, u: 0.043 * k, d: 0.03 * k, s: 0.012 * k }, {
    rings: 12,
    segs: 14,
    mat,
    color: () => pal.skin,
    deform: (fx, uy, sz) => {
      const curl = smooth(0.15, 1, uy);
      return {
        front: fx * (fx >= 0 ? 0.023 : 0.02) * k,
        up: uy * (uy >= 0 ? 0.043 : 0.03) * k * (1 - 0.18 * curl),
        side: sz * 0.012 * k + m * 0.016 * k * curl * curl,
      };
    },
  });
  const t0 = madd3(madd3(o, fr.f, 0.016 * k), fr.u, -0.012 * k);
  const tEnd = madd3(madd3(madd3(t0, fr.f, 0.01 * k), fr.u, 0.026 * k), fr.s, m * 0.008 * k);
  const tdir = norm3(sub3(tEnd, t0));
  const thumb = tube(
    [0, 0.5, 1].map((u) => ({ c: lerp3(t0, tEnd, u), t: tdir, front: fr.f, lateral: fr.s, rf: 0.0085 * k, rb: 0.0085 * k, rl: 0.0075 * k, rm: 0.0075 * k })),
    { segs: 10, mat, capStart: 0.6, capEnd: 0.9, color: () => pal.skin },
  );
  return [palm, thumb];
}

/** Foot frame from the heel/toe landmarks: o = heel, u = heel→toe, f = up off the sole. */
function footFrame(j: LimbJoints): { o: V3; along: V3; up: V3; len: number } {
  const along = norm3(sub3(j.toe, j.heel), v3(1, 0, 0));
  const up = perpTo(sub3(j.ankle, j.heel), along, v3(0, 1, 0));
  return { o: j.heel, along, up, len: dist3(j.heel, j.toe) };
}

const SHOE_TOP: Row[] = [[0, 0.05], [0.12, 0.06], [0.3, 0.055], [0.5, 0.045], [0.7, 0.032], [0.85, 0.026], [1, 0.02]];
const SHOE_W: Row[] = [[0, 0.019], [0.15, 0.023], [0.45, 0.024], [0.7, 0.03], [0.85, 0.029], [1, 0.019]];

function shoe(rig: Rig, side: Side, body: Body, pal: Palette): Part {
  const j = rig.limbs[side];
  const k = body === 'female' ? 0.92 : 1;
  const ff = footFrame(j);
  const lateralRef = side === 'r' ? rig.pelvis.s : { x: -rig.pelvis.s.x, y: -rig.pelvis.s.y, z: -rig.pelvis.s.z };
  const lat = perpTo(lateralRef, ff.along, v3(0, 0, 1));
  const L = ff.len * 1.1;
  const x0 = -ff.len * 0.06;
  const bottom = -0.009;
  const N = 14;
  const stations: TubeStation[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const top = interpSmooth(SHOE_TOP, t) * k;
    const c = madd3(madd3(ff.o, ff.along, x0 + L * t), ff.up, (top + bottom) / 2);
    const hh = (top - bottom) / 2;
    const w = interpSmooth(SHOE_W, t) * k;
    stations.push({ c, t: ff.along, front: ff.up, lateral: lat, rf: hh, rb: hh, rl: w * 1.03, rm: w, p: 2.7 });
  }
  return tube(stations, {
    segs: 16,
    mat: 'shoe',
    capStart: 0.55,
    capEnd: 0.75,
    color: (u, cf, cs) => {
      if (cf < -0.78) return pal.outsole;
      if (cf < -0.42) return pal.midsole;
      if (u < 0.36 && cf > 0.9) return hex('#15171C'); // collar opening
      if (u > 0.32 && u < 0.68 && cf > 0.8 && Math.abs(cs) < 0.32) return pal.lace;
      if (u < 0.09 && cf > 0.35) return pal.accent; // heel tab
      if (Math.abs(cs) > 0.72 && u > 0.3 && u < 0.78 && cf > -0.36 + (u - 0.3) * 0.5 && cf < 0.12 + (u - 0.3) * 0.4) return pal.accent;
      return pal.upper;
    },
  });
}

function bareFoot(rig: Rig, side: Side, body: Body, pal: Palette): Part {
  const j = rig.limbs[side];
  const k = body === 'female' ? 0.9 : 1;
  const ff = footFrame(j);
  const lateralRef = side === 'r' ? rig.pelvis.s : { x: -rig.pelvis.s.x, y: -rig.pelvis.s.y, z: -rig.pelvis.s.z };
  const lat = perpTo(lateralRef, ff.along, v3(0, 0, 1));
  const top: Row[] = [[0, 0.04], [0.15, 0.05], [0.35, 0.045], [0.6, 0.03], [0.8, 0.02], [1, 0.012]];
  const wid: Row[] = [[0, 0.015], [0.2, 0.018], [0.5, 0.02], [0.75, 0.026], [1, 0.016]];
  const N = 12;
  const stations: TubeStation[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const tp = interpSmooth(top, t) * k;
    const c = madd3(madd3(ff.o, ff.along, ff.len * (t * 1.02 - 0.02)), ff.up, tp / 2);
    stations.push({ c, t: ff.along, front: ff.up, lateral: lat, rf: tp / 2, rb: tp / 2, rl: interpSmooth(wid, t) * k, rm: interpSmooth(wid, t) * k });
  }
  return tube(stations, { segs: 16, mat: 'xshell', capStart: 0.6, capEnd: 0.8, color: () => pal.skin });
}
