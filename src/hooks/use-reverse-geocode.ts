/**
 * Turn a moving pin into an address, without flooding the geocoder.
 *
 * ── Why this is a hook ──────────────────────────────────────────────────────
 * Dragging a pin emits a coordinate on every pointer frame. Calling MapTiler's
 * (or Nominatim's) reverse endpoint on each of them would spend a commuter's
 * metered quota in a single gesture, get the app rate-limited by the end of
 * it, and produce a visible flicker as out-of-order answers land. So the
 * lookup is debounced (`REVERSE_GEOCODE_DEBOUNCE_MS`) *and* distance-gated
 * (`REVERSE_GEOCODE_MIN_MOVE_M`) — the pin has to settle, and settle
 * somewhere new, before it is worth asking.
 *
 * ── Why the loading state is derived, not stored ───────────────────────────
 * The only state this hook keeps is "the label that was looked up, and the
 * position it belongs to". `resolving` is then computed during render: the pin
 * has moved away from the position we have an answer for, by more than the
 * distance gate, so a lookup is either in flight or about to be. Storing it
 * instead would mean writing state from inside the effect body on every frame
 * of a drag — a render per pointer event, and the one thing the debounce
 * exists to avoid. Deriving it costs nothing and cannot fall out of step with
 * the answer it describes.
 *
 * ── Why the last answer is kept while a new one is in flight ───────────────
 * Blanking the address during a drag makes the text under the pin strobe. The
 * commuter is dragging, not reading; the label catches up when they let go.
 *
 * ── Why the stale-answer guard lives here ──────────────────────────────────
 * Requests cannot be aborted reliably across every provider, and a slow answer
 * for an abandoned position is worse than no answer: it would label the pin
 * with the street the commuter *used* to be on. Each answer carries the key it
 * was fetched for, and an answer whose key is not the current one is dropped.
 */

import { useEffect, useRef, useState } from "react";

import { describePoint } from "@/lib/map-service";
import type { LatLng } from "@/lib/map-service";
import {
  fallbackCoordinateLabel,
  REVERSE_GEOCODE_DEBOUNCE_MS,
  shouldReverseGeocode,
} from "@/lib/search";

const keyOf = (point: LatLng) =>
  `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;

export interface ReverseGeocodeResult {
  /** The best label known for the pin: a real address, or its coordinates. */
  address: string | null;
  /** True while a lookup for the current position is in flight. */
  resolving: boolean;
}

export function useReverseGeocode(
  point: LatLng | null,
  /**
   * Fired with each fresh label and the position it belongs to.
   *
   * This is how the address reaches the booking state. The caller writes it
   * from the callback rather than reading `address` back in an effect, which
   * keeps the write out of React's render-phase rules *and* out of the
   * pointer-frame path. `at` is passed back so a caller can ignore a label for
   * a position its state has already moved on from.
   */
  onResolved?: (at: LatLng, address: string) => void,
  delayMs: number = REVERSE_GEOCODE_DEBOUNCE_MS,
): ReverseGeocodeResult {
  const [answered, setAnswered] = useState<{
    key: string;
    address: string;
    at: LatLng;
  } | null>(null);

  /**
   * The position the current answer belongs to.
   *
   * A ref, not state, so the scheduling effect can read the last resolved
   * position without depending on `answered` — otherwise every answer would
   * change the effect's inputs and schedule another lookup for a pin that has
   * not moved.
   */
  const resolvedRef = useRef<LatLng | null>(null);
  /** The key of the newest scheduled request, so late answers are recognisable. */
  const latestKeyRef = useRef<string>("");
  /**
   * The callback, held in a ref: a new function identity on every render must
   * not restart a debounce that is already counting down.
   */
  const onResolvedRef = useRef(onResolved);

  const key = point ? keyOf(point) : "";

  // Written from an effect and read from a timer, never during render.
  useEffect(() => {
    onResolvedRef.current = onResolved;
  });
  useEffect(() => {
    resolvedRef.current = answered?.at ?? null;
  }, [answered]);

  useEffect(() => {
    if (!point) {
      latestKeyRef.current = "";
      resolvedRef.current = null;
      return;
    }
    // An answer for this exact position already exists, or the pin has not
    // moved far enough from it to be worth another metered call.
    if (!shouldReverseGeocode(resolvedRef.current, point)) return;

    latestKeyRef.current = key;
    const timer = window.setTimeout(() => {
      const publish = (label: string) => {
        resolvedRef.current = point;
        setAnswered({ key, address: label, at: point });
        onResolvedRef.current?.(point, label);
      };
      void describePoint(point).then(
        (found) => {
          if (latestKeyRef.current !== key) return;
          // A pin the lookup could not name still gets coordinates, which
          // identify it better than a dash.
          publish(found ?? fallbackCoordinateLabel(point));
        },
        // A failed lookup must not reject into the void: the pin is still
          // where the commuter put it, and an unhandled rejection here would
          // leave the address field blank forever.
        () => {
          if (latestKeyRef.current !== key) return;
          publish(fallbackCoordinateLabel(point));
        },
      );
    }, delayMs);

    return () => window.clearTimeout(timer);
    // `key` is the real input — the endpoint, to five decimal places, which is
    // finer than a screen pixel at any zoom this app reaches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, delayMs]);

  const hasCurrentAnswer = answered !== null && answered.key === key;
  // The pin has left the position we last resolved, and by enough that a lookup
  // is genuinely warranted: so one is either running or already scheduled.
  // Derived during render rather than stored, because storing it would mean a
  // state write on every pointer frame of a drag — exactly what the debounce
  // exists to avoid.
  const wantsLookup =
    point !== null &&
    !hasCurrentAnswer &&
    shouldReverseGeocode(answered?.at ?? null, point);

  return {
    // Deliberately the *last* answer, not "null until the current one lands".
    address: answered?.address ?? null,
    resolving: wantsLookup,
  };
}