import Constants from "expo-constants";
import { ConvexReactClient } from "convex/react";

/**
 * The one Convex client for the native app.
 *
 * The deployment URL comes from `app.json` → `expo.extra.convexUrl`. That is not
 * a workaround for a missing `.env`: a native bundle cannot read a server-side
 * variable, so anything the phone needs has to be baked in at build time. Expo's
 * channel for that is app config, read back through `expo-constants`; Vite's is
 * `import.meta.env`, which it inlines into the web bundle the same way. Neither
 * one is secret — both end up as plaintext inside the artifact.
 *
 * The value **must match the web app's `VITE_CONVEX_URL`**. There is one backend:
 * a ride booked on the phone is a ride the web dashboard and the Capacitor
 * build can see, and a rider on either platform can accept it. Point this at a
 * different deployment and that stops being true, and the phone quietly fills a
 * second, empty database.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  convexUrl?: string;
};

export const CONVEX_URL = extra.convexUrl ?? "";

if (!CONVEX_URL) {
  throw new Error(
    "No Convex deployment configured. Set expo.extra.convexUrl in mobile/app.json.",
  );
}

export const convex = new ConvexReactClient(CONVEX_URL, {
  // Native apps background rather than unload; the browser's "you have unsent
  // messages" warning has no meaning here.
  unsavedChangesWarning: false,
});

/** The deployment's HTTP actions base, for authenticated fetches if ever needed. */
export const CONVEX_SITE_URL = CONVEX_URL.replace(
  ".convex.cloud",
  ".convex.site",
);
