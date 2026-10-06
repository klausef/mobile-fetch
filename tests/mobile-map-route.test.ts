/**
 * Mobile Mapbox route geometry helpers — regression tests.
 *
 * The first Mapbox surface in FETCH is built on two pure helpers:
 *   • `straightLine(from, to)` — the route line the map draws before real routing
 *     is wired.
 *   • `geojsonToLatLngs(coordinates)` — the bridge between Mapbox Native's GeoJSON
 *     `[longitude, latitude]` order and the app's `{ lat, lng }` shape.
 *
 * These are the parts that are easiest to get wrong in a map migration: a swapped
 * axis silently routes to the wrong hemisphere and still "looks" like a line. So we
 * assert the exact shape here rather than trusting a typecheck-only pass.
 */

import { test, expect } from "bun:test";
import { geojsonToLatLngs, straightLine, type RouteCoordinate } from "../mobile/lib/mapbox-route";

test("straightLine returns GeoJSON-ordered coordinate pairs", () => {
  const from = { lat: 8.1550421, lng: 125.1305726 };
  const to = { lat: 7.9111239, lng: 125.0933669 };

  const line = straightLine(from, to);

  expect(line).toHaveLength(2);
  expect(line[0]).toEqual([from.lng, from.lat] as RouteCoordinate);
  expect(line[1]).toEqual([to.lng, to.lat] as RouteCoordinate);
});

test("geojsonToLatLngs converts GeoJSON [lng, lat] into { lat, lng }", () => {
  const coordinates: RouteCoordinate[] = [
    [125.1305726, 8.1550421],
    [125.0933669, 7.9111239],
  ];

  const points = geojsonToLatLngs(coordinates);

  expect(points).toHaveLength(2);
  expect(points[0]).toEqual({ lat: 8.1550421, lng: 125.1305726 });
  expect(points[1]).toEqual({ lat: 7.9111239, lng: 125.0933669 });
});

test("geojsonToLatLngs rejects a degenerate coordinate shape", () => {
  // A real Mapbox geometry always has both lng and lat.
  // This is the shape we expect to handle, not a single number or a 3-d point.
  const coordinates: RouteCoordinate[] = [
    [125.1305726, 8.1550421],
  ];

  const points = geojsonToLatLngs(coordinates);

  expect(points).toHaveLength(1);
  expect(points[0].lng).toBe(125.1305726);
  expect(points[0].lat).toBe(8.1550421);
});
