import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The watcher's options.
 *
 * `enableHeading` is the field that matters for a tracking screen: without it
 * the browser reports no bearing at all on most platforms, so a rider's car
 * would never turn on the passenger's map. Built here so the extra field is
 * declared once.
 */
function watchOptions(): HeadingPositionOptions {
  return {
    enableHighAccuracy: true,
    enableHeading: true,
    maximumAge: 5000,
    timeout: 20000,
  };
}

/**
 * `PositionOptions` plus the compass.
 *
 * `enableHeading` is part of the W3C Geolocation API and is honoured by every
 * current browser, but the DOM lib this project compiles against predates it.
 * Declaring the one field here — rather than casting the options object at each
 * call site — keeps the intent visible and keeps a real typo in the rest of the
 * options a compile error.
 */
export type HeadingPositionOptions = PositionOptions & {
  enableHeading?: boolean;
};

/**
 * A browser heading, or null when there is not a usable one.
 *
 * Three ways the Geolocation API says "I don't know which way you are facing":
 * the field is absent, it is `null`, or it is `NaN` — the last of which is what
 * a device reports when it has a compass but no fix on it. All three mean the
 * same thing here, and all three have to become the same value or a marker
 * would spin to a random angle on the commuter’s map.
 */
export function normalizeHeading(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw)
    ? (raw + 360) % 360
    : null;
}

export type GeoStatus =
  | "idle"
  | "locating"
  | "ready"
  | "denied"
  | "unavailable"
  | "timeout"
  | "error";

export type GeoCoords = {
  lat: number;
  lng: number;
  accuracy?: number;
  /**
   * Compass bearing in degrees clockwise from north, when the device reports
   * one. Optional because it genuinely is optional: `getCurrentPosition` and
   * `watchPosition` both return `null` for a device with no heading, and a
   * watcher only reports it at all with `enableHeading` — see below.
   */
  heading?: number | null;
};

export interface GeoState {
  status: GeoStatus;
  coords: GeoCoords | null;
  message: string | null;
}

const PERMISSION_MESSAGE =
  "Location access is required to request or track a ride.";

const HAS_GEOLOCATION =
  typeof navigator !== "undefined" && navigator.geolocation != null;

/** Live permission state, as reported by the browser itself. */
export type GeoPermission = "granted" | "denied" | "prompt" | "unknown";

/**
 * Why a fix might be impossible even though the API exists.
 *
 * These two are environment facts, not app bugs, and they are the usual reason
 * an accepted permission "does nothing":
 *
 *  - Geolocation requires a secure context. Served over plain http on anything
 *    other than localhost, the browser refuses outright.
 *  - Served inside an iframe, the *embedding* page must opt in with
 *    `allow="location"`. A cross-origin frame that does not is refused, and the
 *    permission prompt never appears at all — so there is nothing to accept.
 *
 * Without saying which one it is, the app can only offer "GPS unavailable",
 * which sends people to check their sky when the fault is the page.
 */
const IN_IFRAME =
  typeof window !== "undefined" && window.self !== window.top;
const SECURE_CONTEXT =
  typeof window === "undefined" ? true : window.isSecureContext !== false;

/** An actionable sentence for the situation, or null if the environment is fine. */
function environmentHint(): string | null {
  if (!SECURE_CONTEXT) {
    return "This page is not served over HTTPS, so the browser will not share your location. Open Fetch on its own secure address.";
  }
  if (IN_IFRAME) {
    return "This preview embeds Fetch in a frame, and the browser only shares location with a frame that explicitly allows it. Open Fetch in its own tab to use GPS.";
  }
  return null;
}

/** How to un-stick a permission the browser has already refused. */
const RESET_HINT =
  "To reset it: click the lock icon in the address bar, set Location to Allow, then reload this page.";

function describeError(error: GeolocationPositionError): GeoState {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return {
        status: "denied",
        coords: null,
        message: `${PERMISSION_MESSAGE} ${environmentHint() ?? RESET_HINT}`,
      };
    case error.POSITION_UNAVAILABLE:
      return {
        status: "unavailable",
        coords: null,
        message: `Your GPS signal is unavailable right now. Move somewhere with a clearer view of the sky.${environmentHint() ? ` ${environmentHint()}` : ""}`,
      };
    case error.TIMEOUT:
      return {
        status: "timeout",
        coords: null,
        message: `Getting your location timed out. Please try again.${environmentHint() ? ` ${environmentHint()}` : ""}`,
      };
    default:
      return {
        status: "error",
        coords: null,
        message: "We could not read your location. Please try again.",
      };
  }
}

