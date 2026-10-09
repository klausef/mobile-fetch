/**
 * The map must not be able to go blank because one API key is wrong.
 *
 * The Leaflet renderer has no style document and no worker, so the two classes
 * of failure that used to follow from those — a key that loads a style but
 * never fires `load`, and a worker URL that a bundler invalidated — are gone.
 * What is still true, and still tested, is the *idea* behind them:
 *
 *   • The tiles are decided from configuration at build time
 *     (`getBasemap()`), and the activation is visible in code, not runtime:
 *     the keyless OpenStreetMap source is what a checkout with no key loads,
 *     so the app never opens on a blank rectangle just because somebody forgot
 *     to paste a token.
 *   • When the active tile host will not answer, the rider is told in words,
 *     and told that the map itself — pins, panning, the route line — still
 *     works underneath.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const view = readFileSync("src/components/map/MapView.tsx", "utf8");
const mapLib = readFileSync("src/lib/map-service.ts", "utf8");

describe("the keyless basemap is available as a recovery", () => {
  test("it is its own exported source, not a branch inside getBasemap", () => {
    // If this lived only inside `getBasemap`, a test or a diagnostic could not
    // reach it directly — that is the whole reason it is factored out.
    expect(mapLib).toContain("export const OSM_TILES: TileConfig");
  });

  test("the no-key path uses it rather than repeating the config", () => {
    expect(mapLib).toContain("hasMapTiler ? mapTilerTiles() : OSM_TILES");
  });

  test("it is real OpenStreetMap raster tiles, not an empty config", () => {
    // A fallback that renders nothing is worse than no fallback, because it
    // replaces one silent failure with another.
    expect(mapLib).toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
  });

  test("it carries its attribution, as the licence requires", () => {
    expect(mapLib).toMatch(/attribution: "© OpenStreetMap contributors"/);
  });
});

describe("the basemap is decided before the map is built", () => {
  test("MapView asks the service layer which tiles to load", () => {
    expect(view).toContain("const basemap = getBasemap();");
    expect(view).toContain("L.tileLayer(basemap.url");
  });

  test("the choice happens at construction, not after a failure", () => {
    // A tile layer handed a wrong URL fails visibly as tile errors; a style
    // handed a wrong key used to fail as silence. But the decision still has
    // to be made up front, because every tile request after it would be wasted
    // against a host that is not the one configured.
    const at = view.indexOf("const basemap = getBasemap();");
    const constructed = view.indexOf("L.map(container");
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(constructed);
  });
});

describe("a tile host that will not answer is caught", () => {
  test("tile errors surface the degraded state", () => {
    expect(view).toContain('map.on("tileerror", noticeDegraded)');
  });

  test("a silent failure is caught by a watchdog too", () => {
    // Not every failure emits `tileerror` — an unreachable host with no
    // responses at all is silent — so the timeout is the guarantee and the
    // event is the fast path.
    expect(view).toContain("const TILE_LOAD_TIMEOUT_MS");
    expect(view).toContain("window.setTimeout(() => {");
  });

  test("the failure is noticed at most once", () => {
    // Without this, a device with no network fires a tileerror per visible
    // tile, and the notice would churn on every pan.
    expect(view).toContain("let degradedNoticed = false;");
    expect(view).toContain("if (degradedNoticed) return;");
    expect(view).toContain("degradedNoticed = true;");
  });

  test("the watchdog and its listener are cleared on unmount too", () => {
    // A timer that outlives its map fires against a destroyed instance and,
    // on a fast re-mount, races the new one into flagging a healthy basemap.
    const cleanup = view.slice(view.indexOf("return () => {", view.indexOf("tileWatchdog")));
    expect(cleanup.slice(0, 400)).toContain("window.clearTimeout(tileWatchdog)");
    expect(cleanup.slice(0, 400)).toContain('map.off("tileerror", noticeDegraded)');
  });
});

describe("the rider is told, because silence reads as broken", () => {
  test("the degraded state is surfaced", () => {
    expect(view).toContain("const [degraded, setDegraded] = useState(false);");
    expect(view).toContain("setDegraded(true)");
  });

  test("and shown as words, not a colour change", () => {
    expect(view).toContain("No map tiles yet.");
  });

  test("the map keeps working underneath it", () => {
    // A degraded basemap is a missing layer, not an error screen: pins, the
    // route line and picking must all still function.
    expect(view).not.toContain("if (degraded) return null");
  });
});

/**
 * Leaflet needs no WebGL context and no bundler-owned worker, so the two
 * issues that made the maplibre version fragile on this front are gone. These
 * contracts keep the guarantee the old tests were guarding: nothing in the
 * map's own setup can silently fail in a way the rider cannot see.
 */
