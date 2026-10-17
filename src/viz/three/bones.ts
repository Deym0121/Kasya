import {
  cross3,
  dist3,
  frameFrom,
  interpSmooth,
  lerp3,
  madd3,
  norm3,
  perpTo,
  smooth,
  sub3,
  v3,
  type Frame,
  type V3,
} from './math';
import { blob, hex, limbPath, mixRGBA, tube, withMeshCache, type Part, type RGBA, type TubeStation } from './mesh';
import type { Body, Rig, Side } from './rig';

/**
 * The 3D skeleton, posed by the same rig as the runner: skull (orbits, nasal
 * aperture, teeth), 24 vertebrae with their processes, 12 rib pairs with costal
 * cartilage, sternum, clavicles, scapulae, the pelvic girdle, femur (head, neck,
 * trochanter, condyles), patella, tibia + fibula, humerus, radius + ulna, and
 * the bones of the hands and feet (calcaneus, talus, midfoot, metatarsals,
 * phalanges). Shapes are simplified adult anatomy at the scale a phone shows.
 *
 * In 'xbone' mode the same meshes feed the X-ray: colour is fixed there and a
 * vertex's alpha is its radiodensity (cortical bone bright, cartilage faint,
 * eye sockets dark).
 */

type Mode = 'bone' | 'xbone';
const IVORY = hex('#E9E0CB');
const IVORY_DARK = hex('#B9AA8E');
const TEETH = hex('#F6F2E8');
const CAVITY = hex('#3A332B');
const CARTILAGE = hex('#CFDCD6');

const neg = (a: V3): V3 => ({ x: -a.x, y: -a.y, z: -a.z });

export function buildSkeleton(rig: Rig, body: Body, mode: Mode): Part[] {
  return withMeshCache(`skeleton:${body}:${mode}`, () => buildSkeletonParts(rig, body, mode));
}

function buildSkeletonParts(rig: Rig, body: Body, mode: Mode): Part[] {
  const dens = (c: RGBA, density: number): RGBA => (mode === 'xbone' ? [c[0], c[1], c[2], density] : [c[0], c[1], c[2], 1]);
  const ivory = dens(IVORY, 1);
  const ctx: Ctx = { rig, body, mode, dens, ivory };
  const parts: Part[] = [];
  parts.push(...skull(ctx));
  parts.push(...spine(ctx));
  parts.push(...ribcage(ctx));
  parts.push(...pelvis(ctx));
  for (const side of ['r', 'l'] as Side[]) {
    parts.push(...legBones(ctx, side));
    parts.push(...armBones(ctx, side));
  }
  for (const p of parts) p.mat = mode;
  return parts;
}

interface Ctx {
  rig: Rig;
  body: Body;
  mode: Mode;
  dens: (c: RGBA, density: number) => RGBA;
  ivory: RGBA;
}

/** A straight-ish rod through `pts` with per-point radii (round section). */
function rod(ctx: Ctx, pts: V3[], radii: number[], front: V3, lateral: V3, opts: { segs?: number; color?: RGBA; flat?: number; caps?: number } = {}): Part {
  const path = pts.length > 2 ? limbPath(pts, 2, 0.35) : [0, 1].map((u) => ({ c: lerp3(pts[0], pts[1], u), t: norm3(sub3(pts[1], pts[0])), s: u }));
  const span = pts.length - 1;
  const rr = radii.map((r, i) => [i / Math.max(1, radii.length - 1), r] as const);
  const flat = opts.flat ?? 1;
  const stations: TubeStation[] = path.map((q) => {
    const r = interpSmooth(rr, q.s / span);
    return { c: q.c, t: q.t, front, lateral, rf: r * flat, rb: r * flat, rl: r, rm: r };
  });
  const color = opts.color ?? ctx.ivory;
  const caps = opts.caps ?? 0.8;
  return tube(stations, { segs: opts.segs ?? 8, mat: ctx.mode, capStart: caps, capEnd: caps, capSteps: 1, color: () => color });
}

// ---- skull ------------------------------------------------------------------

// Skull slices in the head frame: [up, front extent, back extent, half-width].
// The lowest slices are just the maxilla (they start in front of the origin).
const SKULL: number[][] = [
  [-0.04, 0.058, -0.03, 0.022],
  [-0.03, 0.06, -0.016, 0.028],
  [-0.02, 0.06, 0.03, 0.034],
  [-0.01, 0.058, 0.048, 0.042],
  [0, 0.056, 0.054, 0.044],
  [0.012, 0.054, 0.057, 0.044],
  [0.024, 0.055, 0.058, 0.045],
  [0.036, 0.051, 0.056, 0.044],
  [0.048, 0.044, 0.049, 0.039],
];
const CAVITY_DEEP = hex('#1A1612');

