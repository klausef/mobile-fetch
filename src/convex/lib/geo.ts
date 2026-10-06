export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371.0088;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometers. The server always computes ride distance
 * from raw coordinates — a client-supplied distance is never trusted for fare.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distance in km from a point to the straight line between two other points.
 * Used to decide whether a second pickup is a small detour off a rider's
 * current route rather than a second trip across town. The projection is good
 * enough at the few-kilometre scale we care about here.
 */
export function distanceToSegmentKm(
  point: LatLng,
  a: LatLng,
  b: LatLng,
): number {
  const latScale = 110.574;
  const lngScale = 111.32 * Math.cos((a.lat * Math.PI) / 180);
  const px = (point.lng - a.lng) * lngScale;
  const py = (point.lat - a.lat) * latScale;
  const bx = (b.lng - a.lng) * lngScale;
  const by = (b.lat - a.lat) * latScale;

  const lengthSquared = bx * bx + by * by;
  if (lengthSquared === 0) return Math.hypot(px, py);

  // Project the point onto the segment and clamp to its ends.
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lengthSquared));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Basic coordinate sanity check. */
export function isValidLatLng(p: LatLng | undefined | null): p is LatLng {
  if (!p) return false;
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}
