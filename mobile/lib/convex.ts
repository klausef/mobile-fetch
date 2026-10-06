import Constants from "expo-constants";
import { ConvexReactClient } from "convex/react";

/**
 * The one Convex client for the native app.
 *
 * The deployment URL comes from `app.json` → `expo.extra.convexUrl` so it ships
 * with the app the way `VITE_CONVEX_URL` ships with the web bundle. It is the
 * same deployment, so a ride booked on the phone is a ride the web dashboard
 * can see and the rider can accept — there is no second backend.
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
