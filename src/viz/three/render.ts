import { cross3, norm3, sub3, v3, type V3 } from './math';
import { vertexNormals, type Mat, type Part, type RGBA } from './mesh';

/**
 * Software 3D → 2D: lights every vertex (per-material model), projects with a
 * perspective camera, culls back faces and depth-sorts the triangles
 * (painter's algorithm), producing flat batches of screen-space triangles with
 * per-vertex colour. Both backends — Skia vertices on device, WebGL on web —
 * just draw those batches, so what is verified on web is what ships.
 */

export interface Camera {
  /** orbit angle around the vertical axis, radians (0 = original side view) */
  yaw: number;
  /** elevation, radians (positive looks down) */
  pitch: number;
  dist: number;
  target: V3;
  /** vertical field of view, radians */
  fov: number;
  width: number;
  height: number;
}

export type Blend = 'normal' | 'add';

export interface Batch {
  blend: Blend;
  /** x,y pixels per vertex */
  xy: Float32Array;
  /** r,g,b,a 0..1 per vertex */
  rgba: Float32Array;
  /** triangles; every index < 65536 (Skia's limit) */
  idx: Uint16Array;
}

export interface Look {
  /** background, top → bottom */
  bg: [RGBA, RGBA];
  floor: RGBA;
  grid: RGBA;
  shadow: number;
}

export interface Projector {
  eye: V3;
  right: V3;
  up: V3;
  fwd: V3;
  focal: number;
  cx: number;
  cy: number;
  /** camera-space depth of a world point */
  depth: (p: V3) => number;
  /** screen point (pixels) of a world point; null if behind the camera */
  project: (p: V3) => { x: number; y: number; z: number } | null;
}

export function projector(cam: Camera): Projector {
  const cp = Math.cos(cam.pitch);
  const eye = v3(
    cam.target.x + cam.dist * cp * Math.sin(cam.yaw),
    cam.target.y + cam.dist * Math.sin(cam.pitch),
    cam.target.z + cam.dist * cp * Math.cos(cam.yaw),
  );
  const fwd = norm3(sub3(cam.target, eye));
  const right = norm3(cross3(fwd, v3(0, 1, 0)), v3(1, 0, 0));
  const up = cross3(right, fwd);
  const focal = cam.height / 2 / Math.tan(cam.fov / 2);
  const cx = cam.width / 2;
  const cy = cam.height / 2;
  const depth = (p: V3) => (p.x - eye.x) * fwd.x + (p.y - eye.y) * fwd.y + (p.z - eye.z) * fwd.z;
  const project = (p: V3) => {
    const dx = p.x - eye.x;
    const dy = p.y - eye.y;
    const dz = p.z - eye.z;
    const z = dx * fwd.x + dy * fwd.y + dz * fwd.z;
    if (z < 0.05) return null;
    return {
      x: cx + ((dx * right.x + dy * right.y + dz * right.z) / z) * focal,
      y: cy - ((dx * up.x + dy * up.y + dz * up.z) / z) * focal,
      z,
    };
  };
  return { eye, right, up, fwd, focal, cx, cy, depth, project };
}

// ---- lighting ---------------------------------------------------------------

interface MatModel {
  /** wrap lighting (0 = lambert); skin-like softness */
  wrap: number;
  spec: number;
  shininess: number;
  rim: number;
  /** additive x-ray look: colour fixed, alpha from facing ratio */
  xray?: { color: RGBA; base: number; edge: number; power: number };
  blend: Blend;
}
const MODELS: Record<Mat, MatModel> = {
  skin: { wrap: 0.38, spec: 0.13, shininess: 22, rim: 0.22, blend: 'normal' },
  cloth: { wrap: 0.2, spec: 0.035, shininess: 8, rim: 0.2, blend: 'normal' },
  shoe: { wrap: 0.15, spec: 0.22, shininess: 28, rim: 0.16, blend: 'normal' },
  sole: { wrap: 0.1, spec: 0.05, shininess: 8, rim: 0.1, blend: 'normal' },
  hair: { wrap: 0.25, spec: 0.16, shininess: 14, rim: 0.28, blend: 'normal' },
  eye: { wrap: 0.3, spec: 0.55, shininess: 70, rim: 0, blend: 'normal' },
  lip: { wrap: 0.38, spec: 0.2, shininess: 30, rim: 0.1, blend: 'normal' },
  bone: { wrap: 0.25, spec: 0.16, shininess: 18, rim: 0.18, blend: 'normal' },
  xshell: { wrap: 0, spec: 0, shininess: 1, rim: 0, blend: 'add', xray: { color: [0.36, 0.72, 1, 1], base: 0.035, edge: 0.75, power: 2.6 } },
  xbone: { wrap: 0, spec: 0, shininess: 1, rim: 0, blend: 'add', xray: { color: [0.8, 0.92, 1, 1], base: 0.1, edge: 0.5, power: 1.4 } },
};

