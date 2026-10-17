import { cross3, dot3, norm3, perpTo, type Frame, type V3 } from './math';

/**
 * Mesh primitives for the replay figure, rebuilt every frame straight in world
 * space (cheaper and simpler than skinning at these sizes: ~5k vertices).
 *
 * The workhorse is `tube`: a loft along a centreline whose cross-section is an
 * asymmetric (super)ellipse — separate front/back and lateral/medial radii —
 * which is what makes a calf bulge backwards, a thigh fuller in front or a
 * torso deeper at the chest. Winding is always outward (normal = along × around),
 * so the renderer can cull back faces by normal.
 */

export type Mat = 'skin' | 'cloth' | 'shoe' | 'sole' | 'hair' | 'eye' | 'lip' | 'bone' | 'xshell' | 'xbone';
export type RGBA = [number, number, number, number];

export interface Part {
  /** xyz per vertex, world units */
  pos: number[];
  /** rgba albedo per vertex (0..1); alpha = opacity */
  col: number[];
  /** triangles, indices into this part's vertices */
  idx: number[];
  mat: Mat;
  /** render back faces too (thin plates) */
  twoSided?: boolean;
  /** added to this part's depth when sorting: >0 loses ties to surfaces it plugs into */
  bias?: number;
}

export const hex = (h: string, a = 1): RGBA => {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, a];
};
export const mixRGBA = (a: RGBA, b: RGBA, t: number): RGBA => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];

/** Indices for a ring grid (rows × segs, wrapping around) plus optional poles; cached by shape. */
const gridCache = new Map<string, number[]>();
function gridIndices(rows: number, segs: number, startPole: boolean, endPole: boolean): number[] {
  const key = `${rows}:${segs}:${startPole ? 1 : 0}${endPole ? 1 : 0}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const idx: number[] = [];
  const base = startPole ? 1 : 0;
  const v = (i: number, j: number) => base + i * segs + (j % segs);
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i, j + 1);
      const d = v(i + 1, j + 1);
      idx.push(a, b, c, c, b, d);
    }
  }
  if (startPole) for (let j = 0; j < segs; j++) idx.push(0, v(0, j), v(0, j + 1));
  if (endPole) {
    const pole = base + rows * segs;
    for (let j = 0; j < segs; j++) idx.push(pole, v(rows - 1, j + 1), v(rows - 1, j));
  }
  gridCache.set(key, idx);
  return idx;
}

export interface TubeStation {
  /** centre */
  c: V3;
  /** unit tangent (direction of travel along the tube) */
  t: V3;
  /** anatomical front reference (need not be ⟂ t) */
  front: V3;
  /** anatomical lateral reference (need not be ⟂ t) */
  lateral: V3;
  /** radii toward front / back / lateral / medial */
  rf: number;
  rb: number;
  rl: number;
  rm: number;
  /** superellipse exponent (2 = ellipse, >2 boxier) */
  p?: number;
  /** parameter handed to color/shape (default: station index / (n-1)) */
  v?: number;
}

export interface TubeOptions {
  segs: number;
  mat: Mat;
  /** albedo for a surface point: u = station index / (n-1), cf/cs = unit front/lateral components */
  color: (u: number, cf: number, cs: number) => RGBA;
  /** radius multiplier / extra radius (cloth over skin, bumps); optional */
  shape?: (u: number, cf: number, cs: number, r: number) => number;
  /** rounded end caps, as a multiple of the end radius (0 = flat-ish pole) */
  capStart?: number;
  capEnd?: number;
  /** rings used to round each cap (default 3; small parts can use 1–2) */
  capSteps?: number;
}

/**
 * Per-vertex shape cache. A figure's surface radius and colour at each vertex
 * depend only on its build parameters (body, view, the vertex's place on the
 * tube), never on the pose — so they are computed on the first frame and reused,
 * and each later frame only re-places vertices along the posed rings. Builders
 * run inside `withMeshCache(scope, …)`; every tube/blob call then gets a stable
 * key from its call order (identical every frame) plus its vertex count.
 */
const shapeCache = new Map<string, { r: Float32Array; col: number[] }>();

/**
 * Level of detail (0.5–1): scales how many vertices go around every ring and
 * blob. The replay lowers it on slow devices so the figure keeps moving smoothly.
 */
let detail = 1;
export function setDetail(d: number) {
  detail = Math.min(1, Math.max(0.5, d));
}
const lod = (n: number, min: number) => Math.max(min, Math.round(n * detail));
let cacheScope: string | null = null;
let cacheSeq = 0;
export function withMeshCache<T>(scope: string, build: () => T): T {
  const prev = cacheScope;
  const prevSeq = cacheSeq;
  cacheScope = scope;
  cacheSeq = 0;
  try {
    return build();
  } finally {
    cacheScope = prev;
    cacheSeq = prevSeq;
  }
}
function cacheSlot(count: number): { key: string | null; hit: { r: Float32Array; col: number[] } | undefined } {
  if (!cacheScope) return { key: null, hit: undefined };
  const key = `${cacheScope}#${cacheSeq++}:${count}`;
  return { key, hit: shapeCache.get(key) };
}