function skull(ctx: Ctx): Part[] {
  const H = ctx.rig.head;
  const k = ctx.body === 'female' ? 0.97 : 1.02;
  const cols = [1, 2, 3].map((i) => SKULL.map((r) => [r[0], r[i]] as const));
  const y0 = SKULL[0][0];
  const y1 = SKULL[SKULL.length - 1][0];
  const g4 = (x: number, sd: number) => Math.exp(-((x / sd) ** 4));
  const orbit = (y: number, lat: number) => g4(Math.abs(lat) - 0.019, 0.0125) * g4(y - 0.008, 0.0115);
  const nasal = (y: number, lat: number) => g4(lat, 0.0062 + 0.004 * Math.max(0, -(y + 0.012) / 0.012)) * g4(y + 0.016, 0.0105);
  const N = 24;
  const stations: TubeStation[] = [];
  for (let i = 0; i < N; i++) {
    const y = y0 + ((y1 - y0) * i) / (N - 1);
    const F = interpSmooth(cols[0], y);
    const B = interpSmooth(cols[1], y);
    const w = interpSmooth(cols[2], y);
    const c = (F - B) / 2;
    const r = (F + B) / 2;
    stations.push({ c: madd3(madd3(H.o, H.u, y * k), H.f, c * k), t: H.u, front: H.f, lateral: H.s, rf: r * k, rb: r * k, rl: w * k, rm: w * k, p: 2.2, v: y });
  }
  const parts: Part[] = [];
  parts.push(
    tube(stations, {
      segs: 34,
      mat: ctx.mode,
      capStart: 0.3,
      capEnd: 0.32,
      capSteps: 4,
      shape: (y, cf, cs, r) => {
        const lat = cs * r;
        const fr = smooth(0.2, 0.7, cf);
        let out = r;
        out -= fr * 0.016 * k * orbit(y, lat);
        out -= fr * 0.011 * k * nasal(y, lat);
        out += fr * 0.0035 * k * Math.exp(-(((y + 0.003) / 0.004) ** 2 + (lat / 0.004) ** 2)); // nasal bones
        out += 0.004 * k * Math.exp(-(((y + 0.006) / 0.006) ** 2 + ((Math.abs(lat) - 0.036 * k) / 0.008) ** 2)) * (cf > 0 ? 1 : 0); // cheekbones
        out -= 0.004 * k * Math.exp(-(((y - 0.012) / 0.01) ** 2)) * smooth(0.6, 0.9, Math.abs(cs)) * (cf > -0.2 && cf < 0.4 ? 1 : 0); // temples
        return out;
      },
      color: (y, cf, cs) => {
        const lat = cs * interpSmooth(cols[2], y) * k;
        const hole = cf > 0.2 ? Math.max(orbit(y, lat), nasal(y, lat)) : 0;
        if (hole > 0.3) return ctx.dens(mixRGBA(IVORY_DARK, CAVITY_DEEP, Math.min(1, (hole - 0.3) / 0.45)), 1 - 0.85 * hole);
        return ctx.dens(IVORY, 1);
      },
    }),
  );
  const P = (f: number, y: number, lat: number) => madd3(madd3(madd3(H.o, H.f, f * k), H.u, y * k), H.s, lat * k);
  // zygomatic arches: cheekbone back to the ear
  for (const sg of [1, -1]) {
    parts.push(rod(ctx, [P(0.034, -0.008, sg * 0.04), P(0.015, -0.007, sg * 0.0435), P(-0.004, -0.005, sg * 0.042)], [0.0034 * k, 0.0026 * k, 0.003 * k], H.u, H.s, { segs: 6 }));
  }
  // mandible: condyle → ramus → angle → body → chin → and back up the other side
  const jaw: V3[] = [];
  const jawFront: V3[] = [];
  const radii: number[] = [];
  const path: [number, number, number][] = [
    [0.0, -0.012, 0.04],
    [0.003, -0.028, 0.039],
    [0.007, -0.043, 0.036],
    [0.03, -0.05, 0.027],
    [0.049, -0.053, 0.013],
    [0.056, -0.055, 0],
  ];
  const full = [...path, ...path.slice(0, -1).reverse().map(([f, y, l]) => [f, y, -l] as [number, number, number])];
  full.forEach(([f, y, l]) => {
    jaw.push(P(f, y, l));
    const ramus = y > -0.042;
    jawFront.push(ramus ? H.f : H.u);
    radii.push(ramus ? 0.0078 : 0.0068);
  });
  const jp = limbPath(jaw, 3, 0.35);
  parts.push(
    tube(
      jp.map((q) => {
        const i = Math.min(jaw.length - 1, Math.round(q.s));
        const r = radii[i] * k;
        return { c: q.c, t: q.t, front: jawFront[i], lateral: H.s, rf: r, rb: r, rl: 0.0028 * k, rm: 0.0028 * k, p: 3 };
      }),
      { segs: 8, mat: ctx.mode, capStart: 0.6, capEnd: 0.6, capSteps: 2, color: () => ctx.ivory },
    ),
  );
  // teeth: upper and lower arches, white crowns with dark gaps
  const arch = (y: number, scale: number) => {
    const pts: V3[] = [];
    for (let i = 0; i <= 8; i++) {
      const a = -1 + (2 * i) / 8;
      const lat = a * 0.021 * scale;
      const f = 0.057 * scale - 0.026 * scale * a * a;
      pts.push(P(f, y, lat));
    }
    const ap = limbPath(pts, 7, 0.3);
    const n = 14;
    return tube(
      ap.map((q) => ({ c: q.c, t: q.t, front: H.u, lateral: H.f, rf: 0.0039 * k, rb: 0.0039 * k, rl: 0.003 * k, rm: 0.003 * k, v: q.s / 8 })),
      {
        segs: 6,
        mat: ctx.mode,
        capStart: 0.5,
        capEnd: 0.5,
        capSteps: 1,
        color: (u) => ((u * n) % 1 < 0.2 ? ctx.dens(CAVITY, 0.3) : ctx.dens(TEETH, 1)),
      },
    );
  };
  parts.push(arch(-0.035, 1), arch(-0.0425, 0.95));
  return parts;
}

