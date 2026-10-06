/**
 * The length of the road route between two points, in kilometres.
 *
 * ── Why the fare needs this and not just the two pins ─────────────────────
 * `haversineKm` answers "how far apart are these two points", which is not what
 * a trip costs. A Malaybalay → Valencia trip runs down the national highway and
 * is roughly a third longer than the line drawn between the pins, so pricing on
 * the straight line either overcharges short city hops or, on a highway, quietly
 * underpays the rider for the fuel they burn. The map already asks
 * OpenRouteService for the real driving line; this hook measures the same
 * geometry so the number on the booking screen is the number in the picture.
 *
 * ── Why this is a hook and not a fetch inside the screen ───────────────────
 * The route is refetched every time either end moves, and the answer must
 * arrive out of order all the time — a commuter dragging the pickup pin
 * produces a request per drag frame. Centralising that here means the cancel
 * logic, the keying, and the "still loading" state exist in exactly one place
 * instead of being re-derived (incorrectly) at each call site.
 *
 * ── Why `null` and not a number ────────────────────────────────────────────
 * "No road distance yet" and "zero kilometres" are different facts, and
 * collapsing them would price a trip that has not been measured. `null` means
 * the caller should fall back to the straight line deliberately.
 *
 * Keyed on an endpoint *string*, not the point objects: callers rebuild those
 * on every render, so depending on the objects would refetch in a loop.
 */

import { useEffect, useState } from "react";

import { haversineKm, type LatLng } from "@/lib/geo";
import { polylineLengthKm } from "@/lib/fare-breakdown";
import { fetchRoute } from "@/lib/routing-service";
import { ROUTE_SETTLE_MS } from "@/lib/search";

export interface RoadDistance {
  /**
   * Length of the driving route in km, or null while it is still being fetched
   * (or when no routing provider is configured).
   */
  roadKm: number | null;
  /** The straight-line distance, always available and never null. */
  straightKm: number;
  /** True while a road route is in flight for the current pair of points. */
  loading: boolean;
}

const endpointKey = (from: LatLng, to: LatLng) =>
  `${from.lat.toFixed(5)},${from.lng.toFixed(5)}->${to.lat.toFixed(5)},${to.lng.toFixed(5)}`;

/**
 * Measure pickup → destination.
 *
 * Either end being null means "no trip yet": the distance is zero and nothing
 * is fetched, rather than routing to Null Island.
 */
export function useRoadDistance(
  from: LatLng | null,
  to: LatLng | null,
  settleMs: number = ROUTE_SETTLE_MS,
): RoadDistance {
  const key = from && to ? endpointKey(from, to) : "";
  const straightKm = from && to ? haversineKm(from, to) : 0;

  const [state, setState] = useState<{ key: string; km: number | null }>({
    key: "",
    km: null,
  });

  useEffect(() => {
    if (!from || !to) return;
    // Debounced on purpose. Dragging a pin re-keys these endpoints on nearly
    // every pointer frame, and routing is a metered request: without this, one
    // gesture of a thumb across a hundred metres would spend a hundred routes.
    // The line therefore redraws once the pin settles — which also stops the
    // route jittering under a pin that is still moving.
    let cancelled = false;
    const timer = window.setTimeout(() => {
      // `fetchRoute` resolves null without throwing when there is no key, the
      // network is down, or the pair is unroutable, so this promise cannot
      // reject — but a throw here would still leave the fallback stale.
      void fetchRoute(from, to)
        .then((points) => {
          if (cancelled) return;
          setState({ key, km: polylineLengthKm(points) });
        })
        .catch(() => {
          if (!cancelled) setState({ key, km: null });
        });
    }, settleMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, settleMs]);

  // The stored answer is only valid for the pair it was fetched for. A late
  // response for a previous pair is discarded rather than priced, which is the
  // same reason `useRouteGeometry` in `MapView` keys its cache.
  const current = state.key === key ? state.km : null;

  return {
    roadKm: current,
    straightKm,
    loading: key !== "" && current === null,
  };
}
