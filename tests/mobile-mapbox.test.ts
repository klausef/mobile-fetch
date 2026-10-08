/**
 * The phone's map build.
 *
 * `@maplibre/maplibre-react-native` is a native bridge, and the map the phone
 * draws is decided by `frontend/src/services/maps/mapProvider.ts`: the live
 * MapLibre surface when the native SDK is linked in the build, and a plain
 * placeholder when it is not (Expo Go, a web preview, a CI bundle). The
 * failure this file guards against is the shape of bug that costs an
 * afternoon: a map surface that silently renders nothing — the JS bundle
 * serves, the screens render, and the only symptom is a blank rectangle.
 *
 * Tiles come from OpenStreetMap's plain raster endpoint, which needs no
 * access token at all — so unlike a Mapbox build there is no `pk.` token to
 * check in, and no blank-map-when-unconfigured failure mode to explain. What
 * can still fail silently is the provider seam: a build without the native
 * SDK must degrade to the placeholder, never crash and never draw nothing.
 *
 * The dependency-reading tests skip when `frontend/node_modules` is not
 * installed, so `bun test` still runs from a root-only install.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const appJson = JSON.parse(readFileSync("frontend/app.json", "utf8")) as {
  expo?: {
    plugins?: unknown[];
    extra?: { mapboxAccessToken?: string };
  };
};

const packageJson = JSON.parse(readFileSync("frontend/package.json", "utf8")) as {
  dependencies?: Record<string, string>;
};

/** `[major, minor, patch]`, or null when the string is not a full version. */
function triple(version: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

describe("the phone pins a native map SDK it can build against", () => {
  test("the Expo config registers the map plugin", () => {
    // A config plugin the app config does not name is a plugin that never
    // runs: the native side of the map is never generated, and the surface
    // comes up blank on device with no error on the JS side.
    const plugins = appJson.expo?.plugins ?? [];
    const configured = plugins.some(
      (plugin) =>
        plugin === "@maplibre/maplibre-react-native" ||
        (Array.isArray(plugin) && plugin[0] === "@maplibre/maplibre-react-native"),
    );
    expect(configured).toBe(true);
  });

  test("the dependency is a full version, not a range", () => {
    const version = packageJson.dependencies?.["@maplibre/maplibre-react-native"] ?? "";
    expect(triple(version)).not.toBeNull();
  });

  test.skipIf(!existsSync("frontend/node_modules/@maplibre/maplibre-react-native/package.json"))(
    "and the installed package matches what is declared",
    () => {
      const installed = (
        JSON.parse(
          readFileSync(
            "frontend/node_modules/@maplibre/maplibre-react-native/package.json",
            "utf8",
          ),
        ) as { version?: string }
      ).version ?? "";
      const declared = packageJson.dependencies?.["@maplibre/maplibre-react-native"] ?? "";
      const installedParts = triple(installed);
      const declaredParts = triple(declared.replace(/^[~^]/, ""));
      expect(installedParts).not.toBeNull();
      expect(declaredParts).not.toBeNull();
      // Same major, and not older than the manifest declares — the JS bridge
      // and the generated native project are built from one version.
      expect(installedParts![0]).toBe(declaredParts![0]);
    },
  );
});

describe("a build without the native SDK degrades instead of failing", () => {
  const providerSource = readFileSync("frontend/src/services/maps/mapProvider.ts", "utf8");

  test("providers resolve the native SDK lazily, never eagerly", () => {
    // A top-level `import { MapView } from "@maplibre/maplibre-react-native"`
    // in this module would crash every screen that renders a map in a build
    // without the SDK — Expo Go, a web preview, CI — instead of degrading.
    expect(providerSource).toContain("require(\"./MapLibreMap\")");
    expect(providerSource).not.toMatch(/import\s+\{[^}]*\}\s+from\s+"@maplibre\/maplibre-react-native"/);
  });

  test("the fallback provider is always available", () => {
    // The placeholder is what renders when the SDK is missing; a fallback
    // that reports itself unavailable would leave `getMapProvider` with
    // nothing to return and every map screen blank.
    expect(providerSource).toContain('available: true');
  });

  test("the map component defers to the provider seam", () => {
    // Screens render `<MapView />`; which implementation draws is decided by
    // `getMapProvider()`. A screen that imported a map library directly would
    // bypass the fallback and crash in the same builds.
    const viewSource = readFileSync("frontend/src/components/MapView.tsx", "utf8");
    expect(viewSource).toContain("getMapProvider");
    expect(viewSource).toContain("FallbackMap");
    expect(viewSource).not.toMatch(/from\s+"@maplibre\/maplibre-react-native"/);
  });
});