// ---- spine ------------------------------------------------------------------

/** 24 vertebra centres (sacrum top → C1) along an S-curve, with each one's local frame. */
export function spineFrames(rig: Rig): { c: V3; fr: Frame; level: 'L' | 'T' | 'C' }[] {
  const P = rig.pelvis;
  const C = rig.chest;
  const H = rig.head;
  const atF = (fr: Frame, f: number, u: number) => madd3(madd3(fr.o, fr.f, f), fr.u, u);
  const mid = frameFrom(lerp3(P.o, C.o, 0.5), lerp3(P.u, C.u, 0.5), lerp3(P.f, C.f, 0.5));
  const ctrl = [
    atF(P, -0.035, 0.06), // sacrum top (L5/S1)
    atF(P, -0.02, 0.12), // lumbar lordosis
    atF(mid, -0.04, 0.02), // L1/T12
    atF(C, -0.058, -0.075), // thoracic kyphosis
    atF(C, -0.042, 0.012), // T1
    madd3(lerp3(rig.neckBase, madd3(H.o, H.u, -0.04), 0.5), H.f, -0.012), // mid-neck
    atF(H, -0.012, -0.036), // C1 under the skull
  ];
  const path = limbPath(ctrl, 12, 0.45);
  // arc-length table
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist3(path[i].c, path[i - 1].c));
  const total = cum[cum.length - 1] || 1;
  const sampleAt = (d: number) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < d) i++;
    const u = (d - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    return { c: lerp3(path[i - 1].c, path[i].c, u), t: norm3(lerp3(path[i - 1].t, path[i].t, u)) };
  };
  // Relative heights: lumbar 5 × 1.45, thoracic 12 × 1.0, cervical 7 × 0.72.
  const levels: { h: number; level: 'L' | 'T' | 'C' }[] = [
    ...Array.from({ length: 5 }, () => ({ h: 1.45, level: 'L' as const })),
    ...Array.from({ length: 12 }, () => ({ h: 1.0, level: 'T' as const })),
    ...Array.from({ length: 7 }, () => ({ h: 0.72, level: 'C' as const })),
  ];
  const sum = levels.reduce((s, l) => s + l.h, 0);
  const out: { c: V3; fr: Frame; level: 'L' | 'T' | 'C' }[] = [];
  let acc = 0;
  levels.forEach((l, i) => {
    const d = ((acc + l.h / 2) / sum) * total;
    acc += l.h;
    const q = sampleAt(d);
    const w = smooth(0, 1, i / 23);
    const front = i < 17 ? lerp3(P.f, C.f, smooth(0, 16, i)) : lerp3(C.f, H.f, w);
    out.push({ c: q.c, fr: frameFrom(q.c, q.t, front), level: l.level });
  });
  return out;
}

