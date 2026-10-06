/**
 * Which raster tiles cover the viewport.
 *
 * Dependency-free so the window can be asserted in tests. `MapView` only turns
 * these into <img> elements; the arithmetic — world-wrap, the preloading ring,
 * the vertical clamp — is here because all three are easy to get subtly wrong
 * and hard to eyeball.
 *
 * See @lib/map/projection for the world-pixel maths this builds on.
 */
import { TILE_SIZE } from "./projection";

/** One tile to draw, in viewport pixel offsets and provider tile indices. */
export type TileRef = {
  /**
   * React key. Must be derived from the *wrapped* indices, because that is what
   * the URL contains: keying on unwrapped indices makes two references to the
   * same image look like different tiles, and React refetches the one it is
   * already showing.
   */
  key: string;
  /** Pixel offset within the tile layer. */
  x: number;
  y: number;
  /** Tile column to request, wrapped into [0, tileCount). */
  tileX: number;
  /** Tile row to request, always within [0, tileCount). */
  tileY: number;
};

/**
 * Tiles drawn one ring beyond the viewport on each side.
 *
 * Pinning, using GPS, or picking a search result all recentre the map, which
 * shifts the visible window. Without the ring, every one of those shifts
 * unmounts the tiles the user was looking at and refetches them, so the map
 * blanks on each interaction and looks like it never finishes loading.
 */
export const TILE_BUFFER = 1;

/**
 * The tiles covering `width` x `height` pixels from the given world origin.
 *
 * Horizontally the world wraps, so columns are taken modulo `tileCount` while
 * their pixel offsets keep growing — that is what lets a panned map run past the
 * antimeridian instead of falling off the edge.
 *
 * Vertically it does not wrap: Mercator runs out at the poles, so rows outside
 * [0, tileCount) are simply not drawn and the void is left to show through.
 */
export function computeTileWindow(
  originLeft: number,
  originTop: number,
  width: number,
  height: number,
  zoom: number,
  tileCount: number,
  buffer: number = TILE_BUFFER,
): TileRef[] {
  // Nothing to cover yet — before the first resize, or a hidden container.
  if (width <= 0 || height <= 0) return [];

  const minTx = Math.floor(originLeft / TILE_SIZE) - buffer;
  const maxTx = Math.floor((originLeft + width) / TILE_SIZE) + buffer;
  const minTy = Math.max(0, Math.floor(originTop / TILE_SIZE) - buffer);
  const maxTy = Math.min(
    tileCount - 1,
    Math.floor((originTop + height) / TILE_SIZE) + buffer,
  );

  const out: TileRef[] = [];
  for (let ty = minTy; ty <= maxTy; ty += 1) {
    for (let tx = minTx; tx <= maxTx; tx += 1) {
      const wrappedX = ((tx % tileCount) + tileCount) % tileCount;
      out.push({
        key: `${zoom}/${wrappedX}/${ty}`,
        x: tx * TILE_SIZE,
        y: ty * TILE_SIZE,
        tileX: wrappedX,
        tileY: ty,
      });
    }
  }
  return out;
}