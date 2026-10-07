/**
 * The map must not be able to go blank because one API key is wrong.
 *
 * `mapStyle()` has always had a fallback, but it only fires at *build* time,
 * when the key is absent — `hasMapTiler` is a check on the string, not on
 * whether the string works. So the failure that actually happens in the field
 * was invisible to it: a key that is present but mistyped, expired, over quota,
 * or blocked by an origin rule the app did not anticipate. MapLibre fails to
 * load the style, `load` never fires, and the rider is looking at an empty
 * rectangle with nothing on screen to say whether the app is broken, the
 * network is down, or one token needs replacing.
 *
 * The keyless OpenStreetMap style is what makes recovery possible at all, so
 * these contracts cover the path that reaches it, the bound on it (one swap, or
 * an offline device retries forever), and the fact that it is not silent.
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const view = readFileSync("src/components/map/MapView.tsx", "utf8");
const mapLib = readFileSync("src/lib/map-service.ts", "utf8");

describe("the keyless style is available as a recovery", () => {
  test("it is its own exported style, not a branch inside mapStyle", () => {
    // If this lived only inside `mapStyle`, a runtime recovery could not reach
    // it — that is the whole reason it is factored out.
    expect(mapLib).toContain("export function fallbackMapStyle(): StyleSpecification");
  });

  test("the no-key path uses it rather than repeating the style", () => {
    expect(mapLib).toContain("return fallbackMapStyle();");
  });

  test("it is real OpenStreetMap raster tiles, not an empty style", () => {
    // A fallback that renders nothing is worse than no fallback, because it
    // replaces one silent failure with another.
    expect(mapLib).toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(mapLib).toContain('type: "raster"');
    expect(mapLib).toContain("maxzoom: OSM_PROVIDER.maxZoom");
  });

  test("it carries its attribution, as the licence requires", () => {
    expect(mapLib).toMatch(/attribution: OSM_PROVIDER\.attribution/);
  });
});

describe("a style that never arrives is caught", () => {
  test("the error path swaps to the keyless style", () => {
    expect(view).toContain("import {\n  MAP_ATTRIBUTION,\n  fallbackMapStyle,");
    expect(view).toContain("map.setStyle(fallbackMapStyle())");
  });

  test("a quiet failure is caught by a watchdog too", () => {
    // Not every failure emits an `error` event — a hung request and a blocked
    // origin can leave MapLibre silent — so the timeout is the guarantee and
    // the event is the fast path.
    expect(view).toContain("const STYLE_LOAD_TIMEOUT_MS");
    expect(view).toContain("map.on(\"error\", handleStyleError)");
    expect(view).toContain("if (!map.loaded()) fallBackToKeyless()");
  });

  test("the watchdog is cleared once the map loads", () => {
    expect(view).toContain("window.clearTimeout(styleWatchdog)");
  });

  test("it is cleared on unmount too", () => {
    // A timer that outlives its map fires against a destroyed instance and, on
    // a fast re-mount, races the new one into swapping a healthy style.
    const cleanup = view.slice(view.indexOf("return () => {", view.indexOf("styleWatchdog")));
    expect(cleanup.slice(0, 400)).toContain("window.clearTimeout(styleWatchdog)");
    expect(cleanup.slice(0, 400)).toContain('map.off("error", handleStyleError)');
  });
});

describe("the fallback happens at most once", () => {
  test("a flag guards the swap", () => {
    // Without this, a device with no network retries forever, each retry
    // failing, which is worse for the battery than the blank map was.
    expect(view).toContain("let onPrimaryStyle = true;");
    expect(view).toContain("if (!onPrimaryStyle) return;");
    expect(view).toContain("onPrimaryStyle = false;");
  });
});

describe("the rider is told, because silence reads as broken", () => {
  test("the degraded state is surfaced", () => {
    expect(view).toContain("const [degraded, setDegraded] = useState(false);");
    expect(view).toContain("setDegraded(true)");
  });

  test("and shown as words, not a colour change", () => {
    expect(view).toContain("Basic map — live directions and street detail are unavailable");
  });

  test("the map keeps working underneath it", () => {
    // A degraded style is a different basemap, not an error screen: pins, the
    // route line and picking must all still function.
    expect(view).not.toContain("if (degraded) return null");
  });
});

/**
 * The worker, not the style, is what fetches tiles.
 *
 * A worker that cannot load leaves the map looking half-alive: the style
 * builds, the controls draw, the canvas stays empty — and the console says only
 * "Worker failed to load. Check that the worker URL is correct." MapLibre finds
 * its worker relative to its own module (`new URL("./maplibre-gl-worker.mjs",
 * import.meta.url)`), which a bundler can silently invalidate: Vite's dev
 * pre-bundler rewrites the library into `node_modules/.vite/deps/` without
 * copying the worker beside it, so the derived URL 404s and the booking and
 * pin-dropping maps render as an empty rectangle. These contracts pin the
 * override that keeps the worker addressable.
 */
