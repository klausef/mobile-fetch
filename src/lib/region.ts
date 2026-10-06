/**
 * Operating region: Bukidnon, Philippines.
 *
 * FETCH is deployed for Bukidnon riders and commuters, so every default the
 * product ships — map center, search bias, quick-pick destinations — comes from
 * here instead of being scattered through the UI.
 *
 * ── Coordinates ──────────────────────────────────────────────────────────────
 * Every point below is real OpenStreetMap data, not an estimate. They were
 * resolved on 2026-10-01 against the same Nominatim instance the app geocodes
 * with, and each entry keeps its OSM object id so it can be re-checked at
 * https://www.openstreetmap.org/<osmId>.
 *
 * In the OSM data:
 *   • 14 municipalities have a mapped "Poblacion" node, so their anchor is the
 *     actual town centre.
 *   • The remaining 8 only have an administrative boundary, so their anchor is
 *     the boundary centroid (the LGU centre). To pinpoint the town proper
 *     instead, submit a Poblacion point to OSM and re-resolve that row.
 *
 * To refresh or extend this list, query Nominatim and paste the result:
 *   https://nominatim.openstreetmap.org/search
 *     ?q=<Point of interest>, Bukidnon
 *     &format=jsonv2&limit=1&countrycodes=ph
 */

export type RegionPoint = { lat: number; lng: number };

export const REGION = {
  id: "bukidnon",
  name: "Bukidnon",
  country: "Philippines",
  countryCode: "ph",
  /** Provincial capital — OSM relation 13434541. */
  center: { lat: 8.1550421, lng: 125.1305726 } satisfies RegionPoint,
  /** Wider default so all of Bukidnon is visible on first load. */
  zoom: 10,
  /**
   * Bounding box covering the province (Bukidnon plus a small margin so
   * searches near the border still resolve).
   */
  bounds: {
    minLat: 7.35,
    maxLat: 8.62,
    minLng: 124.35,
    maxLng: 125.6,
  },
  /** Shown in the UI where a locality name is needed. */
  localityLabel: "Bukidnon",
  /** When the coordinates below were last resolved from OpenStreetMap. */
  placesVerifiedOn: "2026-10-01",
} as const;

export type RegionPlaceKind =
  | "municipality"
  | "terminal"
  | "landmark"
  | "barangay";

export type RegionPlace = {
  name: string;
  /** Sub-locality shown under the name, e.g. the barangay. */
  area: string;
  kind: RegionPlaceKind;
  /** `node/<id>`, `way/<id>`, or `relation/<id>` on OpenStreetMap. */
  osmId: string;
  lat: number;
  lng: number;
};

/**
 * Quick-pick destinations, so a commuter with no GPS fix — or a rider who knows
 * the town but not the street — can book in two taps.
 *
 * Ordered city-first, then the towns, then the transport hubs and landmarks
 * people actually name as destinations.
 */
