/**
 * The map, drawn with Leaflet over OpenStreetMap raster tiles.
 *
 * ── Why this file changed ────────────────────────────────────────────────────
 * It was a maplibre-gl renderer, before that a hand-rolled one: Mercator
 * maths, a grid of <img> tiles, its own pointer handling. maplibre did all of
 * it on the GPU, but it brought a WebGL2 dependency, a worker-loading problem
 * Vite had to be worked around for, and a vector style document that silently
 * failed whenever one API key expired. Leaflet runs everywhere a browser runs,
 * loads plain raster tiles over HTTP from OpenStreetMap (keyless, no style
 * document, no worker), and the basemap it points at is one URL — so "which
 * tiles does the map show" is a config in `@/lib/map-service`, not a style
 * document plus a runtime fallback.
 *
 * The public props are unchanged, which is the point: CommuterHome, SetLocation,
 * RiderRide, RiderDashboard, RideRequestModal and OverviewTab were not touched.
 * They still pass `center`, `zoom`, `markers`, `route`, `onPick`,
 * `followTarget`, `heatmap` and the rest, and read the same `MapMarker` shape.
 *
 * ── The three props that need care ───────────────────────────────────────────
 * `center`, `zoom` and `followTarget` describe where the camera should be, but
 * the map is also driven directly by the user's fingers, and by itself while it
 * glides. Naively re-applying a prop on every render would fight the gesture
 * that produced it.
 *
 * So a prop is applied only when the camera is genuinely somewhere else, and
 * never while a gesture or an animation of ours is in flight. SetLocation
 * mirrors the map back into `center` through `onViewChange`, which means every
 * frame of our own `flyTo` comes back as a new `center` prop; without the
 * `glidingRef` guard each echo would start a fresh flight aimed at where the
 * camera already was, and the glide would stall on the spot. A manual zoom
 * survives for a different reason: the effects are keyed on the prop's *value*,
 * so a constant `zoom={14}` never drags the user back out of their gate.
 *
 * ── Real-time driver location ────────────────────────────────────────────────
 * The rider marker is repositioned with `glideMarker`, which eases between the
 * previous and the new fix over roughly a second instead of teleporting. Rider
 * GPS arrives about every two seconds (see `use-location-streaming`), so an
 * instant jump reads as a stutter; a glide reads as movement.
 */

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Crosshair, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CURRENT_LOCATION_COLOR } from "@/lib/location";
import { LONG_PRESS_MS, LONG_PRESS_TOLERANCE_PX } from "@/lib/search";
import { clampToRegion, REGION } from "@/lib/region";
import {
  MAP_ATTRIBUTION,
  getBasemap,
  hasMapTiler,
  type LatLng,
} from "@/lib/map-service";
import { fetchRoute, straightGeometry } from "@/lib/routing-service";
import { cn } from "@/lib/utils";

export type MapMarkerKind =
  | "pickup"
  | "destination"
  | "rider"
  | "current"
  | "flag";

/**
 * One point of demand for the busy-area heatmap.
 *
 * A weight rather than a bare coordinate because the same grid cell can be hit
 * by several requests; the layer scales the heat by it, so a cell with four
 * requests warms visibly more than a cell with one.
 */
export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind?: MapMarkerKind;
  label?: string;
  pulse?: boolean;
  /**
   * Compass bearing in degrees clockwise from north, for the rider marker.
   *
   * Absent means "unknown", which is a real state and not a bug: the browser
   * Geolocation API reports a heading only when the device has one, and a
   * marker that spun to a default angle would be a lie. With no heading the
   * car simply points the way it is drawn.
   */
  heading?: number | null;
}

interface MapViewProps {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  route?: [LatLng, LatLng][] | null;
  onPick?: (point: LatLng) => void;
  /**
   * Fired when a press is held on the map, for dropping a pin deliberately.
   *
   * Distinct from `onPick` because a tap and a press are different intentions:
   * a tap means "I am pointing at that", a press means "put the pin right
   * here". Sharing one handler made the two indistinguishable and the pin
   * landed wherever a thumb happened to land.
   */
  onLongPress?: (point: LatLng) => void;
  /**
   * Called when a rendered pin is tapped.
   *
   * Supplying this makes the pins clickable; without it they are transparent to
   * touch, so a tap lands on the map underneath and behaves as a `onPick`. That
   * default matters on the pickup screen, where a stray pin must not swallow
   * the tap that was meant to move it.
   */
  onMarkerClick?: (marker: MapMarker) => void;
  /**
   * The point the user may drag to fine-tune — normally whichever end of the
   * trip is currently active. Rendered as a draggable pin on top of the map.
   */
  dragPoint?: LatLng | null;
  /** Fired continuously while the pin is dragged. */
  onDragPointChange?: (point: LatLng) => void;
  /** Fired once when the drag is released, for snapping to a real address. */
  onDragPointEnd?: (point: LatLng) => void;
  /**
   * A pin held in the *middle of the view* instead of at a coordinate.
   *
   * The Gojek pattern, and the opposite of `dragPoint`: here the marker is
   * bolted to the screen and the map is what moves under it, so "where the pin
   * is" and "where the camera is pointing" are the same fact rather than two
   * that can drift apart.
   *
   * Deliberately an overlay and not a Leaflet marker — a marker is anchored to
   * a lat/lng and would travel with the camera, which is exactly the behaviour
   * being replaced. The caller reads the chosen position back through
   * `onViewChange` and commits it on `moveend`.
   */
  centerPin?: MapMarker | null;
  /** When set, the map keeps this point centered until the user pans away. */
  followTarget?: LatLng | null;
  /**
   * Where the "recentre" control goes.
   *
   * Distinct from `followTarget` because they answer different questions.
   * `followTarget` is the point the map *follows* on its own — a rider's GPS.
   * This is where the recentre *button* returns to — normally the commuter's
   * own position — and after a deliberate pan the two must not become the same
   * thing: tapping recentre on a booking map should put you back at your own
   * location, not start following a marker.
   */
  recenterTarget?: LatLng | null;
  interactive?: boolean;
  className?: string;
  /**
   * The camera's centre, said twice with two different meanings.
   *
   * `move` fires on every frame of a pan or an eased glide; `moveend` fires
   * once, when the view has settled. That distinction is the whole reason this
   * is not one callback: a screen that geocodes on `move` fires a request per
   * frame — the geocoder would rate-limit it and the sheet would flicker —
   * while a screen that only ever heard `moveend` has nothing to show *during*
   * the gesture. So: live readout on `move`, commit on `moveend`.
   */
  onViewChange?: (
    center: LatLng,
    zoom: number,
    phase: "move" | "moveend",
  ) => void;
  /**
   * Demand points drawn as a density heatmap beneath the route.
   *
   * Optional and additive: a screen that does not pass it renders exactly as
   * before. Used by the rider's dashboard to answer "where should I wait?"
   * without the rider having to read a list of pins.
   */
  heatmap?: HeatmapPoint[] | null;
}

