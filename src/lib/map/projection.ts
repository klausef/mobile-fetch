/**
 * Web Mercator projection math.
 *
 * The map UI never talks to a tile provider directly — it projects coordinates
 * into "world pixel" space at a given zoom and positions tiles/markers there.
 * That keeps the rendering layer provider-agnostic.
 */

export const TILE_SIZE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

export type LatLng = { lat: number; lng: number };

/** Total world width/height in pixels at this zoom. */
export function scaleForZoom(zoom: number): number {
  return TILE_SIZE * 2 ** zoom;
}

export function lngToWorldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * scaleForZoom(zoom);
}

export function latToWorldY(lat: number, zoom: number): number {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  return y * scaleForZoom(zoom);
}

export function worldXToLng(x: number, zoom: number): number {
  return (x / scaleForZoom(zoom)) * 360 - 180;
}

export function worldYToLat(y: number, zoom: number): number {
  const scale = scaleForZoom(zoom);
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

export function project(p: LatLng, zoom: number): { x: number; y: number } {
  return { x: lngToWorldX(p.lng, zoom), y: latToWorldY(p.lat, zoom) };
}

export function unproject(x: number, y: number, zoom: number): LatLng {
  return { lat: worldYToLat(y, zoom), lng: worldXToLng(x, zoom) };
}

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}
