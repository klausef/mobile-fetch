import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/shared";

/**
 * The phone's own position, wrapped for the two things FETCH asks of it.
 *
 * A commuter wants one fix, once, when they tap "use my location" — waiting on
 * a cold GPS for eleven seconds behind a spinner is how a booking form loses a
 * fare. So the last known position is taken first and only then a live fix, and
 * the whole thing is bounded by the caller's own UI rather than by a timer
 * here.
 *
 * A rider wants the opposite: a stream, at a rate that is frequent enough to
 * move the pin on a commuter's screen and rare enough that a shift does not
 * drain the battery. That stream is deliberately the only place `watchPosition`
 * lives, so no screen can accidentally open a second one.
 */

export type FixFailure = "denied" | "unavailable";

export type FixResult =
  | { ok: true; point: LatLng }
  | { ok: false; reason: FixFailure };

/** One position, permission asked for on the way. */
export async function requestFix(): Promise<FixResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return { ok: false, reason: "denied" };

    // A fix from a minute ago beats a fix that never arrives: it is the
    // difference between a pickup three streets off and a form nobody can
    // complete.
    const last = await Location.getLastKnownPositionAsync();
    if (last) {
      return {
        ok: true,
        point: { lat: last.coords.latitude, lng: last.coords.longitude },
      };
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      ok: true,
      point: { lat: current.coords.latitude, lng: current.coords.longitude },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

function toPoint(position: Location.LocationObject): LatLng {
  return { lat: position.coords.latitude, lng: position.coords.longitude };
}

export interface LiveFix {
  point: LatLng | null;
  /** A heading in degrees when the device reports one, else null. */
  heading: number | null;
}

/**
 * A rider's live position, for as long as the caller is watching.
 *
 * `enabled` is what starts and stops the subscription, so a rider who goes
 * offline stops reporting with the same tap that closes their shift — the
 * watcher is tied to the switch rather than to a screen being mounted.
 */
export function useLiveFix(enabled: boolean): LiveFix {
  const [fix, setFix] = useState<LiveFix>({ point: null, heading: null });
  const headingRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setFix({ point: null, heading: null });
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            // Ten seconds or twenty-five metres: a tricycle at city speed moves
            // about that far between ticks, so the pin advances smoothly
            // without a write a second for a rider parked at a terminal.
            timeInterval: 10_000,
            distanceInterval: 25,
          },
          (position) => {
            if (cancelled) return;
            headingRef.current = position.coords.heading ?? headingRef.current;
            setFix({
              point: toPoint(position),
              heading: Number.isFinite(headingRef.current)
                ? headingRef.current
                : null,
            });
          },
        );
      } catch {
        // No permission, no provider: the rider simply does not report a
        // position. Their shift and their rides are unaffected.
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return fix;
}
