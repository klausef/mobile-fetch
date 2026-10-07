/**
 * The phone's Mapbox build.
 *
 * `@rnmapbox/maps` is a Kotlin/Swift bridge written against one version of
 * Mapbox's native map SDK, and `mobile/app.json` pins that version explicitly
 * for the Android and iOS projects Expo generates. The library's own install
 * guide is blunt about the mistake that is easy to make here and hard to see:
 * pinning an *earlier* version than the library expects "will likely result in
 * a build error" — and a native build error is invisible from the JS side. The
 * Metro server still serves, the screens still render, so the only thing on
 * screen is the symptom: a Mapbox surface that never draws. That is the shape
 * of bug that costs an afternoon and ends with somebody rewriting working
 * JavaScript.
 *
 * The second half of the same failure: the public `pk.` token reaches the app
 * through `expo.extra`, which on Android is the `app.config` asset compiled
 * into the APK. So the token is a *build* input, not a runtime one, and a build
 * without it renders an empty rectangle rather than an error. `MapboxMap` has
 * to say which of the two it is looking at.
 *
 * The two number-reading tests skip when `mobile/node_modules` is not
 * installed, so `bun test` still runs from a root-only install; when the
 * library is present they assert at full strength.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const appJson = JSON.parse(readFileSync("mobile/app.json", "utf8")) as {
  expo?: {
    plugins?: unknown[];
    extra?: { mapboxAccessToken?: string };
  };
};

/** Options of the `@rnmapbox/maps` plugin entry in `app.json`, or null. */
const pluginOptions = (() => {
  const entry = (appJson.expo?.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === "@rnmapbox/maps",
  );
  return Array.isArray(entry)
    ? (entry[1] as { RNMapboxMapsVersion?: string } | undefined)
    : undefined;
})();

const pinned = pluginOptions?.RNMapboxMapsVersion ?? "";

/** The version the installed library is written against, from its manifest. */
const libraryManifest = "mobile/node_modules/@rnmapbox/maps/package.json";
const installed = existsSync(libraryManifest);
const expected = installed
  ? ((JSON.parse(readFileSync(libraryManifest, "utf8")) as {
      mapbox?: { android?: string };
    }).mapbox?.android ?? "")
  : "";

/** `[major, minor, patch]`, or null when the string is not a full version. */
function triple(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function compare(a: number[], b: number[]): number {
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

describe("the phone pins a Mapbox native SDK it can build against", () => {
  test("the plugin is configured with a full version", () => {
    // A range (`^11`, `~> 11.23`) would resolve to whatever the repository
    // happens to hold and take the JS bridge with it; a full triple is what the
    // Gradle property and the Podfile both consume.
    expect(triple(pinned)).not.toBeNull();
  });

  test.skipIf(!installed)(
    "and it is not older than the library's own expectation",
    () => {
      const expectedParts = triple(expected);
      const pinnedParts = triple(pinned);
      expect(expectedParts).not.toBeNull();
      expect(pinnedParts).not.toBeNull();
      expect(compare(pinnedParts!, expectedParts!)).toBeGreaterThanOrEqual(0);
    },
  );

  test.skipIf(!existsSync("mobile/android/gradle.properties"))(
    "the generated Android project agrees with it",
    () => {
      // `expo prebuild` without `--clean` rewrites this property only when the
      // plugin is given a version, so a build can otherwise keep using the pin
      // that was there before — which is exactly how a fixed `app.json` still
      // produces a Mapbox surface that does not draw.
      const gradle = readFileSync("mobile/android/gradle.properties", "utf8");
      const line = /^expoRNMapboxMapsVersion=(.*)$/m.exec(gradle)?.[1]?.trim();
      expect(line).toBe(pinned);
    },
  );
});

describe("a build with no Mapbox token says so", () => {
  const source = readFileSync("mobile/lib/mapbox-components.tsx", "utf8");

  test("the map surface carries a public token to draw with", () => {
    // A `pk.` token, not an `sk.` one: the secret token is a server credential
    // and this value ships in every install.
    expect(appJson.expo?.extra?.mapboxAccessToken ?? "").toMatch(/^pk\./);
  });

  test("and an unconfigured build explains the blank instead of painting it", () => {
    // The alternative is what this replaced: `styleURL` silently undefined, a
    // mounted-but-styleless native view, and no way to tell an unconfigured
    // build apart from an app that is broken.
    expect(source).toContain("if (!hasMapboxToken())");
    expect(source).toContain("Map unavailable");
    expect(source).not.toContain("styleURL={hasMapboxToken()");
  });
});