export const POPULAR_PLACES: RegionPlace[] = [
  // ── City and municipal anchors (22 LGUs) ──────────────────────────────────
  { name: "Malaybalay City", area: "Poblacion · provincial capital", kind: "municipality", osmId: "relation/13434541", lat: 8.1550421, lng: 125.1305726 },
  { name: "Valencia City", area: "Poblacion, Lumbo", kind: "municipality", osmId: "node/7029908178", lat: 7.9111239, lng: 125.0933669 },
  { name: "Manolo Fortich", area: "Poblacion", kind: "municipality", osmId: "relation/13452750", lat: 8.3678344, lng: 124.8663083 },
  { name: "Maramag", area: "Poblacion", kind: "municipality", osmId: "relation/13640911", lat: 7.7610686, lng: 125.005158 },
  { name: "Quezon", area: "Poblacion, Libertad", kind: "municipality", osmId: "node/6222280703", lat: 7.729608, lng: 125.1013948 },
  { name: "San Fernando", area: "Poblacion, Halapitan", kind: "municipality", osmId: "node/760200548", lat: 7.918901, lng: 125.3272642 },
  { name: "Impasug-ong", area: "Poblacion", kind: "municipality", osmId: "node/6964938765", lat: 8.3065867, lng: 125.0040803 },
  { name: "Lantapan", area: "Poblacion", kind: "municipality", osmId: "relation/13437290", lat: 7.9983082, lng: 125.0228905 },
  { name: "Sumilao", area: "Poblacion", kind: "municipality", osmId: "node/6662992522", lat: 8.2867866, lng: 124.9484512 },
  { name: "Libona", area: "Poblacion", kind: "municipality", osmId: "node/6964941502", lat: 8.3334766, lng: 124.7438335 },
  { name: "Talakag", area: "Poblacion", kind: "municipality", osmId: "node/7904864225", lat: 8.2324911, lng: 124.6019876 },
  { name: "Baungon", area: "Poblacion", kind: "municipality", osmId: "relation/13541071", lat: 8.3126139, lng: 124.6872041 },
  { name: "Pangantucan", area: "Poblacion", kind: "municipality", osmId: "node/6330390612", lat: 7.8333541, lng: 124.8297911 },
  { name: "Kalilangan", area: "Central Poblacion, Pamotolon", kind: "municipality", osmId: "node/6981565583", lat: 7.7448234, lng: 124.7491631 },
  { name: "Don Carlos", area: "Poblacion", kind: "municipality", osmId: "relation/13645657", lat: 7.6807528, lng: 124.9954728 },
  { name: "Kitaotao", area: "Poblacion, Magsaysay", kind: "municipality", osmId: "node/12624406720", lat: 7.6398774, lng: 125.0092381 },
  { name: "Kadingilan", area: "Poblacion, Salvacion", kind: "municipality", osmId: "node/6981570225", lat: 7.6009993, lng: 124.9083199 },
  { name: "Dangcagan", area: "Poblacion, Lourdes", kind: "municipality", osmId: "node/12624385227", lat: 7.6119713, lng: 125.0039515 },
  { name: "Kibawe", area: "Poblacion", kind: "municipality", osmId: "relation/16238310", lat: 7.5687481, lng: 124.9856942 },
  { name: "Damulog", area: "Poblacion", kind: "municipality", osmId: "relation/16238309", lat: 7.4848894, lng: 124.942479 },
  { name: "Cabanglasan", area: "Poblacion, Mandaing", kind: "municipality", osmId: "node/6975001999", lat: 8.0764648, lng: 125.3008854 },
  { name: "Malitbog", area: "Poblacion, Patpat", kind: "municipality", osmId: "node/6281272848", lat: 8.5354234, lng: 124.8798095 },

  // ── Transport hubs ────────────────────────────────────────────────────────
  { name: "Malaybalay Integrated Bus Terminal", area: "Barangay 9, Malaybalay City", kind: "terminal", osmId: "way/177971386", lat: 8.1481091, lng: 125.1332734 },
  { name: "Valencia City Integrated Transport Terminal", area: "Hagkol, Bagontaas, Valencia City", kind: "terminal", osmId: "way/180206225", lat: 7.9309728, lng: 125.098058 },
  { name: "Valencia City Old Public Terminal", area: "Poblacion, Lumbo, Valencia City", kind: "terminal", osmId: "way/180987008", lat: 7.9033463, lng: 125.0930418 },
  { name: "Maramag Integrated Bus Terminal", area: "North Poblacion, Maramag", kind: "terminal", osmId: "way/276435956", lat: 7.7599147, lng: 125.0022779 },
  { name: "Quezon Bus Terminal", area: "Libertad, Quezon", kind: "terminal", osmId: "way/276433662", lat: 7.7134026, lng: 125.1149186 },
  { name: "San Fernando Public Terminal", area: "Halapitan, San Fernando", kind: "terminal", osmId: "way/308186274", lat: 7.9189485, lng: 125.3295899 },
  { name: "Kalilangan Bus Terminal", area: "Central Poblacion, Pamotolon", kind: "terminal", osmId: "way/670863246", lat: 7.7478563, lng: 124.7459461 },
  { name: "Dangcagan Public Terminal", area: "Magsaysay, Dangcagan", kind: "terminal", osmId: "way/647697143", lat: 7.6105616, lng: 125.0034289 },
  { name: "Kadingilan Public Terminal", area: "Salvacion, Kadingilan", kind: "terminal", osmId: "way/647736732", lat: 7.5993033, lng: 124.9116147 },
  { name: "Cabanglasan Bus Terminal", area: "Mandaing, Cabanglasan", kind: "terminal", osmId: "way/653297257", lat: 8.0723536, lng: 125.298321 },

  // ── Malaybalay City landmarks ─────────────────────────────────────────────
  { name: "Bukidnon Provincial Capitol", area: "San Victores St, Barangay 6", kind: "landmark", osmId: "way/179272141", lat: 8.1560759, lng: 125.133532 },
  { name: "Bukidnon State University", area: "Fortich St, Barangay 3", kind: "landmark", osmId: "way/179731388", lat: 8.1563057, lng: 125.1239375 },
  { name: "Malaybalay Public Market", area: "Alvaro Pabillaran St, Barangay 9", kind: "landmark", osmId: "way/1413361322", lat: 8.1475811, lng: 125.1335728 },
  { name: "San Fernando Public Market", area: "Little Baguio, San Fernando", kind: "landmark", osmId: "way/362698013", lat: 7.9229203, lng: 125.301155 },

  // ── Barangays ─────────────────────────────────────────────────────────────
  { name: "Casisang", area: "Malaybalay City", kind: "barangay", osmId: "relation/11999083", lat: 8.1348624, lng: 125.1269136 },
  { name: "Aglayan", area: "Malaybalay City", kind: "barangay", osmId: "node/1942195081", lat: 8.0531919, lng: 125.1353945 },
  { name: "Bagontaas", area: "Valencia City", kind: "barangay", osmId: "node/6722884251", lat: 7.9493743, lng: 125.1076054 },
];