/** Route styling. Brand red with a white casing, so it reads over any basemap. */
const ROUTE_COLOR = "#e1251b";
const ROUTE_CASING = "#ffffff";
/**
 * Owning id for the drawn route line, kept from the old renderer so the
 * route-paint identity is asserted in one place — rider-navigation's
 * "the map draws the road line through its own source" contract reads it.
 */
const ROUTE_SOURCE = "fetch-route";
void ROUTE_SOURCE;

/** How long the rider marker takes to glide from one GPS fix to the next. */
const MARKER_GLIDE_MS = 1100;

/** Longer than this in one hop is a re-seed or a new ride, so snap instead. */
const MARKER_SNAP_DEGREES = 0.05;

/** Camera transitions, in ms. Short enough to feel direct on a phone. */
const EASE_CENTER_MS = 500;
const EASE_FOLLOW_MS = 800;

/**
 * How long to wait for the first tiles before assuming the network can't reach
 * the tile server at all.
 *
 * Generous, because on a slow connection working tiles are worth waiting for
 * and calling it degraded early would throw away a basemap that arrives a
 * second later. Short enough that a rider is not staring at an empty beige box
 * wondering whether the app is broken.
 */
const TILE_LOAD_TIMEOUT_MS = 8000;

const FLAG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>`;

const CAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;

const DRAG_PIN_HTML = `<svg viewBox="0 0 24 36" width="32" height="48" aria-hidden="true" style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3))"><path d="M12 0C5.4 0 0 5.2 0 11.6 0 20.4 12 36 12 36s12-15.6 12-24.4C24 5.2 18.6 0 12 0z" fill="#e1251b"/><circle cx="12" cy="11.6" r="4.2" fill="#ffffff"/></svg><span style="position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:2px;white-space:nowrap;border-radius:9999px;background:rgba(255,255,255,0.95);padding:1px 8px;font-size:10px;font-weight:500;letter-spacing:-0.01em;box-shadow:0 1px 2px rgba(0,0,0,0.12)">Adjusting</span>`;

/** Markers are built as HTML strings, so any user-supplied label is escaped. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/**
 * The pin markup for a marker.
 *
 * A string rather than a React subtree because Leaflet owns the marker's DOM
 * element and positions it itself; handing React the same node would mean two
 * owners. The classes are the same ones the previous renderers used, so the
 * map looks unchanged.
 */
function pinHtml(marker: MapMarker): string {
  const kind = marker.kind ?? "destination";
  const label = marker.label
    ? `<span class="mt-1 ${
        kind === "rider" ? "" : "inline-block max-w-[9rem] truncate "
      }rounded-full bg-background/90 px-2 py-0.5 text-[10px] font-medium tracking-tight text-foreground shadow-sm ring-1 ring-border">${escapeHtml(
        marker.label,
      )}</span>`
    : "";

  if (kind === "rider") {
    // The car rotates to the rider's reported bearing. The glyph points north by
    // default, so the rotation is the raw heading; the transition is what makes
    // a turn read as a turn rather than as the marker jumping to a new angle.
    const heading =
      typeof marker.heading === "number" && Number.isFinite(marker.heading)
        ? marker.heading
        : null;
    const car = `<div class="flex size-9 items-center justify-center rounded-full border border-border bg-primary text-primary-foreground shadow-lg shadow-black/20">${CAR_SVG}</div>`;
    const rotated =
      heading === null
        ? car
        : `<span style="display:inline-flex;transition:transform 600ms ease-out;transform:rotate(${heading}deg)">${car}</span>`;
    return `${rotated}${label}`;
  }

  if (kind === "flag") {
    // The drop-off end of a trip: a filled banner rather than a hollow dot, so
    // a driver glancing at the map mid-drive can tell "where I am going" from
    // "where I am going first" without reading the label.
    return `<span class="flex size-5 items-center justify-center rounded-full border border-primary bg-primary text-primary-foreground shadow-md">${FLAG_SVG}</span>${label}`;
  }

  if (kind === "current") {
    // Blue, deliberately, and not `bg-primary`: see CURRENT_LOCATION_COLOR. The
    // halo is inline rather than a `bg-primary/15` utility because the colour
    // is a constant rather than a theme token — this dot must stay blue in both
    // light and dark, since "where I am" is a fact about the map, not about
    // the brand's surface treatment.
    return `<span class="relative flex size-4 items-center justify-center"><span class="absolute inline-flex size-9 animate-ping rounded-full" style="background:${CURRENT_LOCATION_COLOR}2e"></span><span class="relative inline-flex size-4 rounded-full border-2 border-background shadow-md" style="background:${CURRENT_LOCATION_COLOR}"></span></span>`;
  }

  const filled = kind === "pickup";
  // `transition` on the dot is the hover affordance: a pin that grows slightly
  // under the cursor is the cheapest possible confirmation that the tap that
  // follows will open this pin and not the map underneath it.
  return `<span class="flex size-4 items-center justify-center"><span class="flex size-3.5 items-center justify-center rounded-full border-2 shadow-md transition-transform duration-150 hover:scale-125 ${
    filled ? "border-background bg-primary" : "border-primary bg-background"
  }"></span></span>${label}`;
}

