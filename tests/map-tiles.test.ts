/**
 * Which tiles cover the viewport.
 *
 * The three things that go wrong here are invisible on screen: a key that
 * disagrees with the URL, a buffer that fails to keep neighbours mounted, and a
 * wrap that produces a negative tile index. All three produce a map that looks
 * subtly broken rather than obviously broken, which is exactly what a test
 * should be standing in front of.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import { TILE_SIZE, lngToWorldX, latToWorldY } from "../src/lib/map/projection.ts";
import { computeTileWindow } from "../src/lib/map/tiles.ts";

const ZOOM = 14;
const TILE_COUNT = 2 ** ZOOM;

/** A viewport centred on a point, as MapView computes it. */
function windowAt(
  lat: number,
  lng: number,
  width = 600,
  height = 600,
  zoom = ZOOM,
) {
  const tileCount = 2 ** zoom;
  const originLeft = lngToWorldX(lng, zoom) - width / 2;
  const originTop = latToWorldY(lat, zoom) - height / 2;
  return computeTileWindow(originLeft, originTop, width, height, zoom, tileCount);
}

/** Malaybalay, roughly. */
const MALAYBALAY = { lat: 8.15, lng: 125.07 };

test("a normal viewport is covered", () => {
  const tiles = windowAt(MALAYBALAY.lat, MALAYBALAY.lng);
  expect(tiles.length).toBeGreaterThan(0);
});

test("every tile index is inside the tile grid", () => {
  // A negative column means a 404 from the tile server, which is a hole in the
  // map rather than an error anyone would notice.
  for (const tile of windowAt(MALAYBALAY.lat, MALAYBALAY.lng)) {
    expect(tile.tileX).toBeGreaterThanOrEqual(0);
    expect(tile.tileX).toBeLessThan(TILE_COUNT);
    expect(tile.tileY).toBeGreaterThanOrEqual(0);
    expect(tile.tileY).toBeLessThan(TILE_COUNT);
  }
});

test("the buffer keeps the neighbouring ring mounted", () => {
  const buffered = windowAt(MALAYBALAY.lat, MALAYBALAY.lng);
  const unbuffered = windowAt(MALAYBALAY.lat, MALAYBALAY.lng, 600, 600, ZOOM);
  const strict = computeTileWindow(
    lngToWorldX(MALAYBALAY.lng, ZOOM) - 300,
    latToWorldY(MALAYBALAY.lat, ZOOM) - 300,
    600,
    600,
    ZOOM,
    TILE_COUNT,
    0,
  );
  // Without the ring, a recentre unmounts the visible tiles and refetches them.
  expect(buffered.length).toBeGreaterThan(strict.length);
  expect(unbuffered.length).toBe(buffered.length);
});

test("the key matches the tile the URL actually requests", () => {
  // Regression: the key used the unwrapped column while the URL used the
  // wrapped one, so React treated a tile it was already showing as new and
  // refetched it on every pan.
  for (const tile of windowAt(MALAYBALAY.lat, MALAYBALAY.lng)) {
    expect(tile.key).toBe(`${ZOOM}/${tile.tileX}/${tile.tileY}`);
  }
});

test("keys are unique within a window", () => {
  const tiles = windowAt(MALAYBALAY.lat, MALAYBALAY.lng);
  expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
});

test("columns wrap past the antimeridian instead of going negative", () => {
  // Near 180°E the viewport runs off the right edge of the world.
  const tiles = windowAt(0, 179.999);
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) {
    expect(tile.tileX).toBeGreaterThanOrEqual(0);
    expect(tile.tileX).toBeLessThan(TILE_COUNT);
  }
});

test("wrapping keeps pixel offsets growing past the edge of the world", () => {
  // The image belongs at the offset it was computed for, not snapped back to
  // zero — otherwise panning across the antimeridian teleports the map.
  const tiles = windowAt(0, 179.999);
  const worldWidth = TILE_SIZE * TILE_COUNT;
  expect(Math.max(...tiles.map((t) => t.x))).toBeGreaterThan(worldWidth - TILE_SIZE);
});

test("rows are clamped instead of wrapping", () => {
  // Mercator ends at the poles; there is no map above or below the world.
  const north = windowAt(85, 0);
  const south = windowAt(-85, 0);
  for (const tile of [...north, ...south]) {
    expect(tile.tileY).toBeGreaterThanOrEqual(0);
    expect(tile.tileY).toBeLessThan(TILE_COUNT);
  }
});

test("a viewport with no size draws nothing", () => {
  // Before the first ResizeObserver callback, size is 0x0. Returning tiles here
  // would render a stray tile layer at 0,0.
  expect(windowAt(MALAYBALAY.lat, MALAYBALAY.lng, 0, 0)).toEqual([]);
  expect(windowAt(MALAYBALAY.lat, MALAYBALAY.lng, 600, 0)).toEqual([]);
});

test("a viewport smaller than one tile still gets the tile covering it", () => {
  const tiles = windowAt(MALAYBALAY.lat, MALAYBALAY.lng, 100, 100);
  expect(tiles.length).toBeGreaterThan(0);
  for (const tile of tiles) {
    expect(Number.isFinite(tile.x)).toBe(true);
    expect(Number.isFinite(tile.y)).toBe(true);
  }
});

test("pixel offsets are whole tiles", () => {
  // Offsets feed a CSS transform; fractional values smear the layer.
  for (const tile of windowAt(MALAYBALAY.lat, MALAYBALAY.lng)) {
    expect(tile.x % TILE_SIZE).toBe(0);
    expect(tile.y % TILE_SIZE).toBe(0);
  }
});

test("different zooms produce different keys", () => {
  // Keys are reused across zoom changes otherwise, and React would keep showing
  // the old zoom level's tiles.
  const at14 = windowAt(MALAYBALAY.lat, MALAYBALAY.lng, 600, 600, 14);
  const at15 = windowAt(MALAYBALAY.lat, MALAYBALAY.lng, 600, 600, 15);
  const overlap = at14.filter((a) => at15.some((b) => b.key === a.key));
  expect(overlap).toEqual([]);
});