/** Polar radius of an asymmetric superellipse in direction (cf, cs). */
export function sectionRadius(st: TubeStation, cf: number, cs: number): number {
  const a = cf >= 0 ? st.rf : st.rb;
  const b = cs >= 0 ? st.rl : st.rm;
  const p = st.p ?? 2;
  if (p === 2) return 1 / Math.sqrt((cf * cf) / (a * a) + (cs * cs) / (b * b) || 1e-12);
  return Math.pow(Math.pow(Math.abs(cf) / a, p) + Math.pow(Math.abs(cs) / b, p) || 1e-12, -1 / p);
}

/**
 * Loft through `stations`. Rounded caps are added as extra rings that close in
 * along a quarter circle, ending in a pole vertex.
 */
export function tube(stations: TubeStation[], o: TubeOptions): Part {
  const segs = lod(o.segs, 5);
  const cosT: number[] = [];
  const sinT: number[] = [];
  for (let j = 0; j < segs; j++) {
    const th = (j / segs) * Math.PI * 2;
    cosT.push(Math.cos(th));
    sinT.push(Math.sin(th));
  }
  type Ring = { c: V3; t: V3; e1: V3; e2: V3; A: V3; Lt: V3; st: TubeStation; u: number; scale: number };
  const rings: Ring[] = [];
  const n = stations.length;
  const ringOf = (st: TubeStation, u: number, c: V3, scale: number): Ring => {
    const t = st.t;
    // e2 = lateral ⟂ t; e1 = t × e2 makes (e1, e2, t) right-handed → outward winding.
    const e2 = perpTo(st.lateral, t, perpTo({ x: 0, y: 0, z: 1 }, t, { x: 1, y: 0, z: 0 }));
    const e1 = cross3(t, e2);
    const A = perpTo(st.front, t, e1);
    const Lt = perpTo(st.lateral, t, e2);
    return { c, t, e1, e2, A, Lt, st, u, scale };
  };
  const capRings = (st: TubeStation, u: number, dir: 1 | -1, k: number, steps: number): Ring[] => {
    const out: Ring[] = [];
    const r = Math.max(st.rf, st.rb, st.rl, st.rm);
    for (let i = 1; i <= steps; i++) {
      const phi = (i / (steps + 1)) * (Math.PI / 2);
      const off = Math.sin(phi) * r * k * dir;
      out.push(ringOf(st, u, { x: st.c.x + st.t.x * off, y: st.c.y + st.t.y * off, z: st.c.z + st.t.z * off }, Math.cos(phi)));
    }
    return out;
  };
  const capSteps = o.capSteps ?? 3;
  const v0 = stations[0].v ?? 0;
  const v1 = stations[n - 1].v ?? 1;
  if (o.capStart) rings.push(...capRings(stations[0], v0, -1, o.capStart, capSteps).reverse());
  stations.forEach((st, i) => rings.push(ringOf(st, st.v ?? (n > 1 ? i / (n - 1) : 0), st.c, 1)));
  if (o.capEnd) rings.push(...capRings(stations[n - 1], v1, 1, o.capEnd, capSteps));

  const startPole = !!o.capStart;
  const endPole = !!o.capEnd;
  const count = rings.length * segs + (startPole ? 1 : 0) + (endPole ? 1 : 0);
  const { key, hit } = cacheSlot(count);
  const radius = hit ? hit.r : new Float32Array(count);
  const col: number[] = hit ? hit.col : new Array(count * 4);
  const pos: number[] = new Array(count * 3);
  let vi = 0;
  const put = (x: number, y: number, z: number, c: RGBA | null) => {
    pos[vi * 3] = x;
    pos[vi * 3 + 1] = y;
    pos[vi * 3 + 2] = z;
    if (c) {
      col[vi * 4] = c[0];
      col[vi * 4 + 1] = c[1];
      col[vi * 4 + 2] = c[2];
      col[vi * 4 + 3] = c[3];
    }
    vi++;
  };
  if (startPole) {
    const st = stations[0];
    const r = Math.max(st.rf, st.rb, st.rl, st.rm) * (o.capStart ?? 0);
    put(st.c.x - st.t.x * r, st.c.y - st.t.y * r, st.c.z - st.t.z * r, hit ? null : o.color(v0, 0, 0));
  }
  for (const R of rings) {
    for (let j = 0; j < segs; j++) {
      const dx = R.e1.x * cosT[j] + R.e2.x * sinT[j];
      const dy = R.e1.y * cosT[j] + R.e2.y * sinT[j];
      const dz = R.e1.z * cosT[j] + R.e2.z * sinT[j];
      let r: number;
      if (hit) {
        r = radius[vi];
        put(R.c.x + dx * r, R.c.y + dy * r, R.c.z + dz * r, null);
      } else {
        const cf = dx * R.A.x + dy * R.A.y + dz * R.A.z;
        const cs = dx * R.Lt.x + dy * R.Lt.y + dz * R.Lt.z;
        r = sectionRadius(R.st, cf, cs);
        if (o.shape) r = o.shape(R.u, cf, cs, r);
        r *= R.scale;
        radius[vi] = r;
        put(R.c.x + dx * r, R.c.y + dy * r, R.c.z + dz * r, o.color(R.u, cf, cs));
      }
    }
  }
  if (endPole) {
    const st = stations[n - 1];
    const r = Math.max(st.rf, st.rb, st.rl, st.rm) * (o.capEnd ?? 0);
    put(st.c.x + st.t.x * r, st.c.y + st.t.y * r, st.c.z + st.t.z * r, hit ? null : o.color(v1, 0, 0));
  }
  if (key && !hit) shapeCache.set(key, { r: radius, col });
  return { pos, col, idx: gridIndices(rings.length, segs, startPole, endPole), mat: o.mat };
}

