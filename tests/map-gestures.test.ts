/**
 * Map gesture contracts.
 *
 * These are assertions about the *source* rather than about behaviour, because
 * the behaviour lives inside a maplibre-gl event handler that cannot be
 * exercised without a WebGL context. That is not an excuse to skip them: both
 * of these were real defects, both were invisible in a screenshot, and both
 * would come straight back the next time somebody tidied the pointer handling.
 *
 *   • A tap used to fire the long-press timer half a second later, so *every*
 *     tap on the map eventually opened the "confirm this pin" card.
 *   • The zoom and recentre controls sit inside the map container, so holding
 *     "+" to zoom twice dropped a pin in whatever direction the map pointed.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";

import { normalizeHeading } from "../src/hooks/use-geolocation.ts";

const mapView = readFileSync("src/components/map/MapView.tsx", "utf8");

/** The block that registers and removes the container's press listeners. */
function pressRegistration(): string {
  const start = mapView.indexOf('container.addEventListener("pointerdown", handlePressStart');
  const end = mapView.indexOf('container.addEventListener("pointerdown", handleDown');
  expect(start).toBeGreaterThan(-1);
  return mapView.slice(start, end);
}

/** The handler that decides whether a press is allowed to start at all. */
function pressStarter(): string {
  const start = mapView.indexOf("const handlePressStart");
  const end = mapView.indexOf("const handlePressMove");
  expect(start).toBeGreaterThan(-1);
  return mapView.slice(start, end);
}

test("releasing the finger cancels a press", () => {
  // Without `pointerup` the timer outlives the tap, and every short tap opens
  // the long-press card half a second later.
  const registration = pressRegistration();
  expect(registration).toContain(
    'container.addEventListener("pointerup", cancelPress',
  );
  // A finger that slides off the map without lifting never fires `pointerup`.
  expect(registration).toContain(
    'container.addEventListener("pointerleave", cancelPress',
  );
});

test("the press listeners are removed on unmount, press handlers included", () => {
  // An unregistered `pointerup` listener keeps a closed-over map alive and
  // fires against a removed canvas.
  const cleanup = mapView.slice(mapView.indexOf("return () => {", mapView.indexOf("handlePressMove")));
  expect(cleanup).toContain(
    'container.removeEventListener("pointerup", cancelPress',
  );
  expect(cleanup).toContain(
    'container.removeEventListener("pointerleave", cancelPress',
  );
});

test("a press that starts on a control is not a press on the map", () => {
  // Zoom and recentre are children of the map container, so without this guard
  // holding "+" drops a pin where the map was pointing when the timer fired.
  expect(pressStarter()).toContain('closest("button")');
});

test("recentre goes where the caller says, not where the map is looking", () => {
  // `followTarget` is the rider the map follows; `recenterTarget` is the
  // commuter's own position. Conflating them makes the recentre button on a
  // booking map do nothing at all, or start following a marker.
  expect(mapView).toContain("recenterTarget?: LatLng | null;");
  expect(mapView).toContain(
    "const target = recenterTarget ?? followTarget ?? center;",
  );
});

test("a draggable pin is offered, and takes the caller's drag handlers", () => {
  expect(mapView).toContain("dragPoint?: LatLng | null;");
  expect(mapView).toContain("onDragPointChange?: (point: LatLng) => void;");
  expect(mapView).toContain("onDragPointEnd?: (point: LatLng) => void;");
  expect(mapView).toContain("new Marker({ element, draggable: true");
});

test("each leg of the route is routed on its own", () => {
  // A tracking screen has two legs — rider to pickup, pickup to destination —
  // and routing them as one request would draw a road that ignores the pickup
  // entirely, which is not the trip anybody is taking.
  expect(mapView).toContain(
    "segments.map(([from, to]) => fetchRoute(from, to))",
  );
});

test("the rider marker only turns when there is a bearing to turn to", () => {
  // The Geolocation API reports no heading on many devices. Rotating to a
  // default angle in that case would show the commuter a car pointing the wrong
  // way for the whole ride.
  expect(mapView).toContain(
    'typeof marker.heading === "number" && Number.isFinite(marker.heading)',
  );
  expect(mapView).toContain("heading === null");
  expect(mapView).toContain("transform:rotate(${heading}deg)");
});

test("a bearing of \"unknown\" is normalised to no bearing", () => {
  // Three ways the browser says it does not know which way you are facing, and
  // all three must collapse to the same answer or the car spins at random.
  expect(normalizeHeading(undefined)).toBeNull();
  expect(normalizeHeading(null)).toBeNull();
  expect(normalizeHeading(NaN)).toBeNull();
  expect(normalizeHeading("90")).toBeNull();
  expect(normalizeHeading(0)).toBe(0);
  expect(normalizeHeading(90)).toBe(90);
  // Out-of-range readings wrap rather than rotating by 400 degrees.
  expect(normalizeHeading(360)).toBe(0);
  expect(normalizeHeading(450)).toBe(90);
  expect(normalizeHeading(-90)).toBe(270);
});