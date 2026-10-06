import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Native shell configuration.
 *
 * The web build is the same bundle the browser gets; these are the parts that
 * only matter once it is running inside the Android WebView:
 *
 * - `androidScheme: "https"` is not cosmetic. Geolocation is a secure-context
 *   API, so on the default `capacitor://` scheme `navigator.geolocation` is
 *   undefined and the booking map can never get a fix.
 * - `backgroundColor` matches the splash plate so there is no white flash
 *   between the splash tearing down and React mounting.
 * - `zoomEnabled: false` keeps the WebView from pinch-zooming the whole
 *   document; the booking map implements its own pinch gesture, and two of
 *   them fighting over the same touch is unusable.
 *
 * The splash plate itself is themed in android/app/src/main/res/values/styles.xml
 * via the core-splashscreen theme, so no JS splash plugin is needed.
 */
const config: CapacitorConfig = {
  appId: "ph.fetch.app",
  appName: "FETCH",
  webDir: "dist",
  backgroundColor: "#0A0A0A",
  zoomEnabled: false,
  android: {
    backgroundColor: "#0A0A0A",
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;