/** Municipality names, for the coverage strip on the landing page. */
export const MUNICIPALITIES = POPULAR_PLACES.filter(
  (place) => place.kind === "municipality",
).map((place) => place.name);

export type LiveCity = {
  name: string;
  /** What is actually inside the radius, so the claim is checkable. */
  area: string;
  lat: number;
  lng: number;
  /**
   * How far from the town centre we will accept a pickup.
   *
   * A radius rather than a boundary, because a boundary is a line and a
   * passenger standing 200 metres the wrong side of it is not "outside the
   * service area" in any sense they would recognise. 12 km from the Poblacion
   * covers the city and its immediate outlying barangays, which is what a rider
   * will actually ride for.
   */
  radiusKm: number;
  /** One line on why this city is here first. */
  blurb: string;
};

/**
 * Where riders are actually available today.
 *
 * This is the honest list, and it is deliberately short. The province has 22
 * municipalities and the map and the geocoder open across all of them, which
 * makes it tempting to say "we run in Bukidnon" — but a request from a town
 * with no rider online sits in SEARCHING until the commuter cancels it. Saying
 * two cities and meaning it is worth more than saying twenty and not.
 *
 * Each city also anchors the region: `REGION.center` is Malaybalay, and the
 * booking map opens there.
 */
export const LIVE_CITIES: LiveCity[] = [
  {
    name: "Malaybalay City",
    area: "Poblacion and the citywide barangays",
    lat: 8.1550421,
    lng: 125.1305726,
    radiusKm: 12,
    blurb:
      "The provincial capital, and the busiest corridor — the terminal, the Capitol and the city market are all inside the radius.",
  },
  {
    name: "Valencia City",
    area: "Poblacion, Lumbo and the north road",
    lat: 7.9111239,
    lng: 125.0933669,
    radiusKm: 12,
    blurb:
      "The southern city on the Valencia–Malaybalay road, covering both transport terminals.",
  },
];