function spine(ctx: Ctx): Part[] {
  const parts: Part[] = [];
  const verts = spineFrames(ctx.rig);
  const size = { L: { r: 0.02, h: 0.0115, sp: 0.03, tp: 0.026 }, T: { r: 0.0145, h: 0.0085, sp: 0.032, tp: 0.02 }, C: { r: 0.0105, h: 0.006, sp: 0.018, tp: 0.013 } };
  const disc = ctx.dens(CARTILAGE, 0.3);
  verts.forEach((v, vi) => {
    const s = size[v.level];
    const { fr } = v;
    const a = madd3(v.c, fr.u, -s.h);
    const b = madd3(v.c, fr.u, s.h);
    // vertebral body: a short drum, slightly kidney-shaped (flatter at the back)
    parts.push(
      tube(
        [a, b].map((c) => ({ c, t: fr.u, front: fr.f, lateral: fr.s, rf: s.r, rb: s.r * 0.7, rl: s.r * 1.1, rm: s.r * 1.1 })),
        { segs: 8, mat: ctx.mode, capStart: 0.18, capEnd: 0.18, capSteps: 1, color: () => ctx.ivory },
      ),
    );
    // spinous process: back and (in the thoracic spine) steeply down
    const tilt = v.level === 'T' ? 0.9 : v.level === 'C' ? 0.35 : 0.15;
    const back = norm3(madd3(neg(fr.f), fr.u, -tilt));
    const root = madd3(v.c, fr.f, -s.r * 0.7);
    parts.push(rod(ctx, [root, madd3(root, back, s.sp)], [s.r * 0.35, s.r * 0.22], fr.u, fr.s, { segs: 6, flat: 1.6 }));
    // transverse processes (too small to see on the neck)
    if (v.level !== 'C') for (const sg of [1, -1]) {
      const tdir = norm3(madd3(v3(fr.s.x * sg, fr.s.y * sg, fr.s.z * sg), fr.f, -0.45));
      parts.push(rod(ctx, [root, madd3(root, tdir, s.tp)], [s.r * 0.26, s.r * 0.18], fr.u, fr.f, { segs: 5 }));
    }
    // intervertebral disc above
    if (vi < verts.length - 1) {
      const d0 = b;
      const d1 = madd3(b, fr.u, s.h * 0.5);
      parts.push(
        tube([d0, d1].map((c) => ({ c, t: fr.u, front: fr.f, lateral: fr.s, rf: s.r * 0.92, rb: s.r * 0.65, rl: s.r, rm: s.r })), {
          segs: 8,
          mat: ctx.mode,
          color: () => (ctx.mode === 'xbone' ? disc : ctx.dens(IVORY_DARK, 1)),
        }),
      );
    }
  });
  // sacrum + coccyx: a backward-tilted tapering wedge below L5
  const P = ctx.rig.pelvis;
  const sTop = madd3(madd3(P.o, P.f, -0.035), P.u, 0.05);
  const sacDir = norm3(madd3(neg(P.u), P.f, -0.55));
  const sacFr = frameFrom(madd3(sTop, sacDir, 0.045), neg(sacDir), P.f);
  parts.push(
    blob(sacFr, { f: 0.012, b: 0.016, u: 0.045, d: 0.045, s: 0.038 }, {
      rings: 10,
      segs: 14,
      mat: ctx.mode,
      color: () => ctx.ivory,
      deform: (fx, uy, sz) => ({ front: fx * (fx > 0 ? 0.012 : 0.016), up: uy * 0.045, side: sz * 0.038 * (0.45 + 0.55 * (uy + 1) / 2) }),
    }),
  );
  const cTop = madd3(sTop, sacDir, 0.09);
  parts.push(rod(ctx, [cTop, madd3(madd3(cTop, sacDir, 0.018), P.f, 0.012)], [0.007, 0.003], P.f, P.s, { segs: 6 }));
  return parts;
}

// ---- rib cage ---------------------------------------------------------------

const RIB_W = [0.042, 0.058, 0.068, 0.075, 0.08, 0.083, 0.084, 0.083, 0.08, 0.076, 0.07, 0.062];

