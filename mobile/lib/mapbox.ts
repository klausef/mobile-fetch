/**
 * Mapbox setup for the mobile app.
 *
 * One place where the Mapbox React Native SDK is configured, so the rest of the
 * app just renders maps rather than fighting over which token to use or whether
 * `setAccessToken` has been called yet.
 *
 * The token is read from Expo app config (`expo.extra.mapboxAccessToken`) so the
 * repo does not contain the key in source the way a handwritten `.env` import
 * would. For now the app runs with the public token in the visible map only; the
 * matching secret is reserved for server-side geocoding/routing later.
 */

import Mapbox from "@rnmapbox/maps";

function readAppConfigAccessToken(): string {
  // The field is `expoConfig`; `expo-constants` has no `expoConfigObject`, and
  // its type ends in `Record<string, any>`, so reading the wrong name compiles
  // and then silently yields "" at runtime — which is a map with no style and a
  // route line that never draws. Fall back to an empty token only when the
  // config genuinely is not there.
  try {
    const constants = require("expo-constants").Constants as {
      expoConfig?: {
        extra?: { mapboxAccessToken?: string };
      };
    };
    const configObject = constants.expoConfig;
    if (!configObject?.extra) return "";
    return typeof configObject.extra.mapboxAccessToken === "string"
      ? configObject.extra.mapboxAccessToken.trim()
      : "";
  } catch {
    return "";
  }
}

let configured = false;

export function configureMapbox(): string {
  const token = readAppConfigAccessToken();
  if (token && !configured) {
    Mapbox.setAccessToken(token);
    configured = true;
  }
  return token;
}

/** True when the app was built with a Mapbox access token in app config. */
export function hasMapboxToken(): boolean {
  return readAppConfigAccessToken().length > 0;
}