/** The cities riders are in today, by name. */
export const LIVE_CITY_NAMES = LIVE_CITIES.map((city) => city.name);

/**
 * The rest of the province: real places, real pins, not yet staffed.
 *
 * Shown as "coming next" rather than hidden, so somebody in Maramag learns that
 * Fetch knows their town exists instead of concluding the app is broken there.
 */
export const PLANNED_MUNICIPALITIES = MUNICIPALITIES.filter(
  (name) => !LIVE_CITY_NAMES.includes(name),
);

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in km. */
export function distanceKm(a: RegionPoint, b: RegionPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) *
      Math.cos(toRadians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The live city a point falls in, or null when it falls outside all of them.
 *
 * Returns the name rather than a boolean so a caller can say *which* city is
 * out of range, which is the only useful form of the answer: "outside our
 * service area" is a dead end, "too far from Malaybalay and Valencia" is
 * something a person can act on.
 */
export function liveCityFor(
  point: RegionPoint | null | undefined,
): LiveCity | null {
  if (!point) return null;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  for (const city of LIVE_CITIES) {
    if (distanceKm(point, city) <= city.radiusKm) return city;
  }
  return null;
}

/** True when a pickup point is somewhere a rider will actually come to. */
export function isInServiceArea(point: RegionPoint | null | undefined): boolean {
  return liveCityFor(point) !== null;
}

/**
 * The live city closest to a point, whatever that point is.
 *
 * For showing someone where the riders are when their own fix is somewhere we
 * do not cover — a commuter opening FETCH in Davao City should see Malaybalay
 * or Valencia on the map, not an empty patch of the province box, because
 * "city wide" is where the riders are and what they are about to be told is
 * worth booking. Returns null only if there are no live cities at all.
 */
export function nearestLiveCity(
  point: RegionPoint | null | undefined,
): LiveCity | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    return null;
  }
  let best: LiveCity | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const city of LIVE_CITIES) {
    const km = distanceKm(point, city);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  }
  return best;
}

/**
 * Inside the province box, as opposed to inside a city we actually cover.
 *
 * Deliberately the looser of the two checks. `isInServiceArea` answers "will a
 * rider come here" and is false across most of Bukidnon; this answers "is this
 * still the province", which is what the map's edge and the search filter need.
 * A commuter standing in Impasugong with no rider yet is still in range and
 * must still be able to look at the map and search from there.
 */
export function isInRegion(point: RegionPoint | null | undefined): boolean {
  if (!point) return false;
  const { minLat, maxLat, minLng, maxLng } = REGION.bounds;
  return (
    point.lat >= minLat &&
    point.lat <= maxLat &&
    point.lng >= minLng &&
    point.lng <= maxLng
  );
}

/**
 * Pull a point back inside the province box.
 *
 * For camera and recentring, not for validation. A GPS fix in Davao City, or a
 * search result in Manila, is a real reading — clamping it is the right thing to
 * do with the *camera* (the app opens on Bukidnon and stays there), and the
 * wrong thing to do with the address (a rider is never going to Davao). So this
 * is called where a point becomes a viewpoint, and `isInRegion` is called where
 * a point is accepted as a place.
 */
export function clampToRegion(point: RegionPoint): RegionPoint {
  const { minLat, maxLat, minLng, maxLng } = REGION.bounds;
  // Non-finite first, then clamp. `Math.min(8.62, Math.max(7.35, NaN))` is NaN,
  // not 7.35 — a clamp that propagates NaN hands the camera a position that
  // renders nothing at all, which is a worse failure than being in the wrong
  // province. A corrupt fix therefore lands on the provincial capital, which is
  // at least a real place.
  const lat = Number.isFinite(point.lat) ? point.lat : REGION.center.lat;
  const lng = Number.isFinite(point.lng) ? point.lng : REGION.center.lng;
  return {
    lat: Math.min(maxLat, Math.max(minLat, lat)),
    lng: Math.min(maxLng, Math.max(minLng, lng)),
  };
}