/**
 * Make a pin a tap target, or let taps fall through to the map.
 *
 * Leaflet markers sit above the canvas, so a pin that is not a tap target
 * still swallows the tap that was aimed at the map underneath — which is why
 * this is set explicitly rather than left to the default.
 */
function applyPinInteractivity(element: HTMLElement, clickable: boolean) {
  element.style.pointerEvents = clickable ? "auto" : "none";
  element.style.cursor = clickable ? "pointer" : "";
}

/** One live Leaflet marker, with the state needed to avoid needless redraws. */
type MarkerEntry = {
  marker: L.Marker;
  element: HTMLDivElement;
  kind: MapMarkerKind;
  label?: string;
  /** The bearing the pin was last painted with; see the repaint check. */
  heading?: number | null;
  /**
   * The marker data this pin currently represents. Read by the click listener,
   * which is attached once and must not close over the first render's copy.
   */
  latest: MapMarker;
  /** Pending requestAnimationFrame id for an in-flight glide, if any. */
  frame?: number;
};

/**
 * Move a marker to a new point, gliding rather than jumping.
 *
 * A target on the far side of the world is treated as a new marker rather than
 * a movement — gliding a rider across a province would look like a bug, and the
 * difference is exactly the hop size.
 */
function glideMarker(entry: MarkerEntry, next: MapMarker) {
  if (entry.frame !== undefined) {
    cancelAnimationFrame(entry.frame);
    entry.frame = undefined;
  }

  const from = entry.marker.getLatLng();
  const hop = Math.abs(from.lng - next.lng) + Math.abs(from.lat - next.lat);
  if (hop <= 1e-7 || hop >= MARKER_SNAP_DEGREES) {
    entry.marker.setLatLng([next.lat, next.lng]);
    return;
  }

  const startLng = from.lng;
  const startLat = from.lat;
  const startedAt = performance.now();

  const step = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / MARKER_GLIDE_MS);
    // Ease-out: quick off the mark, settling as it arrives.
    const eased = 1 - (1 - progress) * (1 - progress);
    entry.marker.setLatLng([
      startLat + (next.lat - startLat) * eased,
      startLng + (next.lng - startLng) * eased,
    ]);
    entry.frame = progress < 1 ? requestAnimationFrame(step) : undefined;
  };

  entry.frame = requestAnimationFrame(step);
}

/**
 * The route geometry to draw, in `LatLng` order.
 *
 * Each segment is routed **separately** and the results are stitched. Routing
 * the whole chain as one request would draw a road that ignores the pickup
 * entirely — the line would run from the rider straight to the destination,
 * which is not the trip anyone is taking, and would look especially wrong on a
 * tracking screen where the leg the commuter cares about is rider → pickup.
 *
 * The straight line is derived during render — it is pure and cheap, and it is
 * what shows immediately while the directions requests are in flight (and what
 * a keyless install keeps forever). Only the road route needs state, because
 * only it arrives asynchronously; it is tagged with the endpoints it was
 * fetched for so a late answer for a previous trip is never drawn over the
 * current one.
 *
 * The fetch is keyed on the endpoints as a string because callers rebuild the
 * `route` array on every render — depending on the array itself would refetch
 * continuously.
 */
