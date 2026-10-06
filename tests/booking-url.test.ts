/**
 * The handoff URL between the home hub and the booking form.
 *
 * The writer (hub) and the reader (booking form) are the two halves of one
 * format, and nothing at runtime holds them together — if the writer changes a
 * key and the reader keeps the old one, a commuter taps a destination and
 * arrives at an empty form with no error anywhere. These tests pin the format
 * and, more importantly, pin that a malformed link is dropped rather than
 * half-applied.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  bookUrl,
  readBookingPrefill,
  type PickedPlace,
} from "../src/lib/booking-url.ts";

const MARKET: PickedPlace = {
  lat: 8.1575,
  lng: 125.1278,
  label: "Malaybalay City Public Market",
};
const VALENCIA: PickedPlace = {
  lat: 7.9067,
  lng: 125.0944,
  label: "Valencia City Hall",
};

/** Pull the query string out of a built link, the way a router would. */
function paramsOf(url: string) {
  return new URLSearchParams(url.slice(url.indexOf("?") + 1));
}

test("a bare service link carries nothing but the service", () => {
  expect(bookUrl("ride")).toBe("/book?type=ride");
  expect(readBookingPrefill(paramsOf("/book?type=ride"))).toEqual({
    destination: null,
    pickup: null,
  });
});

test("a chosen destination survives the trip to the booking form", () => {
  const prefill = readBookingPrefill(paramsOf(bookUrl("pabili", MARKET)));
  expect(prefill.destination).toEqual({
    lat: MARKET.lat,
    lng: MARKET.lng,
    address: MARKET.label,
  });
  expect(prefill.pickup).toBeNull();
});

test("a repeated trip carries both ends, and they are not swapped", () => {
  const prefill = readBookingPrefill(
    paramsOf(bookUrl("ride", VALENCIA, MARKET)),
  );
  expect(prefill.destination?.address).toBe(VALENCIA.label);
  expect(prefill.pickup?.address).toBe(MARKET.label);
});

test("the service is always the first thing a link says", () => {
  // The booking form reads `type` before anything else, and a service with a
  // destination is still a service, not a bare pin.
  expect(paramsOf(bookUrl("padala", MARKET)).get("type")).toBe("padala");
});

test("an address with spaces and an ampersand comes back intact", () => {
  const awkward: PickedPlace = {
    lat: 8.1,
    lng: 125.1,
    label: "Rice store & poultry, Poblacion",
  };
  expect(readBookingPrefill(paramsOf(bookUrl("ride", awkward))).destination)
    .toEqual({ lat: 8.1, lng: 125.1, address: awkward.label });
});

test("a very long address is trimmed rather than filling the URL", () => {
  const long: PickedPlace = {
    lat: 8.1,
    lng: 125.1,
    label: "x".repeat(400),
  };
  const address = readBookingPrefill(paramsOf(bookUrl("ride", long)))
    .destination?.address;
  expect(address?.length).toBe(120);
});

test("a truncated link pins nothing instead of pinning the wrong place", () => {
  // Coordinates alone, or a label alone, are not a destination.
  expect(
    readBookingPrefill(paramsOf("/book?type=ride&lat=8.1&lng=125.1"))
      .destination,
  ).toBeNull();
  expect(
    readBookingPrefill(paramsOf("/book?type=ride&q=Malaybalay")).destination,
  ).toBeNull();
});

test("coordinates that are not numbers, or not on Earth, are refused", () => {
  for (const query of [
    "lat=abc&lng=125.1&q=Somewhere",
    "lat=&lng=125.1&q=Somewhere",
    "lat=8.1&lng=NaN&q=Somewhere",
    "lat=991&lng=125.1&q=Somewhere",
    "lat=8.1&lng=1251&q=Somewhere",
  ]) {
    expect(
      readBookingPrefill(new URLSearchParams(query)).destination,
    ).toBeNull();
  }
});

test("a bad pickup does not take a good destination down with it", () => {
  const prefill = readBookingPrefill(
    new URLSearchParams(
      "lat=7.9067&lng=125.0944&q=Valencia City Hall&plat=nope&plng=125&q=Home",
    ),
  );
  expect(prefill.destination?.address).toBe("Valencia City Hall");
  expect(prefill.pickup).toBeNull();
});
