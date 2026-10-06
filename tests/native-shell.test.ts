/**
 * The native shell contract.
 *
 * capacitor.config.ts is a small file with one setting that fails silently and
 * catastrophically: if `server.androidScheme` is not "https", the Android
 * WebView serves the app from `capacitor://`, which is not a secure context,
 * so `navigator.geolocation` is simply undefined. Nothing crashes — the map
 * renders, the GPS button just never returns a fix, and it looks like a phone
 * bug rather than a config bug. Nothing else in the suite would notice.
 *
 * These assertions are cheap and pin the values that the Android project
 * (package name, webDir) and the runtime (secure context) both depend on.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import config from "../capacitor.config.ts";

test("the WebView is served over https so geolocation is available", () => {
  // navigator.geolocation is undefined on capacitor://, which silently kills
  // the GPS pickup flow and the rider's live location.
  expect(config.server?.androidScheme).toBe("https");
});

test("page zooming is off so it cannot fight the map's own pinch gesture", () => {
  expect(config.zoomEnabled).toBe(false);
});

test("the native build loads the same bundle the browser gets", () => {
  expect(config.webDir).toBe("dist");
});

test("appId matches the Android applicationId and namespace", () => {
  // A mismatch here still builds, but the installed package, the custom URL
  // scheme and the generated R class all silently disagree.
  expect(config.appId).toBe("ph.fetch.app");
});

test("the WebView background matches the dark splash plate", () => {
  // A mismatch shows as a white flash between the splash tearing down and
  // React mounting. #0A0A0A is android/.../values/colors.xml splash_background.
  expect(config.backgroundColor).toBe("#0A0A0A");
  expect(config.android?.backgroundColor).toBe("#0A0A0A");
});

test("the app name is the brand, not the template name", () => {
  expect(config.appName).toBe("FETCH");
});