function ribcage(ctx: Ctx): Part[] {
  const C = ctx.rig.chest;
  const parts: Part[] = [];
  const kW = ctx.body === 'female' ? 0.93 : 1;
  const cart = ctx.dens(CARTILAGE, 0.38);
  const at = (f: number, u: number, s: number) => madd3(madd3(madd3(C.o, C.f, f), C.u, u), C.s, s);
  const sternTop = -0.032;
  const sternBottom = -0.165;
  for (let i = 0; i < 12; i++) {
    const yBack = -0.03 - 0.0138 * i;
    const drop = 0.035 + 0.0035 * i;
    const w = RIB_W[i] * kW;
    const back = 0.03;
    const spineF = -0.052;
    const centreF = spineF + back;
    const frontD = 0.106 - back;
    const boneEnd = i < 7 ? 128 : i < 10 ? 120 : i === 10 ? 108 : 92;
    for (const sg of [1, -1]) {
      const pt = (deg: number) => {
        const ph = (deg * Math.PI) / 180;
        const cf = -Math.cos(ph);
        const f = centreF + cf * (cf < 0 ? back : frontD);
        return at(f, yBack - drop * (1 - Math.cos(ph)) * 0.5, sg * (0.012 + Math.sin(ph) * (w - 0.006)));
      };
      const bonePts: V3[] = [];
      for (let d = 0; d <= boneEnd; d += boneEnd / 9) bonePts.push(pt(d));
      const path = limbPath(bonePts, 1, 0.01);
      parts.push(
        tube(
          path.map((q, k) => {
            const taper = k === 0 ? 0.7 : 1;
            return { c: q.c, t: q.t, front: C.u, lateral: cross3(q.t, C.u), rf: 0.0058 * taper, rb: 0.0058 * taper, rl: 0.0026, rm: 0.0026 };
          }),
          { segs: 6, mat: ctx.mode, capStart: 0.5, capEnd: 0.5, capSteps: 1, color: () => ctx.ivory },
        ),
      );
      // costal cartilage: true ribs to the sternum, false ribs up to the rib above
      if (i < 10) {
        const s0 = pt(boneEnd);
        const yJoin = i < 7 ? sternTop - 0.012 - i * 0.018 : sternBottom + 0.008 - (i - 7) * 0.012;
        const end = i < 7 ? at(0.056, yJoin, sg * 0.011) : at(0.05 - (i - 7) * 0.006, yJoin + 0.02, sg * (0.026 + (i - 7) * 0.012));
        const midP = lerp3(s0, end, 0.5);
        const ctrl = madd3(midP, C.f, 0.006);
        parts.push(rod(ctx, [s0, ctrl, end], [0.0042, 0.0038, 0.0034], C.u, C.s, { segs: 5, color: cart, caps: 0.4 }));
      }
    }
  }
  // sternum (manubrium + body + xiphoid), flat
  const sTop = at(0.05, sternTop, 0);
  const sMid = at(0.058, (sternTop + sternBottom) / 2, 0);
  const sBot = at(0.062, sternBottom, 0);
  const stern = limbPath([sTop, sMid, sBot], 4, 0.3);
  const widths = [[0, 0.02], [0.18, 0.016], [0.3, 0.013], [0.8, 0.014], [0.95, 0.008], [1, 0.004]] as const;
  parts.push(
    tube(
      stern.map((q) => {
        const w = interpSmooth(widths, q.s / 2);
        return { c: q.c, t: q.t, front: C.f, lateral: C.s, rf: 0.0042, rb: 0.0042, rl: w, rm: w };
      }),
      { segs: 10, mat: ctx.mode, capStart: 0.3, capEnd: 0.3, capSteps: 1, color: () => ctx.ivory },
    ),
  );
  // clavicles: S-curve from the manubrium to the acromion
  for (const side of ['r', 'l'] as Side[]) {
    const sg = side === 'r' ? 1 : -1;
    const sh = ctx.rig.limbs[side].shoulder;
    const acromion = madd3(madd3(sh, C.u, 0.016), C.f, -0.004);
    const a = at(0.048, sternTop + 0.004, sg * 0.014);
    const m1 = at(0.054, sternTop + 0.008, sg * 0.04);
    const m2 = lerp3(at(0.03, sternTop + 0.014, sg * 0.07), acromion, 0.35);
    parts.push(rod(ctx, [a, m1, m2, acromion], [0.0058, 0.0048, 0.0045, 0.0055], C.u, C.f, { segs: 7 }));
    // scapula: a thin curved triangle on the back, with its spine
    const sup = at(-0.062, -0.028, sg * 0.04);
    const inf = at(-0.052, -0.135, sg * 0.058);
    const glen = madd3(madd3(sh, C.f, -0.018), C.s, -sg * 0.012);
    const cen = v3((sup.x + inf.x + glen.x) / 3, (sup.y + inf.y + glen.y) / 3, (sup.z + inf.z + glen.z) / 3);
    const upAx = norm3(sub3(sup, inf));
    const out = perpTo(neg(C.f), upAx, neg(C.f));
    const fr: Frame = frameFrom(cen, upAx, out);
    const sc = blob(fr, { f: 0.004, u: 0.058, s: 0.036 }, {
      rings: 8,
      segs: 12,
      mat: ctx.mode,
      color: () => ctx.ivory,
      deform: (fx, uy, sz) => {
        // triangle: wide at the top, pointed at the bottom; slightly curved to the ribs
        const wide = 0.25 + 0.75 * (uy + 1) / 2;
        const sd = sz * 0.036 * wide;
        return { front: fx * 0.004 - 0.008 * (sd / 0.036) ** 2, up: uy * 0.058, side: sd };
      },
    });
    sc.twoSided = true;
    parts.push(sc);
    const spineA = at(-0.066, -0.05, sg * 0.04);
    parts.push(rod(ctx, [spineA, lerp3(spineA, acromion, 0.6), acromion], [0.003, 0.005, 0.006], C.u, C.f, { segs: 6 }));
  }
  return parts;
}

// ---- pelvis -----------------------------------------------------------------