/**
 * A lat-long ellipsoid in `fr` (radii along front / up / right), with an optional
 * displacement of each surface point — used for the head, hands, eyes, ears and bone ends.
 * `deform` gets the unit-sphere direction in frame coordinates (front, up, side).
 */
export function blob(
  fr: Frame,
  radii: { f: number; b?: number; u: number; d?: number; s: number },
  o: {
    rings: number;
    segs: number;
    mat: Mat;
    color: (front: number, up: number, side: number) => RGBA;
    deform?: (front: number, up: number, side: number) => { front: number; up: number; side: number };
  },
): Part {
  const ringsN = lod(o.rings, 5);
  const segsN = lod(o.segs, 6);
  const count = 2 + (ringsN - 1) * segsN;
  const { key, hit } = cacheSlot(count * 3);
  // cached: local (front, up, side) offsets per vertex + colours
  const local = hit ? hit.r : new Float32Array(count * 3);
  const col: number[] = hit ? hit.col : new Array(count * 4);
  const pos: number[] = new Array(count * 3);
  let vi = 0;
  const push = (fx: number, uy: number, sz: number) => {
    let a: number;
    let b: number;
    let c: number;
    if (hit) {
      a = local[vi * 3];
      b = local[vi * 3 + 1];
      c = local[vi * 3 + 2];
    } else {
      a = fx * (fx >= 0 ? radii.f : (radii.b ?? radii.f));
      b = uy * (uy >= 0 ? radii.u : (radii.d ?? radii.u));
      c = sz * radii.s;
      if (o.deform) {
        const d = o.deform(fx, uy, sz);
        a = d.front;
        b = d.up;
        c = d.side;
      }
      local[vi * 3] = a;
      local[vi * 3 + 1] = b;
      local[vi * 3 + 2] = c;
      const k = o.color(fx, uy, sz);
      col[vi * 4] = k[0];
      col[vi * 4 + 1] = k[1];
      col[vi * 4 + 2] = k[2];
      col[vi * 4 + 3] = k[3];
    }
    pos[vi * 3] = fr.o.x + fr.f.x * a + fr.u.x * b + fr.s.x * c;
    pos[vi * 3 + 1] = fr.o.y + fr.f.y * a + fr.u.y * b + fr.s.y * c;
    pos[vi * 3 + 2] = fr.o.z + fr.f.z * a + fr.u.z * b + fr.s.z * c;
    vi++;
  };
  // Poles on the up axis; rings of latitude between.
  push(0, 1, 0);
  for (let i = 1; i < ringsN; i++) {
    const phi = (i / ringsN) * Math.PI;
    const y = Math.cos(phi);
    const rr = Math.sin(phi);
    for (let j = 0; j < segsN; j++) {
      const th = (j / segsN) * Math.PI * 2;
      push(Math.cos(th) * rr, y, Math.sin(th) * rr);
    }
  }
  push(0, -1, 0);
  if (key && !hit) shapeCache.set(key, { r: local, col });
  return { pos, col, idx: blobIndices(ringsN, segsN), mat: o.mat };
}

