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