function pelvis(ctx: Ctx): Part[] {
  const P = ctx.rig.pelvis;
  const kw = ctx.body === 'female' ? 1.08 : 1;
  const parts: Part[] = [];
  const at = (f: number, u: number, s: number) => madd3(madd3(madd3(P.o, P.f, f), P.u, u), P.s, s * kw);
  for (const sg of [1, -1]) {
    // ilium wing: a curved sheet from the acetabulum up to the iliac crest
    const rows = 7;
    const cols = 9;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i < rows; i++) {
      const v = i / (rows - 1);
      for (let j = 0; j < cols; j++) {
        const t = j / (cols - 1);
        const crest = { f: 0.045 - 0.09 * t, u: 0.06 + 0.035 * Math.sin(Math.PI * t), s: 0.078 - 0.042 * t + 0.016 * Math.sin(Math.PI * t) };
        const base = { f: 0.02 - 0.05 * t, u: 0.005 + 0.03 * t, s: 0.05 - 0.022 * t };
        const f = base.f + (crest.f - base.f) * v;
        const u = base.u + (crest.u - base.u) * v;
        const s = base.s + (crest.s - base.s) * v + 0.008 * Math.sin(Math.PI * v) * Math.sin(Math.PI * t);
        const p = at(f, u, sg * s);
        pos.push(p.x, p.y, p.z);
        // the iliac fossa is thin bone: darker in the middle, denser at the rims
        const fossa = Math.sin(Math.PI * v) * Math.sin(Math.PI * t);
        const c = ctx.dens(mixRGBA(IVORY, IVORY_DARK, 0.5 * fossa), 0.5 + 0.5 * (1 - fossa));
        col.push(...c);
      }
    }
    for (let i = 0; i < rows - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = i * cols + j;
        const b = a + 1;
        const c = a + cols;
        const d = c + 1;
        if (sg > 0) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
    parts.push({ pos, col, idx, mat: ctx.mode, twoSided: true });
    // iliac crest rim (thicker edge reads as bone, not paper)
    const crestPts: V3[] = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      crestPts.push(at(0.045 - 0.09 * t, 0.06 + 0.035 * Math.sin(Math.PI * t), sg * (0.078 - 0.042 * t + 0.016 * Math.sin(Math.PI * t))));
    }
    parts.push(rod(ctx, crestPts, [0.0055, 0.006, 0.0055], P.u, P.s, { segs: 6 }));
    // acetabular rim, pubic ramus to the symphysis, ischium loop (obturator foramen)
    const acet = at(0.0, 0.0, sg * 0.05);
    parts.push(rod(ctx, [at(0.022, -0.005, sg * 0.05), at(0.04, -0.022, sg * 0.03), at(0.05, -0.035, sg * 0.008)], [0.008, 0.007, 0.008], P.u, P.s, { segs: 7 }));
    parts.push(
      rod(ctx, [at(-0.012, -0.012, sg * 0.048), at(-0.03, -0.055, sg * 0.044), at(-0.018, -0.075, sg * 0.04), at(0.02, -0.07, sg * 0.024), at(0.045, -0.045, sg * 0.01)], [0.008, 0.009, 0.011, 0.007, 0.007], P.u, P.s, { segs: 7 }),
    );
    parts.push(
      blob(frameFrom(acet, P.u, P.f), { f: 0.02, u: 0.022, s: 0.016 }, {
        rings: 8,
        segs: 12,
        mat: ctx.mode,
        color: () => ctx.ivory,
      }),
    );
  }
  return parts;
}

// ---- legs -------------------------------------------------------------------