describe("the renderer carries no hidden runtime requirements", () => {
  test("it imports Leaflet's stylesheet, so the map is actually styled", () => {
    // Leaflet positions its tiles with CSS from its own stylesheet; without
    // the import the map draws tiles stacked vertically.
    expect(view).toContain('import "leaflet/dist/leaflet.css";');
  });

  test("there is no WebGL requirement left in the file", () => {
    // The old renderer threw from its constructor without a GPU; this one
    // must not depend on one. Checked against code and imports rather than
    // prose — a historical note about the renderer this replaced is free to
    // mention it, a dependency is not.
    expect(view).not.toMatch(/from ["']maplibre-gl/);
    expect(view).not.toMatch(/\bnew (MapLibre\w*)\(/);
    expect(view.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).not.toContain("WebGL");
    expect(view).not.toContain("setWorkerUrl");
  });

  test("the container is observed, so a resizing map keeps up", () => {
    // Leaflet measures once at construction. The sheet-over-map layout means
    // the container does change size, and a stale internal size draws tiles
    // cut off or offset.
    expect(view).toContain("new ResizeObserver(() => map.invalidateSize())");
  });
});

/**
 * The layer's own recovery options, and the two places the rider is told what
 * the map is doing. All three are invisible in a screenshot until something
 * goes wrong, which is exactly when they need to already be there.
 */
describe("a failed tile degrades the picture, not the map", () => {
  test("a rejected tile paints a placeholder rather than a hole", () => {
    // Without this a 404 leaves a gap that reads as a rendering bug. The
    // assertion is on the option, not on the exact artwork: the placeholder is
    // free to change, its presence is not.
    expect(view).toContain("errorTileUrl:");
  });

  test("the update flags defer work mid-gesture", () => {
    // A fast pinch otherwise mounts tiles that are replaced a frame later —
    // the churn that used to leave the viewport briefly empty.
    expect(view).toContain("updateWhenIdle: true");
    expect(view).toContain("updateWhenZooming: true");
  });

  test("the options stay typed rather than cast past the checker", () => {
    // All three exist on TileLayerOptions/GridLayerOptions. An `as any` here
    // would hide a genuine typo in one of them for the sake of quiet, which is
    // the opposite of what this file is for.
    const layer = view.slice(
      view.indexOf("L.tileLayer(basemap.url"),
      view.indexOf(".addTo(map);", view.indexOf("L.tileLayer(basemap.url")),
    );
    expect(layer).toContain("maxZoom: basemap.maxZoom");
    expect(layer).toContain("attribution: basemap.attribution");
    expect(layer).not.toContain("as any");
  });
});

describe("the map says which basemap it is on", () => {
  test("the attribution chip names the active source", () => {
    // The fastest way to tell a credential problem from a reachability problem
    // is knowing whether this build is asking MapTiler or OpenStreetMap.
    expect(view).toContain(
      'Tiles: {getBasemap().id === "maptiler" ? "MapTiler" : "OpenStreetMap"}',
    );
  });

  test("it also says whether a key is configured", () => {
    // A build on MapTiler tiles with no key is a different bug from one with an
    // expired key, and the rider cannot tell them apart without this.
    expect(view).toContain('{hasMapTiler ? " · key: yes" : ""}');
  });
});

describe("the degraded notice explains the failure it actually hit", () => {
  /** The degraded card, from its heading to the conditional that closes it. */
  function notice(): string {
    const start = view.indexOf("No map tiles yet.");
    expect(start).toBeGreaterThan(-1);
    // Anchored forward, not on `MAP_ATTRIBUTION`: that name first appears in
    // the import block at the top of the file, so an unanchored search lands
    // above the card and the slice comes back empty.
    return view.slice(start, view.indexOf(") : null}", start));
  }

  test("a MapTiler build is told the key may be the problem", () => {
    // The generic "check the connection" wording sends someone with an expired
    // key looking at their wifi.
    expect(notice()).toContain('getBasemap().id === "maptiler"');
    expect(notice()).toContain("invalid or expired");
  });

  test("and the keyless path keeps its connection wording", () => {
    expect(notice()).toContain("check the connection");
    expect(notice()).toContain("Pins are still live");
  });
});