const UNSUPPORTED_STATE: GeoState = {
  status: "unavailable",
  coords: null,
  message: "This device or browser does not support location services.",
};

/**
 * Never assume permission exists: every failure mode gets an explicit state and
 * a plain-language message the UI can show.
 */
export function useGeolocation({
  watch = false,
  auto = true,
}: { watch?: boolean; auto?: boolean } = {}) {
  const [state, setState] = useState<GeoState>(
    HAS_GEOLOCATION
      ? { status: auto ? "locating" : "idle", coords: null, message: null }
      : UNSUPPORTED_STATE,
  );
  const watchIdRef = useRef<number | null>(null);
  const [permission, setPermission] = useState<GeoPermission>("unknown");

  /**
   * Ask the browser what it currently thinks about this origin.
   *
   * A refusal is *sticky*: once someone clicks Block, accepting again does
   * nothing until the permission is reset from the address bar. Reading the real
   * state lets the UI say so, instead of blaming a weak GPS signal for a
   * decision the browser already made.
   */
  useEffect(() => {
    const permissions = navigator.permissions;
    if (!permissions?.query) return;
    let cancelled = false;
    const read = (result: PermissionStatus) => {
      if (cancelled) return;
      setPermission(
        result.state === "granted" || result.state === "denied" || result.state === "prompt"
          ? result.state
          : "unknown",
      );
    };
    void permissions
      .query({ name: "geolocation" })
      .then((status) => {
        if (cancelled) return;
        read(status);
        // Permission can change in another tab or from the address bar while the
        // app is open, so keep listening rather than reading once.
        status.onchange = () => read(status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /**
 * Starts one fix and resolves with it.
 *
 * `maximumAge: 0` forces a genuinely fresh reading. The browser will otherwise
 * replay a cached fix up to a quarter of a minute old, which seeded the pickup
 * pin from where the user was *before* they opened the app — the first thing
 * they see is wrong, and correcting it is exactly the friction this hook is
 * meant to remove.
 *
 * Resolves to null on every failure rather than rejecting: a caller asking for
 * the user's position should be able to "if there's a fix, pin it" without a
 * try/catch, and the error itself is already in `state` for the UI to show.
 */
  const request = useCallback((): Promise<GeoCoords | null> => {
    if (!HAS_GEOLOCATION) return Promise.resolve(null);
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: normalizeHeading(pos.coords.heading),
          };
          setState({ status: "ready", coords, message: null });
          resolve(coords);
        },
        (error) => {
          setState(describeError(error));
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
      );
    });
  }, []);

  /** Manual retry entry point for buttons. Resolves with the fix, or null. */
  const locate = useCallback((): Promise<GeoCoords | null> => {
    if (!HAS_GEOLOCATION) {
      setState(UNSUPPORTED_STATE);
      return Promise.resolve(null);
    }
    setState((prev) => ({ ...prev, status: "locating" }));
    return request();
  }, [request]);

  /**
   * Ask on mount — unless the caller opted out.
   *
   * `auto: false` is what the shared commuter hook uses: a prompt fired while
   * the app is still loading is a prompt against a screen that has not asked
   * for anything yet, and in a browser it is dismissed far more often than it
   * is answered. The booking screens ask instead, from a tap, and a refusal
   * there is sticky either way.
   */
  useEffect(() => {
    if (!auto) return;
    void request();
  }, [auto, request]);

  useEffect(() => {
    if (!watch || !HAS_GEOLOCATION) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setState((prev) => ({
          status: "ready",
          coords: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: normalizeHeading(pos.coords.heading),
          },
          // Keep an existing error hidden once a fix arrives.
          message: prev.status === "ready" ? null : prev.message,
        }));
      },
      (error) => setState(describeError(error)),
      watchOptions(),
    );
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [watch]);

  return {
    ...state,
    locate,
    /** What the browser says about this origin right now. */
    permission,
    /**
     * True when location cannot work here for environmental reasons, so the UI
     * can say so up front rather than waiting for a silent failure.
     */
    blockedByEnvironment: environmentHint(),
  };
}
