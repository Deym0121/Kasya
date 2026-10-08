import { RouteSketch, segmentsOf } from './RouteSketch';
import type { RouteMapProps } from './types';

/** Web: the SVG route (no Mapbox GL on the web build). */
export function RouteMap({ points, height = 240, live, center }: RouteMapProps) {
  const segs = segmentsOf(points);
  if (segs.flat().length < 2 && center) {
    return <RouteSketch segments={[[center, center]]} height={height} grid live />;
  }
  return <RouteSketch segments={segs} height={height} strokeWidth={4} grid live={live} />;
}

export const mapTilesAvailable = false;