function legBones(ctx: Ctx, side: Side): Part[] {
  const j = ctx.rig.limbs[side];
  const P = ctx.rig.pelvis;
  const sg = side === 'r' ? 1 : -1;
  const lateral = v3(P.s.x * sg, P.s.y * sg, P.s.z * sg);
  const thigh = norm3(sub3(j.knee, j.hip));
  const shank = norm3(sub3(j.ankle, j.knee));
  const latT = perpTo(lateral, thigh, lateral);
  const frontT = perpTo(P.f, thigh, P.f);
  const latS = perpTo(lateral, shank, lateral);
  const frontS = perpTo(P.f, shank, P.f);
  const parts: Part[] = [];

  // femur: head in the acetabulum, neck out to the greater trochanter, shaft to the condyles
  parts.push(blob(frameFrom(j.hip, thigh, frontT), { f: 0.021, u: 0.021, s: 0.021 }, { rings: 10, segs: 14, mat: ctx.mode, color: () => ctx.ivory }));
  const troch = madd3(madd3(j.hip, latT, 0.042), thigh, 0.022);
  parts.push(rod(ctx, [j.hip, troch], [0.012, 0.014], frontT, thigh, { segs: 8 }));
  parts.push(blob(frameFrom(madd3(troch, thigh, -0.004), thigh, frontT), { f: 0.013, u: 0.018, s: 0.013 }, { rings: 8, segs: 10, mat: ctx.mode, color: () => ctx.ivory }));
  const kneeTop = madd3(j.knee, thigh, -0.012);
  const shaftMid = madd3(lerp3(troch, kneeTop, 0.5), frontT, 0.006); // slight anterior bow
  parts.push(rod(ctx, [troch, shaftMid, kneeTop], [0.014, 0.0115, 0.017], frontT, latT, { segs: 10 }));
  // condyles: two knuckles, wide side to side
  for (const c of [1, -1]) {
    const o = madd3(madd3(j.knee, thigh, -0.006), latT, c * 0.013);
    parts.push(blob(frameFrom(o, thigh, frontT), { f: 0.015, b: 0.018, u: 0.014, s: 0.012 }, { rings: 8, segs: 10, mat: ctx.mode, color: () => ctx.ivory }));
  }
  // patella
  const kneeFront = norm3(lerp3(frontT, frontS, 0.5));
  parts.push(
    blob(frameFrom(madd3(madd3(j.knee, kneeFront, 0.026), thigh, -0.01), thigh, kneeFront), { f: 0.007, b: 0.004, u: 0.017, d: 0.012, s: 0.015 }, {
      rings: 8,
      segs: 10,
      mat: ctx.mode,
      color: () => ctx.ivory,
    }),
  );
  // tibia (medial, weight-bearing) and fibula (thin, lateral-posterior)
  const tTop = madd3(madd3(j.knee, shank, 0.018), latS, -0.004);
  const tBot = madd3(madd3(j.ankle, latS, -0.006), shank, -0.002);
  parts.push(
    tube(
      [0, 0.06, 0.18, 0.5, 0.82, 0.94, 1].map((u) => {
        const r = interpSmooth([[0, 0.025], [0.06, 0.02], [0.18, 0.014], [0.5, 0.0115], [0.82, 0.012], [0.94, 0.015], [1, 0.016]], u);
        return { c: lerp3(tTop, tBot, u), t: shank, front: frontS, lateral: latS, rf: r * 0.9, rb: r * 0.85, rl: r * 1.15, rm: r * 1.15 };
      }),
      { segs: 10, mat: ctx.mode, capStart: 0.35, capEnd: 0.35, capSteps: 1, color: () => ctx.ivory },
    ),
  );
  const fTop = madd3(madd3(madd3(j.knee, shank, 0.032), latS, 0.022), frontS, -0.008);
  const fBot = madd3(madd3(j.ankle, latS, 0.018), shank, 0.012);
  parts.push(rod(ctx, [fTop, lerp3(fTop, fBot, 0.5), fBot], [0.0075, 0.0048, 0.0075], frontS, latS, { segs: 7 }));

  // foot: frame along the sole
  const along = norm3(sub3(j.toe, j.heel), v3(1, 0, 0));
  const upF = perpTo(sub3(j.ankle, j.heel), along, v3(0, 1, 0));
  const latF = perpTo(lateral, along, lateral);
  const len = dist3(j.heel, j.toe);
  const F = (a: number, u: number, s: number) => madd3(madd3(madd3(j.heel, along, a * len), upF, u), latF, s);
  // talus + calcaneus
  parts.push(blob(frameFrom(F(0.2, 0.034, 0), along, upF), { f: 0.022, u: 0.016, s: 0.016 }, { rings: 8, segs: 10, mat: ctx.mode, color: () => ctx.ivory }));
  parts.push(
    blob(frameFrom(F(0.13, 0.018, 0.002), along, upF), { f: 0.033, b: 0.03, u: 0.016, d: 0.014, s: 0.014 }, {
      rings: 8,
      segs: 12,
      mat: ctx.mode,
      color: () => ctx.ivory,
      deform: (fx, uy, sz) => ({ front: fx * (fx > 0 ? 0.033 : 0.03), up: uy * (uy > 0 ? 0.016 : 0.014) + 0.006 * Math.max(0, -fx), side: sz * 0.014 }),
    }),
  );
  // navicular (medial), cuboid (lateral), cuneiforms
  parts.push(blob(frameFrom(F(0.36, 0.032, -0.008), along, upF), { f: 0.009, u: 0.011, s: 0.012 }, { rings: 6, segs: 8, mat: ctx.mode, color: () => ctx.ivory }));
  parts.push(blob(frameFrom(F(0.36, 0.018, 0.014), along, upF), { f: 0.012, u: 0.01, s: 0.01 }, { rings: 6, segs: 8, mat: ctx.mode, color: () => ctx.ivory }));
  parts.push(blob(frameFrom(F(0.45, 0.028, -0.004), along, upF), { f: 0.01, u: 0.01, s: 0.016 }, { rings: 6, segs: 8, mat: ctx.mode, color: () => ctx.ivory }));
  // metatarsals + phalanges (1st = big toe, medial)
  const rays = [
    { s0: -0.012, s1: -0.02, r: 0.0068, toe: 0.0058 },
    { s0: -0.004, s1: -0.008, r: 0.0045, toe: 0.0036 },
    { s0: 0.004, s1: 0.002, r: 0.0042, toe: 0.0034 },
    { s0: 0.011, s1: 0.012, r: 0.004, toe: 0.0032 },
    { s0: 0.017, s1: 0.022, r: 0.0042, toe: 0.003 },
  ];
  rays.forEach((ray, k) => {
    const base = F(0.5, 0.024 - k * 0.002, ray.s0);
    const head = F(0.78, 0.01, ray.s1);
    parts.push(rod(ctx, [base, lerp3(base, head, 0.5), head], [ray.r * 1.2, ray.r * 0.8, ray.r * 1.15], upF, latF, { segs: 6 }));
    const tipA = k === 0 ? 1.0 : 0.97 - k * 0.03;
    const t1 = F(0.8, 0.008, ray.s1 * 1.05);
    const t2 = F(tipA, 0.006, ray.s1 * 1.1);
    parts.push(rod(ctx, [t1, lerp3(t1, t2, 0.5), t2], [ray.toe, ray.toe * 0.8, ray.toe * 0.85], upF, latF, { segs: 6 }));
  });
  return parts;
}

