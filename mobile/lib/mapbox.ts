/**
 * Mapbox setup for the mobile app.
 *
 * One place where the Mapbox React Native SDK is configured, so the rest of the
 * app just renders maps rather than fighting over which token to use or whether
 * `setAccessToken` has been called yet.
 *
 * The token is read from Expo app config (`expo.extra.mapboxAccessToken`), which
 * is a committed file — so treat this value as public. That is fine for what it
 * is: a `pk.` access token is designed to ship in a client, and it is scoped by
 * the URL restrictions on the Mapbox account, not by secrecy. A secret `sk.`
 * token must never be put here; those belong on the server.
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

