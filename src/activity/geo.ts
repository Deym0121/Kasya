/** Small geodesy helpers for GPS tracks. Metres everywhere. */

const R = 6371008.8; // mean Earth radius (m)
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lon points (haversine), metres. */
export function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Metres per degree of latitude/longitude at a given latitude (local flat-earth). */
export function metresPerDegree(lat: number): { lat: number; lon: number } {
  const m = (Math.PI / 180) * R;
  return { lat: m, lon: m * Math.cos(toRad(lat)) };
}

/**
 * Douglas–Peucker simplification on [lat, lon] pairs with a tolerance in
 * metres (projected locally, fine at track scale). Keeps first and last.
 */
export function simplify(coords: [number, number][], toleranceM: number): [number, number][] {
  if (coords.length <= 2) return coords.slice();
  const k = metresPerDegree(coords[0][0]);
  const xy = coords.map(([la, lo]) => [lo * k.lon, la * k.lat] as const);
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  const tol2 = toleranceM * toleranceM;
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = xy[s];
    const [x2, y2] = xy[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [px, py] = xy[i];
      let d2: number;
      if (len2 === 0) {
        d2 = (px - x1) ** 2 + (py - y1) ** 2;
      } else {
        const u = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
        d2 = (px - (x1 + u * dx)) ** 2 + (py - (y1 + u * dy)) ** 2;
      }
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return coords.filter((_, i) => keep[i] === 1);
}

/**
 * Reduce a track to at most `max` points for thumbnails: simplify with a
 * growing tolerance until it fits, then stride-sample as a last resort.
 */
export function previewOf(coords: [number, number][], max = 48): [number, number][] {
  if (coords.length <= max) return coords.map(([a, b]) => [round6(a), round6(b)]);
  let tol = 5;
  let out = simplify(coords, tol);
  while (out.length > max && tol < 2000) {
    tol *= 2;
    out = simplify(coords, tol);
  }
  if (out.length > max) {
    const step = (out.length - 1) / (max - 1);
    out = Array.from({ length: max }, (_, i) => out[Math.round(i * step)]);
  }
  return out.map(([a, b]) => [round6(a), round6(b)]);
}

export const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Bounding box of [lat, lon] pairs, or null for an empty list. */
export function bounds(coords: [number, number][]) {
  if (coords.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const [la, lo] of coords) {
    if (la < minLat) minLat = la;
    if (la > maxLat) maxLat = la;
    if (lo < minLon) minLon = lo;
    if (lo > maxLon) maxLon = lo;
  }
  return { minLat, maxLat, minLon, maxLon };
}