// ---- arms -------------------------------------------------------------------

function armBones(ctx: Ctx, side: Side): Part[] {
  const j = ctx.rig.limbs[side];
  const C = ctx.rig.chest;
  const sg = side === 'r' ? 1 : -1;
  const lateral = v3(C.s.x * sg, C.s.y * sg, C.s.z * sg);
  const upper = norm3(sub3(j.elbow, j.shoulder));
  const fore = norm3(sub3(j.wrist, j.elbow));
  const latU = perpTo(lateral, upper, lateral);
  const frontU = perpTo(C.f, upper, C.f);
  const latF = perpTo(lateral, fore, lateral);
  const frontF = perpTo(C.f, fore, C.f);
  const k = ctx.body === 'female' ? 0.9 : 1;
  const parts: Part[] = [];
  // humerus
  parts.push(blob(frameFrom(j.shoulder, upper, frontU), { f: 0.019 * k, u: 0.019 * k, s: 0.019 * k }, { rings: 10, segs: 12, mat: ctx.mode, color: () => ctx.ivory }));
  const hBot = madd3(j.elbow, upper, -0.008);
  parts.push(rod(ctx, [madd3(j.shoulder, upper, 0.01), lerp3(j.shoulder, hBot, 0.5), hBot], [0.012 * k, 0.0095 * k, 0.012 * k], frontU, latU, { segs: 9 }));
  parts.push(blob(frameFrom(hBot, upper, frontU), { f: 0.011 * k, u: 0.01 * k, s: 0.022 * k }, { rings: 8, segs: 10, mat: ctx.mode, color: () => ctx.ivory }));
  // ulna (olecranon behind the elbow) and radius (thumb side)
  const uTop = madd3(j.elbow, frontF, -0.012 * k);
  const uBot = madd3(madd3(j.wrist, frontF, -0.007 * k), fore, -0.004);
  parts.push(rod(ctx, [madd3(uTop, fore, -0.012), lerp3(uTop, uBot, 0.45), uBot], [0.009 * k, 0.0065 * k, 0.0055 * k], frontF, latF, { segs: 7 }));
  const rTop = madd3(madd3(j.elbow, fore, 0.01), frontF, 0.004 * k);
  const rBot = madd3(j.wrist, frontF, 0.007 * k);
  parts.push(rod(ctx, [rTop, lerp3(rTop, rBot, 0.55), rBot], [0.0055 * k, 0.006 * k, 0.0095 * k], frontF, latF, { segs: 7 }));
  // hand: carpus, metacarpals and curled fingers (palm faces the body)
  const handDir = norm3(sub3(j.hand, j.wrist), fore);
  const fr = frameFrom(j.wrist, handDir, C.f);
  const medial = v3(-lateral.x, -lateral.y, -lateral.z);
  const curlDir = perpTo(medial, handDir, medial);
  const H = (u: number, w: number, curl: number) => madd3(madd3(madd3(fr.o, fr.u, u * k), fr.f, w * k), curlDir, curl * k);
  parts.push(blob(frameFrom(H(0.014, 0, 0), handDir, fr.f), { f: 0.014 * k, u: 0.01 * k, s: 0.008 * k }, { rings: 6, segs: 10, mat: ctx.mode, color: () => ctx.ivory }));
  [0.011, 0.0035, -0.0035, -0.011].forEach((w, i) => {
    const len = [1, 1.04, 0.98, 0.88][i];
    parts.push(rod(ctx, [H(0.022, w * 0.7, 0), H(0.06 * len, w, 0.002)], [0.0036, 0.0034], fr.f, curlDir, { segs: 5 }));
    parts.push(rod(ctx, [H(0.064 * len, w, 0.003), H(0.084 * len, w, 0.01), H(0.088 * len, w, 0.024)], [0.0031, 0.0027, 0.0022], fr.f, curlDir, { segs: 5 }));
  });
  parts.push(rod(ctx, [H(0.018, 0.012, 0.002), H(0.036, 0.024, 0.006), H(0.05, 0.03, 0.014)], [0.0042, 0.0034, 0.0028], fr.f, curlDir, { segs: 5 }));
  return parts;
}
