import { api } from "@/convex/_generated/api";
import { geoPermission } from "@/lib/geo";
import type { GeoState, useGeolocation } from "@/hooks/use-geolocation";
import { useMutation } from "convex/react";
import { useEffect, useRef } from "react";

/**
 * How often an online rider's position is pushed to the server.
 *
 * Two seconds, because that is how fresh the passenger's map has to be: the
 * marker glides over roughly a second, so a longer gap leaves the car visibly
 * stationary between hops. It is not free, but it is bounded — `updateLocation`
 * writes only when the rider has actually moved about ten metres or the stored
 * fix is five seconds stale, so a rider idling at a kerb costs one write every
 * five seconds rather than one every two.
 */
const STREAM_INTERVAL_MS = 2000;

/**
 * Keep the server informed of an online rider's position.
 *
 * Deliberately owned by the app shell rather than by one screen. It used to
 * live on the rider dashboard, which meant it stopped the moment the rider
 * opened the screen that actually shows their route: the location froze
 * precisely when the passenger's live map was most useful, and nobody
 * noticed because the map still drew the rider's last known point.
 *
 * Returns the live position so the calling screen can centre a map on it
 * without asking the browser for a second fix.
 */
export function useLocationStreaming(isOnline: boolean) {
  const updateLocation = useMutation(api.riders.updateLocation);
  const geo = useGeolocation({ watch: true });
  const coordsRef = useRef<GeoState["coords"]>(geo.coords);

  useEffect(() => {
    coordsRef.current = geo.coords;
  }, [geo.coords]);

  useEffect(() => {
    if (!isOnline) return;
    const send = () => {
      const coords = coordsRef.current;
      if (!coords) return;
      void updateLocation({
        lat: coords.lat,
        lng: coords.lng,
        // Omitted rather than sent as null: an absent heading leaves the stored
        // bearing alone, so a rider driving through a tunnel keeps pointing the
        // way they were pointing rather than snapping to north.
        ...(coords.heading != null ? { heading: coords.heading } : {}),
      } as Parameters<typeof updateLocation>[0]).catch(() => {
        /* transient network errors are retried on the next tick */
      });
    };
    // One immediately rather than waiting a full interval: a rider who has just
    // gone online should be findable at once, not after the first interval.
    send();
    const timer = setInterval(send, STREAM_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isOnline, updateLocation]);

  return geo;
}