const blobCache = new Map<string, number[]>();
function blobIndices(ringsN: number, segs: number): number[] {
  const k = `${ringsN}:${segs}`;
  const hit = blobCache.get(k);
  if (hit) return hit;
  const idx: number[] = [];
  const rows = ringsN - 1;
  const v = (i: number, j: number) => 1 + i * segs + (j % segs);
  // Orientation: around = front→side, along = top→bottom, frame s = f × u ⇒
  // (front→side) × (down) points outward when wound (a, c, b).
  for (let j = 0; j < segs; j++) idx.push(0, v(0, j + 1), v(0, j));
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = v(i, j);
      const b = v(i + 1, j);
      const c = v(i, j + 1);
      const d = v(i + 1, j + 1);
      idx.push(a, c, b, c, d, b);
    }
  }
  const bottom = 1 + rows * segs;
  for (let j = 0; j < segs; j++) idx.push(bottom, v(rows - 1, j), v(rows - 1, j + 1));
  blobCache.set(k, idx);
  return idx;
}

/** Area-weighted vertex normals (outward for parts wound as above). */
export function vertexNormals(part: Part): Float32Array {
  const { pos, idx } = part;
  const n = new Float32Array(pos.length);
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k] * 3;
    const b = idx[k + 1] * 3;
    const c = idx[k + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    n[a] += nx;
    n[a + 1] += ny;
    n[a + 2] += nz;
    n[b] += nx;
    n[b + 1] += ny;
    n[b + 2] += nz;
    n[c] += nx;
    n[c + 1] += ny;
    n[c + 2] += nz;
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.sqrt(n[i] * n[i] + n[i + 1] * n[i + 1] + n[i + 2] * n[i + 2]) || 1;
    n[i] /= l;
    n[i + 1] /= l;
    n[i + 2] /= l;
  }
  return n;
}