describe("the tile worker is pointed at a real URL", () => {
  test("the worker URL is handed to MapLibre explicitly", () => {
    expect(view).toContain("setWorkerUrl(maplibreWorkerUrl)");
  });

  test("it is a bundler-owned worker URL, not a hand-built path", () => {
    // `?worker&url` has the bundler emit the worker and return its URL, so the
    // address is right in dev and in a build alike; a hand-written path would
    // rot the moment node_modules moved.
    expect(view).toContain(
      'from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"',
    );
  });

  test("the override is registered before any map is built", () => {
    // MapLibre reads `WORKER_URL` when it spawns its worker pool, so a call
    // made after the first `new MapLibreMap(...)` would already be too late
    // for that map — and the first map is the one the commuter sees.
    expect(view.indexOf("setWorkerUrl(maplibreWorkerUrl)")).toBeGreaterThan(-1);
    expect(view.indexOf("setWorkerUrl(maplibreWorkerUrl)")).toBeLessThan(
      view.indexOf("new MapLibreMap("),
    );
  });
});

/**
 * The third way the map can go missing, and the one that used to be silent.
 *
 * The style fallback and the degraded notice both assume a map exists to
 * complain about. maplibre-gl v6 needs a WebGL2 context and throws from its
 * constructor when the browser will not hand one over — hardware acceleration
 * switched off, a driver on the blocklist, a virtual machine or a remote
 * renderer with no GPU. That throw lands inside a `useEffect`, so nothing
 * catches it, nothing renders, and the rider is left with the pin and the zoom
 * buttons over an empty rectangle: indistinguishable from a broken app. These
 * contracts keep the guard, and the words, in place.
 */
describe("a map that cannot start says so", () => {
  test("the constructor is the guarded thing", () => {
    expect(view).toContain("let map: MapLibreMap;");
    expect(view).toMatch(/try \{\s*map = new MapLibreMap\(\{/);
  });

  test("the failure is caught, and takes no further map with it", () => {
    // Everything after the constructor — the handlers, the watchdog, the
    // style — needs a map that exists. A catch that carried on would turn one
    // clear failure into a cascade of null dereferences.
    // Bounded by the line that needs a real map, so this cannot pass on a
    // `return` that belongs to some later handler.
    const at = view.indexOf("} catch (error) {");
    expect(at).toBeGreaterThan(-1);
    const caught = view.slice(at, view.indexOf("mapRef.current = map;", at));
    expect(caught).toContain("setUnavailable(true)");
    expect(caught).toContain("return;");
  });

  test("the rider is told what it needs, in words", () => {
    expect(view).toContain("This browser will not start the map.");
    expect(view).toContain("The map needs WebGL2");
  });

  test("the browser's own reason is carried through when it gave one", () => {
    // "Hardware acceleration is off" and "the GPU process would not boot" are
    // different problems with different fixes, and the browser already said
    // which one it was — maplibre hands the status message on to us.
    expect(view).toContain("setUnavailableReason(webglReason(error))");
    expect(view).toContain("function webglReason(error: unknown): string | null");
    expect(view).toContain("statusMessage");
  });

  test("controls that would do nothing are not drawn", () => {
    // Zoom and recentre are real DOM and stay mounted over a canvas that never
    // existed; leaving them up is the app pretending to work.
    expect(view).toContain("{interactive && !unavailable ? (");
    expect(view).toContain("const [unavailable, setUnavailable] = useState(false);");
  });
});