export interface Lights {
  key: V3;
  fill: V3;
  sky: RGBA;
  ground: RGBA;
  keyColor: RGBA;
  fillColor: RGBA;
  rimColor: RGBA;
}

/** Studio lights that travel with the camera (key from upper front-left). */
export function cameraLights(p: Projector): Lights {
  const toCam = { x: -p.fwd.x, y: -p.fwd.y, z: -p.fwd.z };
  const comb = (a: number, b: number, c: number) =>
    norm3(v3(p.right.x * a + p.up.x * b + toCam.x * c, p.right.y * a + p.up.y * b + toCam.y * c, p.right.z * a + p.up.z * b + toCam.z * c));
  return {
    key: comb(-0.5, 0.62, 0.62),
    fill: comb(0.75, 0.1, 0.35),
    sky: [0.42, 0.45, 0.52, 1],
    ground: [0.2, 0.17, 0.15, 1],
    keyColor: [1.0, 0.96, 0.9, 1],
    fillColor: [0.32, 0.38, 0.5, 1],
    rimColor: [0.85, 0.9, 1, 1],
  };
}

function shade(
  out: Float32Array,
  o: number,
  albedo: number[],
  ai: number,
  nx: number,
  ny: number,
  nz: number,
  vx: number,
  vy: number,
  vz: number,
  m: MatModel,
  L: Lights,
) {
  const ndv = nx * vx + ny * vy + nz * vz;
  if (m.xray) {
    const f = Math.pow(1 - Math.min(1, Math.abs(ndv)), m.xray.power);
    const a = Math.min(1, (m.xray.base + m.xray.edge * f) * albedo[ai + 3]);
    out[o] = m.xray.color[0];
    out[o + 1] = m.xray.color[1];
    out[o + 2] = m.xray.color[2];
    out[o + 3] = a;
    return;
  }
  const hemi = 0.5 + 0.5 * ny;
  const kd = nx * L.key.x + ny * L.key.y + nz * L.key.z;
  const key = Math.max(0, (kd + m.wrap) / (1 + m.wrap));
  const fd = Math.max(0, nx * L.fill.x + ny * L.fill.y + nz * L.fill.z);
  // Blinn-Phong on the key
  let hx = L.key.x + vx;
  let hy = L.key.y + vy;
  let hz = L.key.z + vz;
  const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
  hx /= hl;
  hy /= hl;
  hz /= hl;
  const spec = kd > 0 ? m.spec * Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), m.shininess) : 0;
  const rim = m.rim * Math.pow(1 - Math.max(0, ndv), 3);
  for (let c = 0; c < 3; c++) {
    const amb = L.ground[c] + (L.sky[c] - L.ground[c]) * hemi;
    // warm subsurface tint where wrap light reaches past the terminator (skin)
    const sss = m.wrap > 0.3 && c === 0 ? 0.08 * Math.max(0, key - Math.max(0, kd)) : 0;
    let v = albedo[ai + c] * (amb * 0.75 + L.keyColor[c] * key * 0.95 + L.fillColor[c] * fd * 0.5) + sss + spec + rim * L.rimColor[c];
    // soft shoulder instead of a hard clip (continuous, slope 1 at the knee)
    if (v > 0.85) v = 0.85 + 0.15 * (1 - Math.exp(-(v - 0.85) / 0.15));
    out[o + c] = v < 0 ? 0 : v;
  }
  out[o + 3] = albedo[ai + 3];
}

// ---- scene → batches ---------------------------------------------------------

interface Prepared {
  part: Part;
  model: MatModel;
  /** screen xy */
  sx: Float32Array;
  /** camera depth */
  sz: Float32Array;
  rgba: Float32Array;
  visible: Uint8Array;
}