/** Stations along a polyline of joints, with the corners rounded (a knee or elbow bends smoothly). */
export function limbPath(
  joints: V3[],
  samplesPerSegment: number,
  roundness = 0.16,
): { c: V3; t: V3; s: number }[] {
  const out: { c: V3; t: V3; s: number }[] = [];
  const segs = joints.length - 1;
  for (let k = 0; k < segs; k++) {
    const a = joints[k];
    const b = joints[k + 1];
    const last = k === segs - 1;
    for (let i = 0; i < (last ? samplesPerSegment + 1 : samplesPerSegment); i++) {
      const u = i / samplesPerSegment;
      const s = k + u;
      let c = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u };
      let t = norm3({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
      // Round the joint: within `roundness` of an interior joint, follow a quadratic
      // Bézier through the corner instead of the sharp polyline.
      const nearEnd = k < segs - 1 && u > 1 - roundness;
      const nearStart = k > 0 && u < roundness;
      if (nearEnd || nearStart) {
        const j = nearEnd ? k + 1 : k;
        const P0 = joints[j - 1];
        const P1 = joints[j];
        const P2 = joints[j + 1];
        const q0 = lerpV(P1, P0, roundness);
        const q2 = lerpV(P1, P2, roundness);
        const w = nearEnd ? (u - (1 - roundness)) / (2 * roundness) : 0.5 + u / (2 * roundness);
        c = bez(q0, P1, q2, w);
        t = norm3(bezT(q0, P1, q2, w), t);
      }
      out.push({ c, t, s });
    }
  }
  return out;
}
/**
 * Insert a pair of coincident stations at each `edges` value of s, straddling it
 * by ±1e-4, so colour (and cloth thickness) can switch crisply on a ring there
 * instead of smearing across a whole band of triangles.
 */
export function withEdges(path: { c: V3; t: V3; s: number }[], edges: number[]): { c: V3; t: V3; s: number }[] {
  const out = [...path];
  for (const e of edges) {
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1];
      const b = out[i];
      if (a.s < e && b.s > e) {
        const u = (e - a.s) / (b.s - a.s);
        const c = lerpV(a.c, b.c, u);
        const t = norm3(lerpV(a.t, b.t, u), a.t);
        out.splice(i, 0, { c, t, s: e - 1e-4 }, { c, t, s: e + 1e-4 });
        break;
      }
    }
  }
  return out;
}

const lerpV = (a: V3, b: V3, u: number): V3 => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u });
const bez = (a: V3, b: V3, c: V3, t: number): V3 => {
  const m = 1 - t;
  return {
    x: m * m * a.x + 2 * m * t * b.x + t * t * c.x,
    y: m * m * a.y + 2 * m * t * b.y + t * t * c.y,
    z: m * m * a.z + 2 * m * t * b.z + t * t * c.z,
  };
};
const bezT = (a: V3, b: V3, c: V3, t: number): V3 => ({
  x: 2 * (1 - t) * (b.x - a.x) + 2 * t * (c.x - b.x),
  y: 2 * (1 - t) * (b.y - a.y) + 2 * t * (c.y - b.y),
  z: 2 * (1 - t) * (b.z - a.z) + 2 * t * (c.z - b.z),
});

/** Outward check used by tests: mean of (normal · (p − centre)) over a part. */
export function outwardScore(part: Part, centre: V3): number {
  const n = vertexNormals(part);
  let s = 0;
  for (let i = 0; i < part.pos.length; i += 3) {
    const d = norm3({ x: part.pos[i] - centre.x, y: part.pos[i + 1] - centre.y, z: part.pos[i + 2] - centre.z });
    s += dot3({ x: n[i], y: n[i + 1], z: n[i + 2] }, d);
  }
  return s / (part.pos.length / 3);
}
