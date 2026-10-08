export interface RouteMapProps {
  points: { lat: number; lon: number; seg: number }[];
  height?: number;
  /** live recording: follow the newest point and show the user puck */
  live?: boolean;
  /** where to centre before there's a track (GPS preview) */
  center?: [number, number] | null;
  /** allow pan/zoom (detail screen) — off for the live map and thumbnails */
  interactive?: boolean;
}