function prepare(part: Part, P: Projector, L: Lights): Prepared {
  const model = MODELS[part.mat];
  const n = vertexNormals(part);
  const count = part.pos.length / 3;
  const sx = new Float32Array(count * 2);
  const sz = new Float32Array(count);
  const rgba = new Float32Array(count * 4);
  const visible = new Uint8Array(count);
  const pos = part.pos;
  for (let i = 0; i < count; i++) {
    const px = pos[i * 3];
    const py = pos[i * 3 + 1];
    const pz = pos[i * 3 + 2];
    const dx = px - P.eye.x;
    const dy = py - P.eye.y;
    const dz = pz - P.eye.z;
    const z = dx * P.fwd.x + dy * P.fwd.y + dz * P.fwd.z;
    sz[i] = z;
    if (z > 0.05) {
      visible[i] = 1;
      sx[i * 2] = P.cx + ((dx * P.right.x + dy * P.right.y + dz * P.right.z) / z) * P.focal;
      sx[i * 2 + 1] = P.cy - ((dx * P.up.x + dy * P.up.y + dz * P.up.z) / z) * P.focal;
    }
    const il = 1 / (Math.sqrt(dx * dx + dy * dy + dz * dz) || 1);
    let nx = n[i * 3];
    let ny = n[i * 3 + 1];
    let nz = n[i * 3 + 2];
    // Thin two-sided plates (ilium, scapula) are lit from whichever side faces us.
    if (part.twoSided && nx * dx + ny * dy + nz * dz > 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    shade(rgba, i * 4, part.col, i * 4, nx, ny, nz, -dx * il, -dy * il, -dz * il, model, L);
  }
  return { part, model, sx, sz, rgba, visible };
}

/**
 * Triangles of one blend group, depth-sorted far → near (painter's algorithm),
 * packed into ≤65k-vertex batches. Typed arrays + a bucket sort on quantised
 * depth keep this linear-time: it runs every frame on the JS thread.
 */
function packSorted(items: Prepared[], P: Projector, blend: Blend, cull: boolean): Batch[] {
  let total = 0;
  for (const it of items) total += it.part.idx.length / 3;
  const triItem = new Uint16Array(total);
  const triK = new Uint32Array(total);
  const triD = new Float32Array(total);
  let n = 0;
  let dMin = Infinity;
  let dMax = -Infinity;
  items.forEach((it, item) => {
    const { idx, pos } = it.part;
    const twoSided = !!it.part.twoSided || !cull;
    const bias3 = 3 * (it.part.bias ?? 0);
    const vis = it.visible;
    const sz = it.sz;
    const ex = P.eye.x;
    const ey = P.eye.y;
    const ez = P.eye.z;
    for (let k = 0; k < idx.length; k += 3) {
      const a = idx[k];
      const b = idx[k + 1];
      const c = idx[k + 2];
      if (!vis[a] || !vis[b] || !vis[c]) continue;
      if (!twoSided) {
        // geometric normal vs. view ray (back-face cull)
        const ax = pos[a * 3];
        const ay = pos[a * 3 + 1];
        const az = pos[a * 3 + 2];
        const ux = pos[b * 3] - ax;
        const uy = pos[b * 3 + 1] - ay;
        const uz = pos[b * 3 + 2] - az;
        const vx = pos[c * 3] - ax;
        const vy = pos[c * 3 + 1] - ay;
        const vz = pos[c * 3 + 2] - az;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        if (nx * (ex - ax) + ny * (ey - ay) + nz * (ez - az) <= 0) continue;
      }
      const d = sz[a] + sz[b] + sz[c] + bias3;
      triItem[n] = item;
      triK[n] = k;
      triD[n] = d;
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
      n++;
    }
  });

  // far → near order (additive blending is order-independent: keep build order)
  let order: Uint32Array;
  if (blend === 'normal' && n > 1) {
    const B = 4096;
    const span = dMax - dMin || 1;
    const bucket = new Uint16Array(n);
    const counts = new Uint32Array(B + 1);
    for (let i = 0; i < n; i++) {
      // far (large depth) first → bucket 0
      const q = Math.min(B - 1, Math.floor(((dMax - triD[i]) / span) * B));
      bucket[i] = q;
      counts[q + 1]++;
    }
    for (let q = 0; q < B; q++) counts[q + 1] += counts[q];
    order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[counts[bucket[i]]++] = i;
  } else {
    order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
  }

  // shared-vertex remap per part (−1 = not emitted yet in this batch)
  const remaps = items.map((it) => new Int32Array(it.part.pos.length / 3));
  const batches: Batch[] = [];
  const MAXV = 65535 - 3;
  let i = 0;
  while (i < n) {
    for (const r of remaps) r.fill(-1);
    const xy = new Float32Array(Math.min(MAXV + 3, (n - i) * 3) * 2);
    const rgba = new Float32Array((xy.length / 2) * 4);
    const out: number[] = [];
    let v = 0;
    for (; i < n; i++) {
      if (v >= MAXV) break;
      const t = order[i];
      const item = triItem[t];
      const it = items[item];
      const remap = remaps[item];
      const k = triK[t];
      for (let e = 0; e < 3; e++) {
        const vi = it.part.idx[k + e];
        let o = remap[vi];
        if (o < 0) {
          o = v++;
          remap[vi] = o;
          xy[o * 2] = it.sx[vi * 2];
          xy[o * 2 + 1] = it.sx[vi * 2 + 1];
          rgba[o * 4] = it.rgba[vi * 4];
          rgba[o * 4 + 1] = it.rgba[vi * 4 + 1];
          rgba[o * 4 + 2] = it.rgba[vi * 4 + 2];
          rgba[o * 4 + 3] = it.rgba[vi * 4 + 3];
        }
        out.push(o);
      }
    }
    batches.push({ blend, xy: xy.subarray(0, v * 2), rgba: rgba.subarray(0, v * 4), idx: Uint16Array.from(out) });
  }
  return batches;
}

// ---- floor, shadows, glows ---------------------------------------------------

/** A flat polar disc on the floor (y = 0) with colour fading from centre to rim. */
function floorDisc(P: Projector, c: V3, rx: number, rz: number, inner: RGBA, outer: RGBA, along: V3 = v3(1, 0, 0)): Batch | null {
  const rings = 6;
  const segs = 28;
  const xy: number[] = [];
  const rgba: number[] = [];
  const idx: number[] = [];
  const ax = norm3(v3(along.x, 0, along.z), v3(1, 0, 0));
  const bx = v3(-ax.z, 0, ax.x);
  const centre = P.project(c);
  if (!centre) return null;
  xy.push(centre.x, centre.y);
  rgba.push(...inner);
  for (let r = 1; r <= rings; r++) {
    const u = r / rings;
    const col = inner.map((v, k) => v + (outer[k] - v) * Math.pow(u, 1.4));
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      const p = v3(c.x + (ax.x * Math.cos(th) * rx + bx.x * Math.sin(th) * rz) * u, 0, c.z + (ax.z * Math.cos(th) * rx + bx.z * Math.sin(th) * rz) * u);
      const q = P.project(p);
      if (!q) return null;
      xy.push(q.x, q.y);
      rgba.push(...col);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 0; r < rings - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + r * segs + s;
      const b = 1 + r * segs + ((s + 1) % segs);
      const cc = a + segs;
      const d = b + segs;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  return { blend: 'normal', xy: Float32Array.from(xy), rgba: Float32Array.from(rgba), idx: Uint16Array.from(idx) };
}

/** Floor grid lines as thin screen-space quads, fading with distance from the subject. */
function floorGrid(P: Projector, centre: V3, color: RGBA, halfX = 1.6, halfZ = 1.1, step = 0.2): Batch {
  const xy: number[] = [];
  const rgba: number[] = [];
  const idx: number[] = [];
  const line = (a: V3, b: V3) => {
    const pieces = 8;
    for (let i = 0; i < pieces; i++) {
      const p = v3(a.x + ((b.x - a.x) * i) / pieces, 0, a.z + ((b.z - a.z) * i) / pieces);
      const q = v3(a.x + ((b.x - a.x) * (i + 1)) / pieces, 0, a.z + ((b.z - a.z) * (i + 1)) / pieces);
      const sp = P.project(p);
      const sq = P.project(q);
      if (!sp || !sq) continue;
      const dx = sq.x - sp.x;
      const dy = sq.y - sp.y;
      const l = Math.hypot(dx, dy) || 1;
      const w = 0.6;
      const nx = (-dy / l) * w;
      const ny = (dx / l) * w;
      const fade = (pt: V3) => {
        const d = Math.hypot((pt.x - centre.x) / halfX, (pt.z - centre.z) / halfZ);
        return Math.max(0, 1 - d) ** 1.5;
      };
      const base = xy.length / 2;
      xy.push(sp.x + nx, sp.y + ny, sp.x - nx, sp.y - ny, sq.x + nx, sq.y + ny, sq.x - nx, sq.y - ny);
      const fa = fade(p) * color[3];
      const fb = fade(q) * color[3];
      rgba.push(color[0], color[1], color[2], fa, color[0], color[1], color[2], fa, color[0], color[1], color[2], fb, color[0], color[1], color[2], fb);
      idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  };
  const x0 = Math.floor((centre.x - halfX) / step) * step;
  for (let x = x0; x <= centre.x + halfX; x += step) line(v3(x, 0, centre.z - halfZ), v3(x, 0, centre.z + halfZ));
  for (let z = -Math.floor(halfZ / step) * step; z <= halfZ; z += step) line(v3(centre.x - halfX, 0, z), v3(centre.x + halfX, 0, z));
  return { blend: 'normal', xy: Float32Array.from(xy), rgba: Float32Array.from(rgba), idx: Uint16Array.from(idx) };
}

/** A soft additive glow disc at a joint (screen-space billboard). */
function glow(P: Projector, p: V3, radius: number, color: RGBA, strength: number): Batch | null {
  const c = P.project(p);
  if (!c) return null;
  const rpx = (radius / c.z) * P.focal;
  const segs = 24;
  const xy: number[] = [c.x, c.y];
  const rgba: number[] = [color[0], color[1], color[2], strength];
  const idx: number[] = [];
  const rings = [0.35, 0.7, 1];
  const alphas = [strength * 0.55, strength * 0.18, 0];
  rings.forEach((rr, ri) => {
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * Math.PI * 2;
      xy.push(c.x + Math.cos(th) * rpx * rr, c.y + Math.sin(th) * rpx * rr);
      rgba.push(color[0], color[1], color[2], alphas[ri]);
    }
  });
  for (let s = 0; s < segs; s++) idx.push(0, 1 + s, 1 + ((s + 1) % segs));
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + r * segs + s;
      const b = 1 + r * segs + ((s + 1) % segs);
      idx.push(a, a + segs, b, b, a + segs, b + segs);
    }
  }
  return { blend: 'add', xy: Float32Array.from(xy), rgba: Float32Array.from(rgba), idx: Uint16Array.from(idx) };
}