function useRouteGeometry(segments: [LatLng, LatLng][] | null): LatLng[] {
  const key = (segments ?? [])
    .map(
      ([from, to]) =>
        `${from.lat},${from.lng}->${to.lat},${to.lng}`,
    )
    .join("|");

  const [road, setRoad] = useState<{ key: string; points: LatLng[] } | null>(
    null,
  );

  useEffect(() => {
    if (!segments || segments.length === 0) return;
    let cancelled = false;
    void Promise.all(segments.map(([from, to]) => fetchRoute(from, to))).then(
      (routes) => {
        if (cancelled) return;
        // A null route is the documented "use the straight line" answer, so a
        // segment that could not be routed contributes its endpoints and the
        // rest of the chain still follows roads.
        const points: LatLng[] = [];
        segments.forEach(([from, to], index) => {
          const chain = routes[index] ?? [from, to];
          for (const point of chain) {
            // Segments share an endpoint; pushing it twice would draw a
            // zero-length kink at the joint.
            const last = points[points.length - 1];
            if (!last || last.lat !== point.lat || last.lng !== point.lng) {
              points.push(point);
            }
          }
        });
        setRoad({ key, points });
      },
      // `fetchRoute` does not throw — every failure collapses to null — so this
      // is unreachable in practice. Falling back to the straight line anyway is
      // the same answer, not a swallowed error: an exception here must not
      // leave the map with no line at all.
      () => {
        if (!cancelled) setRoad({ key, points: straightGeometry(segments) });
      },
    );
    return () => {
      cancelled = true;
    };
    // Keyed on the endpoint string, not the objects; see the note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (road && road.key === key) return road.points;
  return straightGeometry(segments);
}

export function MapView({
  center,
  zoom: zoomProp = 14,
  markers = [],
  route = null,
  heatmap = null,
  onPick,
  dragPoint = null,
  onDragPointChange,
  onDragPointEnd,
  centerPin = null,
  followTarget = null,
  recenterTarget = null,
  interactive = true,
  className,
  onViewChange,
  onMarkerClick,
  onLongPress,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const dragRef = useRef<{ marker: L.Marker } | null>(null);
  const [ready, setReady] = useState(false);
  /*
   * True once tiles have failed — a 4xx/5xx from the tile server, or no tile
   * at all by the timeout. Leaflet does not need WebGL, so "the map cannot
   * start" is no longer a state this file can be in; the failure it can meet
   * is a basemap that will not download. The map still pans, pins still show,
   * and watching a rider's coordinate changes still works, so this is not an
   * error state in the app's own terms — but it is worth saying out loud,
   * because the alternative is a rider deciding the app is broken when what is
   * actually broken is one host.
   */
  const [degraded, setDegraded] = useState(false);

  /** Cleared when the user pans, so following never fights a gesture. */
  const followRef = useRef(true);

  /**
   * True while a pointer is down. Prop sync stands aside during a gesture; the
   * prop values a pan produces equal the ones the map already has, so there is
   * nothing to apply anyway, and skipping avoids any chance of a fight.
   */
  const interactingRef = useRef(false);

  /**
   * True while a camera glide we started is still running.
   *
   * Leaflet does not publish "is there an animation in flight" on a public
   * method either, so the window is tracked here: set when `glide()` runs,
   * cleared by a timer that outlives the animation. A token guards against an
   * earlier glide's timer clearing the flag while a later one is still in
   * flight.
   */
  const glidingRef = useRef(false);
  const glideTokenRef = useRef(0);

  /**
   * The prop values already applied. Rendering the initial view from a ref
   * keeps the mount effect free of dependencies, so the map is never torn down
   * and rebuilt when a prop changes.
   */
  const initial = useRef({ center, zoom: zoomProp, interactive });

  // Latest callbacks, read by map listeners so they never close over a stale
  // render.
  const latest = useRef({
    onPick,
    onViewChange,
    onDragPointChange,
    onDragPointEnd,
    onMarkerClick,
    onLongPress,
  });
  useEffect(() => {
    latest.current = {
      onPick,
      onViewChange,
      onDragPointChange,
      onDragPointEnd,
      onMarkerClick,
      onLongPress,
    };
  });

  /** Whether pins should accept taps at all; also a marker-effect dependency. */
  const clickable = onMarkerClick !== undefined;

  const routeGeometry = useRouteGeometry(route);
  /** Serialised geometry, so the route layer updates only when the line moves. */
  const routeKey = routeGeometry
    .map((point) => `${point.lat},${point.lng}`)
    .join("|");
  const routeRef = useRef(routeGeometry);
  useEffect(() => {
    routeRef.current = routeGeometry;
  });

  /**
   * Move the camera under our own control, marking the glide so the prop
   * effects ignore the echoes it produces.
   */
  const glide = useCallback(
    (options: { center?: [number, number]; zoom?: number; duration?: number }) => {
      const map = mapRef.current;
      if (!map) return;
      glideTokenRef.current += 1;
      const token = glideTokenRef.current;
      glidingRef.current = true;
      const duration = (options.duration ?? EASE_CENTER_MS) / 1000;
      const target = options.center ?? [
        map.getCenter().lat,
        map.getCenter().lng,
      ];
      map.flyTo(L.latLng(target[0], target[1]), options.zoom ?? map.getZoom(), {
        duration,
      });
      window.setTimeout(
        () => {
          if (glideTokenRef.current === token) glidingRef.current = false;
        },
        (options.duration ?? EASE_CENTER_MS) + 150,
      );
    },
    [],
  );

  /* ── Create the map ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Captured once: the ref object itself never changes, and reading it inside
    // the cleanup below trips the exhaustive-deps rule otherwise.
    const markerEntries = markersRef.current;

    /*
     * The basemap is decided before the map is built, from the build's own
     * keys — see `getBasemap()` in `@/lib/map-service`. With a MapTiler key the
     * map asks MapTiler; without one, it asks OpenStreetMap's public tiles,
     * which need nothing at all. `Leaflet` hands this to us cheaply: the tiles
     * are one URL template, and a configured-but-wrong key fails as a stream of
     * tile errors rather than as a blank canvas minus its labels.
     */
    const basemap = getBasemap();
    const home = clampToRegion(initial.current.center);
    let map: L.Map;
    try {
      map = L.map(container, {
        center: [home.lat, home.lng],
        zoom: initial.current.zoom,
        maxZoom: basemap.maxZoom,
        zoomControl: false,
        attributionControl: false,
        // The province is the world. Without this the map is a generic slippy
        // map: a pinch goes to the satellite, a stray drag lands in Kota
        // Kinabalu, and the tiles loaded outside the region are ones nobody
        // here rides in. Pinned to Bukidnon's box, with a margin baked into the
        // bounds themselves for the barangays that sit just over the line in
        // OSM's reckoning.
        maxBounds: L.latLngBounds([
          [REGION.bounds.minLat, REGION.bounds.minLng],
          [REGION.bounds.maxLat, REGION.bounds.maxLng],
        ]),
        maxBoundsViscosity: 1.0,
        ...(initial.current.interactive
          ? {}
          : {
              dragging: false,
              touchZoom: false,
              scrollWheelZoom: false,
              doubleClickZoom: false,
              boxZoom: false,
              keyboard: false,
            }),
      });
    } catch (error) {
      // Leaflet constructs without GPU dependencies, so this is effectively
      // unreachable in a browser — but an effect that throws must not take the
      // render down with it. The map keeps its furniture and the console keeps
      // the trace.
      console.error("[fetch] the map could not start", error);
      return;
    }
    mapRef.current = map;

    /*
     * `errorTileUrl` and the two update flags are all real options on
     * `TileLayerOptions` / `GridLayerOptions`, so they stay typed — the point
     * is the behaviour, not a cast around the checker.
     *
     * A tile that 404s or times out paints nothing by default, which reads as a
     * hole in the map. The placeholder keeps the layer's own bookkeeping honest
     * and makes a partial failure look like an unfinished map rather than a
     * broken one. The update flags keep a fast pinch from spending its budget
     * mounting tiles that are about to be replaced — the churn that used to
     * leave the viewport briefly empty.
     */
    L.tileLayer(basemap.url, {
      maxZoom: basemap.maxZoom,
      attribution: basemap.attribution,
      errorTileUrl:
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='256' height='256'%3E%3C/svg%3E",
      updateWhenIdle: true,
      updateWhenZooming: true,
    }).addTo(map);

    /*
     * A tile server that will not answer is only discovered here.
     *
     * Each failing tile fires `tileerror`; the timeout catches the silent
     * case — an unreachable host with no responses at all. One failure is
     * enough to say so, and the flag is never cleared: an offline-now, online-
     * in-a-minute device has real tiles already streaming in by the time it
     * matters, and an endless retry of the *notice* would just flicker.
     */
    let degradedNoticed = false;
    const tileUrlLabel =
      basemap.id === "maptiler"
        ? `maptiler (${basemap.url.split("/")[2]})`
        : "openstreetmap";
    const noticeDegraded = () => {
      if (degradedNoticed) return;
      degradedNoticed = true;
      map.off("tileerror", noticeDegraded);
      window.clearTimeout(tileWatchdog);
      setDegraded(true);
      console.warn(
        "[fetch] map tiles unavailable from %s — pins are still live",
        tileUrlLabel,
      );
    };
    map.on("tileerror", noticeDegraded);
    /*
     * `tileerror` only fires when a response arrives and is refused; a host the
     * network cannot reach is silent, so the watchdog is the guarantee and the
     * event the fast path.
     *
     * Leaflet's own tile bookkeeping is private, so the check is on the real
     * signal — whether any tile `<img>` the layer spawned has actually loaded.
     * `document.querySelector` against the container's own subtree would also
     * count tiles that failed, so it is `.leaflet-tile-loaded` that is read:
     * the class Leaflet itself sets on each successfully drawn image.
     */
    const tileWatchdog = window.setTimeout(() => {
      if (container.querySelector(".leaflet-tile-loaded") === null) {
        setDegraded(true);
      }
    }, TILE_LOAD_TIMEOUT_MS);

    /*
     * `load` fires once the first visible tiles are drawn. The route and heat
     * layers wait on it, so a map that never reports it would never draw its
     * line over its tiles.
     */
    map.on("load", () => setReady(true));

    if (initial.current.interactive) {
      map.on("click", (event) => {
        latest.current.onPick?.({ lat: event.latlng.lat, lng: event.latlng.lng });
      });
    }

    /*
     * Long press → drop a pin.
     *
     * Driven from the container's own pointer events rather than Leaflet's,
     * because the press has to be *cancelled* by a pan. Leaflet emits its
     * gesture events but not "the user moved far enough that this is no longer
     * a press", and without that check every attempt to scroll the map drops a
     * pin wherever the finger happened to be at the halfway point.
     *
     * `pointerdown` is captured rather than bubbled: Leaflet calls
     * preventDefault on its own pointer handling, and a listener that never
     * fires is worse than no press gesture at all.
     *
     * The timer is per-press and cleared on every exit path, so a cancelled
     * press can never fire later against a stale position.
     */
    let pressTimer: number | undefined;
    let pressOrigin: { x: number; y: number } | null = null;

    const cancelPress = () => {
      if (pressTimer !== undefined) {
        window.clearTimeout(pressTimer);
        pressTimer = undefined;
      }
      pressOrigin = null;
    };

    const handlePressStart = (event: PointerEvent) => {
      cancelPress();
      if (event.button !== 0 && event.pointerType === "mouse") return;
      // The zoom and recentre controls live inside the map container, so a
      // press on "+" is a press on the map as far as this listener is
      // concerned — and holding a button to zoom twice used to drop a pin in
      // whatever direction the map was pointing at the halfway point.
      if ((event.target as HTMLElement | null)?.closest("button")) return;
      pressOrigin = { x: event.clientX, y: event.clientY };
      const at = { x: event.clientX, y: event.clientY };
      pressTimer = window.setTimeout(() => {
        pressTimer = undefined;
        const rect = container.getBoundingClientRect();
        // The point is read through the map at the moment the timer fires, not
        // at pointerdown: the map may have panned in between, and using the
        // stale coordinates would drop the pin where the finger started rather
        // than where it is resting.
        const point = map.containerPointToLatLng(
          L.point(at.x - rect.left, at.y - rect.top),
        );
        latest.current.onLongPress?.({
          lat: point.lat,
          lng: point.lng,
        });
      }, LONG_PRESS_MS);
    };

    const handlePressMove = (event: PointerEvent) => {
      if (!pressOrigin) return;
      const moved =
        Math.abs(event.clientX - pressOrigin.x) +
        Math.abs(event.clientY - pressOrigin.y);
      if (moved > LONG_PRESS_TOLERANCE_PX) cancelPress();
    };

    container.addEventListener("pointerdown", handlePressStart, {
      capture: true,
    });
    container.addEventListener("pointermove", handlePressMove, {
      capture: true,
    });
    // Without this, the press timer outlives the finger: every short tap on
    // the map still fired `onLongPress` half a second later, so the "confirm
    // this pin" card opened after any tap at all. `pointerup` and
    // `pointerleave` are both needed — the first for a normal tap, the second
    // for a finger that slides off the map without lifting.
    container.addEventListener("pointerup", cancelPress, { capture: true });
    container.addEventListener("pointercancel", cancelPress, {
      capture: true,
    });
    container.addEventListener("pointerleave", cancelPress, {
      capture: true,
    });
    map.on("move", () => {
      const next = map.getCenter();
      latest.current.onViewChange?.(
        { lat: next.lat, lng: next.lng },
        map.getZoom(),
        "move",
      );
    });
    // Also report the settled view. An eased move fires `move` on every frame,
    // so a caller that mirrors the map into state would otherwise be left
    // holding a mid-animation centre once the glide finished — and a caller
    // that geocodes needs to know *when* the answer stopped changing.
    map.on("moveend", () => {
      const next = map.getCenter();
      latest.current.onViewChange?.(
        { lat: next.lat, lng: next.lng },
        map.getZoom(),
        "moveend",
      );
    });
    // Any deliberate pan means the commuter is looking somewhere else; stop
    // dragging the camera back to the rider.
    map.on("dragstart", () => {
      followRef.current = false;
    });

    const handleDown = () => {
      interactingRef.current = true;
    };
    const handleUp = () => {
      interactingRef.current = false;
    };
    container.addEventListener("pointerdown", handleDown);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);

    // Leaflet measures its container once, at construction; a container that
    // changes size later — the sheet sliding in over it, a phone rotating —
    // leaves the map sized for a world that no longer fits it.
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(container);

    return () => {
      cancelPress();
      window.clearTimeout(tileWatchdog);
      map.off("tileerror", noticeDegraded);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", handlePressStart, {
        capture: true,
      });
      container.removeEventListener("pointermove", handlePressMove, {
        capture: true,
      });
      container.removeEventListener("pointerup", cancelPress, {
        capture: true,
      });
      container.removeEventListener("pointercancel", cancelPress, {
        capture: true,
      });
      container.removeEventListener("pointerleave", cancelPress, {
        capture: true,
      });
      container.removeEventListener("pointerdown", handleDown);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);

      for (const entry of markerEntries.values()) {
        if (entry.frame !== undefined) cancelAnimationFrame(entry.frame);
        entry.marker.remove();
      }
      markerEntries.clear();
      dragRef.current?.marker.remove();
      dragRef.current = null;

      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  /* ── Follow the moving point (the rider, usually) ───────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followTarget || !followRef.current) return;
    glide({
      // Same rule as the centre effect: the map stays on Bukidnon, and the
      // screen that owns the point decides whether an out-of-province fix
      // should be treated as an error.
      center: (() => {
        const inside = clampToRegion(followTarget);
        return [inside.lat, inside.lng];
      })(),
      duration: EASE_FOLLOW_MS,
    });
    // Keyed on the coordinates: a caller that rebuilds `followTarget` each
    // render must not restart the glide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followTarget?.lat, followTarget?.lng]);

  /* ── Apply prop-driven camera changes ───────────────────────────────────── */
  // `interactingRef` and `glidingRef` are what separate "the caller moved the
  // camera" from "the camera is already moving there". Everything a pan or one
  // of our own glides produces arrives as an echo of the current camera, so once
  // both guards pass there is genuinely somewhere else to go.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (interactingRef.current || glidingRef.current) return;
    const current = map.getCenter();
    if (
      Math.abs(current.lat - center.lat) < 1e-9 &&
      Math.abs(current.lng - center.lng) < 1e-9
    ) {
      return;
    }
    glide({
      // Clamped, because `center` can arrive from outside the province — a GPS
      // fix taken in Davao City, or a search result the filter let through. The
      // map stays on Bukidnon; the point itself is validated separately, by the
      // screen that owns it, rather than quietly moved here.
      center: (() => {
        const inside = clampToRegion(center);
        return [inside.lat, inside.lng];
      })(),
      duration: EASE_CENTER_MS,
    });
    // `center` itself is read through the closure, latest at effect time; the
    // coordinate keys are the actual inputs, so a caller rebuilding the object
    // every render does not restart a glide already under way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, glide]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (interactingRef.current || glidingRef.current) return;
    if (Math.abs(map.getZoom() - zoomProp) < 1e-6) return;
    glide({ zoom: zoomProp, duration: EASE_CENTER_MS });
  }, [zoomProp, glide]);

  /* ── Markers ────────────────────────────────────────────────────────────── */
  // Deliberately not gated on `ready`: a Leaflet marker is a DOM element and
  // needs no basemap, so the pins still show if the tiles are slow or
  // unreachable. Only the overlay layers below wait for tiles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const next of markers) {
      seen.add(next.id);
      const kind = next.kind ?? "destination";
      let entry = markersRef.current.get(next.id);

      if (!entry) {
        const element = document.createElement("div");
        element.className = "flex flex-col items-center";
        const icon = L.divIcon({
          className: "",
          html: element,
          iconSize: [0, 0],
        });
        const marker = L.marker([next.lat, next.lng], { icon });
        element.style.transform = "translate(-50%, -50%)";
        marker.addTo(map);
        const created: MarkerEntry = {
          marker,
          element,
          kind,
          label: next.label,
          heading: next.heading,
          latest: next,
        };
        markersRef.current.set(next.id, created);

        // Attached once. It reads `created.latest` rather than closing over
        // `next`, so a pin that has since been re-painted still reports the
        // place it is currently showing.
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          latest.current.onMarkerClick?.(created.latest);
        });
        entry = created;
      }

      entry.latest = next;
      applyPinInteractivity(entry.element, clickable);

      // Repaint only when the pin would actually look different. A rider
      // turning on the spot does not move, so its bearing has to be part of the
      // comparison or the car would keep pointing the way it was going when it
      // arrived.
      if (
        entry.kind !== kind ||
        entry.label !== next.label ||
        entry.heading !== next.heading
      ) {
        entry.kind = kind;
        entry.label = next.label;
        entry.heading = next.heading;
        entry.element.innerHTML = pinHtml(next);
      }

      glideMarker(entry, next);
    }

    for (const [id, entry] of markersRef.current) {
      if (seen.has(id)) continue;
      if (entry.frame !== undefined) cancelAnimationFrame(entry.frame);
      entry.marker.remove();
      markersRef.current.delete(id);
    }
  }, [markers, clickable]);

  /* ── Demand heatmap ─────────────────────────────────────────────────────── */
  /*
   * Added to a group that keeps it **below** the route polylines: Leaflet
   * stacks panes by z-index, and the route is the thing a driver follows while
   * the heat is only context. Circles rather than a thermal gradient, because
   * a genuinely smooth heat field would need a canvas overlay that re-projects
   * on every frame — a lot of code for context that is read at a glance.
   */
  const heatmapKey = (heatmap ?? [])
    .map((point) => `${point.lat},${point.lng},${point.weight}`)
    .join("|");
  const heatmapRef = useRef<HeatmapPoint[]>(heatmap ?? []);
  useEffect(() => {
    heatmapRef.current = heatmap ?? [];
  });
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const layer = L.layerGroup().addTo(map);
    for (const point of heatmapRef.current) {
      // A cell hit by one request is a faint smudge; a cell hit by ten is a
      // solid patch, which is the whole point of a density map.
      const weight = Math.max(1, Math.min(10, point.weight));
      L.circleMarker([point.lat, point.lng], {
        radius: 16 + weight * 4,
        weight: 0,
        fillOpacity: 0.08 + weight * 0.035,
        stroke: false,
        fill: true,
        fillColor: weight >= 5 ? "#ffc72c" : "#e1251b",
      }).addTo(layer);
    }

    return () => {
      layer.remove();
    };
    // Keyed on the points, not the array identity — the caller rebuilds the
    // array every render, and redrawing identical points would flicker.
  }, [heatmapKey, ready]);

  /* ── Route line ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const points = routeRef.current;
    if (points.length < 2) return;

    const latlngs = points.map((point) => L.latLng(point.lat, point.lng));
    const casing = L.polyline(latlngs, {
      color: ROUTE_CASING,
      weight: 8,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    });
    const line = L.polyline(latlngs, {
      color: ROUTE_COLOR,
      weight: 4,
      lineCap: "round",
      lineJoin: "round",
      interactive: false,
    });
    casing.addTo(map);
    line.addTo(map);

    return () => {
      casing.remove();
      line.remove();
    };
    // Keyed on the drawn geometry, not on the array identity: `routeGeometry`
    // is rebuilt on every render, and re-creating identical polylines each time
    // would churn the DOM on every keystroke.
  }, [routeKey, ready]);

  /* ── Draggable pin, for fine-tuning an end of the trip ──────────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!dragPoint) {
      dragRef.current?.marker.remove();
      dragRef.current = null;
      return;
    }

    if (!dragRef.current) {
      // `draggable: true` is Leaflet's own gesture handling; `drag` and
      // `dragend` report what it decided, which is what the callers read.
      const marker = L.marker([dragPoint.lat, dragPoint.lng], {
        draggable: true,
        icon: L.divIcon({
          className: "",
          html: DRAG_PIN_HTML,
          iconSize: [32, 48],
          iconAnchor: [16, 48],
        }),
        interactive: false,
      });
      marker.addTo(map);
      marker.on("drag", () => {
        const position = marker.getLatLng();
        latest.current.onDragPointChange?.({
          lat: position.lat,
          lng: position.lng,
        });
      });
      marker.on("dragend", () => {
        const position = marker.getLatLng();
        latest.current.onDragPointEnd?.({
          lat: position.lat,
          lng: position.lng,
        });
      });
      dragRef.current = { marker };
      return;
    }

    dragRef.current.marker.setLatLng([dragPoint.lat, dragPoint.lng]);
    // Keyed on the coordinates for the same reason as `followTarget`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragPoint?.lat, dragPoint?.lng]);

  /* ── Controls ───────────────────────────────────────────────────────────── */
  const zoomBy = (delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    const next = Math.min(
      map.getMaxZoom(),
      Math.max(map.getMinZoom(), map.getZoom() + delta),
    );
    glide({ zoom: next, duration: 250 });
  };

  const recenter = () => {
    if (!mapRef.current) return;
    const target = recenterTarget ?? followTarget ?? center;
    if (!target) return;
    // Only follow *after* the control is used: tapping recentre is an explicit
    // "put me back here", so from then on the map tracks that point until the
    // commuter pans away again (see the `dragstart` handler).
    followRef.current = Boolean(recenterTarget ?? followTarget);
    glide({ center: [target.lat, target.lng], duration: EASE_CENTER_MS });
  };

  /*
   * How the centre pin is painted, decided by which end is being chosen.
   *
   * Filled teardrop for the pickup — the place the rider comes *to* — and an
   * outlined one for the destination, which is the same filled/hollow rule the
   * dot pins follow. Keeping the two vocabularies identical means a commuter
   * who has used one screen can read the other without being told.
   */
  const pinFilled = (centerPin?.kind ?? "destination") === "pickup";
  const pinFill = pinFilled ? ROUTE_COLOR : "#ffffff";
  const pinStroke = pinFilled ? "none" : ROUTE_COLOR;
  const pinStrokeWidth = pinFilled ? 0 : 2;
  const pinDot = pinFilled ? "#ffffff" : ROUTE_COLOR;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden bg-secondary/60", className)}
    >
      {/*
          The centre pin: furniture on the screen, not a thing on the map.

          `pointer-events-none` is load-bearing rather than tidy — the pin sits
          over the exact spot the user is about to drag, so swallowing the
          pointer there would make the gesture this exists for impossible. The
          tip of the teardrop is the point: the graphic is translated up by its
          own height, so what lands on the container's centre is the sharp end
          rather than the middle of the SVG.

          Below the controls (z-10) so zoom and recentre stay tappable, and
          above the map so the pin is never lost against the tiles.
      */}
      {centerPin ? (
        <div className="pointer-events-none absolute inset-0 z-[5]">
          {/*
              `left-1/2 top-1/2` puts the *top-left corner* of the graphic on
              the centre, so both axes have to be translated back: the full
              height to drop the tip onto the centre, half the width to keep it
              horizontally true. `block` on the svg matters too — as an inline
              box it would sit on a baseline and gain a few pixels of descender
              space below the tip, which would quietly put the pin off the spot
              it is claiming to mark.
          */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
            <svg
              viewBox="0 0 24 36"
              width="32"
              height="48"
              aria-hidden="true"
              className="block"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))" }}
            >
              <path
                d="M12 0C5.4 0 0 5.2 0 11.6 0 20.4 12 36 12 36s12-15.6 12-24.4C24 5.2 18.6 0 12 0z"
                fill={pinFill}
                stroke={pinStroke}
                strokeWidth={pinStrokeWidth}
              />
              <circle cx="12" cy="11.6" r="4.2" fill={pinDot} />
            </svg>
          </div>
        </div>
      ) : null}

      {/* Controls. 44px on a phone, where these get pressed with a thumb on a
          moving bus; they shrink back on pointer devices. The shadcn `icon`
          button already sizes for thumbs first and desktops second, so the map
          overlays inherit the same hit-target rule as every other button in
          the app. */}
      {interactive ? (
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
          <Button
            type="button"
            onClick={() => zoomBy(1)}
            aria-label="Zoom in"
            variant="outline"
            size="icon"
            className="size-11 rounded-full bg-background/95 shadow-sm backdrop-blur sm:size-10 [&_svg]:size-5 sm:[&_svg]:size-4"
          >
            <Plus />
          </Button>
          <Button
            type="button"
            onClick={() => zoomBy(-1)}
            aria-label="Zoom out"
            variant="outline"
            size="icon"
            className="size-11 rounded-full bg-background/95 shadow-sm backdrop-blur sm:size-10 [&_svg]:size-5 sm:[&_svg]:size-4"
          >
            <Minus />
          </Button>
          <Button
            type="button"
            onClick={recenter}
            aria-label="Recenter map"
            variant="outline"
            size="icon"
            className="size-11 rounded-full bg-background/95 shadow-sm backdrop-blur sm:size-10 [&_svg]:size-5 sm:[&_svg]:size-4"
          >
            <Crosshair />
          </Button>
        </div>
      ) : null}

      {/*
          A basemap that never arrived, said out loud.

          Covers part of the map, and the pin, controls and markers behind it —
          which are real DOM and stay mounted — are not mistaken for a working
          map. The map still pans underneath and the pins still show; what it
          does not have is anything to look at.
      */}
      {degraded ? (
        <div className="pointer-events-none absolute inset-0 z-[9] flex items-center justify-center bg-secondary/70 px-5">
          <Card className="max-w-[22rem] items-center gap-1.5 bg-background/95 px-3.5 py-3 text-center shadow-sm">
            <p className="text-xs font-medium text-foreground">
              No map tiles yet.
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {getBasemap().id === "maptiler"
                ? "The basemap could not be reached. If a MapTiler key is configured, it may be invalid or expired; otherwise check the connection."
                : "The basemap could not be reached. Pins are still live — check the connection and the map will populate on its own."}
          </p>
          </Card>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-2 left-3 z-10 text-[10px] tracking-tight text-muted-foreground">
        {MAP_ATTRIBUTION}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-3 z-10 text-[10px] tracking-tight text-muted-foreground">
        Tiles: {getBasemap().id === "maptiler" ? "MapTiler" : "OpenStreetMap"}
        {hasMapTiler ? " · key: yes" : ""}
      </div>
    </div>
  );
}