function background(cam: Camera, look: Look): Batch {
  const { width: w, height: h } = cam;
  const [t, b] = look.bg;
  return {
    blend: 'normal',
    xy: Float32Array.from([0, 0, w, 0, 0, h, w, h]),
    rgba: Float32Array.from([...t, ...t, ...b, ...b]),
    idx: Uint16Array.from([0, 2, 1, 1, 2, 3]),
  };
}

export interface SceneInput {
  /** opaque, depth-sorted parts (body, shoes, bones) */
  solid: Part[];
  /** additive parts (x-ray shell and bones) */
  glowing?: Part[];
  /** feet (for contact shadows) and pelvis */
  shadowAt?: { p: V3; along?: V3; rx: number; rz: number; strength: number }[];
  /** joint glows */
  glows?: { p: V3; radius: number; color: RGBA; strength: number }[];
}

export function renderScene(cam: Camera, look: Look, scene: SceneInput): Batch[] {
  const P = projector(cam);
  const L = cameraLights(P);
  const out: Batch[] = [background(cam, look)];
  const floorC = v3(cam.target.x, 0, 0);
  const spot = floorDisc(P, floorC, 1.1, 0.8, look.floor, [look.floor[0], look.floor[1], look.floor[2], 0]);
  if (spot) out.push(spot);
  out.push(floorGrid(P, floorC, look.grid));
  for (const s of scene.shadowAt ?? []) {
    const d = floorDisc(P, v3(s.p.x, 0, s.p.z), s.rx, s.rz, [0, 0, 0, look.shadow * s.strength], [0, 0, 0, 0], s.along);
    if (d) out.push(d);
  }
  if (scene.solid.length) out.push(...packSorted(scene.solid.map((p) => prepare(p, P, L)), P, 'normal', true));
  if (scene.glowing?.length) out.push(...packSorted(scene.glowing.map((p) => prepare(p, P, L)), P, 'add', true));
  for (const g of scene.glows ?? []) {
    const b = glow(P, g.p, g.radius, g.color, g.strength);
    if (b) out.push(b);
  }
  return out;
}

/** Total vertices across batches (perf budget checks in tests). */
export const vertexCount = (batches: Batch[]) => batches.reduce((s, b) => s + b.xy.length / 2, 0);
