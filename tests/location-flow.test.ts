/**
 * The two-step location flow.
 *
 * Picking where a trip starts and ends moved off the booking form onto its own
 * screens, and the whole hand-off travels in the URL: the pickup screen writes
 * the pickup, Next carries it to the destination screen, and the destination
 * screen brings both ends back to the booking form.
 *
 * That hand-off is the risk. A second writer of the parameter names does not
 * throw when it disagrees with the reader — it parks a pin in the ocean, or
 * silently drops the pabili, or loses the pickup on the way to the
 * destination. These are real unit tests over the pure functions rather than
 * source greps, because the failure mode is a wrong value, not a missing line.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import {
  bookingParamsWith,
  locationStepUrl,
  nextStepUrl,
  readBookingPrefill,
} from "../src/lib/booking-url";

const MINDANAO = { lat: 7.9111239, lng: 125.0933669 };
const MALAYBALAY = { lat: 8.1550421, lng: 125.1305726 };

describe("setting one end keeps the rest of the booking", () => {
  test("a destination is written under the unsuffixed keys", () => {
    const params = bookingParamsWith(
      new URLSearchParams({ type: "ride" }),
      "destination",
      { ...MINDANAO, label: "Valencia City Hall" },
    );
    expect(params.get("lat")).toBe(String(MINDANAO.lat));
    expect(params.get("q")).toBe("Valencia City Hall");
    expect(readBookingPrefill(params).destination?.address).toBe(
      "Valencia City Hall",
    );
  });

  test("a pickup is written under the p-prefixed keys", () => {
    const params = bookingParamsWith(
      new URLSearchParams({ type: "ride" }),
      "pickup",
      { ...MALAYBALAY, label: "Malaybalay City" },
    );
    expect(params.get("plat")).toBe(String(MALAYBALAY.lat));
    expect(readBookingPrefill(params).pickup?.address).toBe("Malaybalay City");
  });

  test("setting the destination leaves the pickup alone", () => {
    // The one that matters on the way through: the pickup screen has already
    // written its end by the time the destination screen runs.
    const afterPickup = bookingParamsWith(
      new URLSearchParams({ type: "pabili" }),
      "pickup",
      { ...MALAYBALAY, label: "Malaybalay City" },
    );
    const afterDestination = bookingParamsWith(
      afterPickup,
      "destination",
      { ...MINDANAO, label: "Valencia City Hall" },
    );
    const read = readBookingPrefill(afterDestination);
    expect(read.pickup?.address).toBe("Malaybalay City");
    expect(read.destination?.address).toBe("Valencia City Hall");
    // And the service type, which nobody remembers to carry.
    expect(afterDestination.get("type")).toBe("pabili");
  });

  test("the input params are not mutated", () => {
    const original = new URLSearchParams({ type: "ride" });
    bookingParamsWith(original, "pickup", { ...MALAYBALAY, label: "x" });
    expect(original.toString()).toBe("type=ride");
  });

  test("clearing an end removes its keys and nothing else", () => {
    const params = bookingParamsWith(
      bookingParamsWith(
        new URLSearchParams({ type: "ride" }),
        "pickup",
        { ...MALAYBALAY, label: "Malaybalay City" },
      ),
      "destination",
      null,
    );
    expect(params.get("lat")).toBeNull();
    expect(params.get("plat")).toBe(String(MALAYBALAY.lat));
    expect(params.get("type")).toBe("ride");
  });

  test("a long label is truncated rather than filling the URL", () => {
    const params = bookingParamsWith(
      new URLSearchParams(),
      "destination",
      { ...MINDANAO, label: "x".repeat(400) },
    );
    expect(params.get("q")?.length).toBe(120);
  });
});

describe("the step links go where the flow says", () => {
  test("the pickup screen offers the destination next", () => {
    const params = new URLSearchParams({ type: "ride" });
    const url = nextStepUrl("pickup", params, {
      ...MALAYBALAY,
      label: "Malaybalay City",
    });
    expect(url.startsWith("/book/destination?")).toBe(true);
    // The pickup it just set is in the link, so the next screen knows where
    // the trip is going without asking.
    const read = readBookingPrefill(new URLSearchParams(url.split("?")[1]));
    expect(read.pickup?.address).toBe("Malaybalay City");
  });

  test("the destination screen returns to the booking form", () => {
    const params = new URLSearchParams({ type: "ride" });
    expect(nextStepUrl("destination", params, { ...MINDANAO, label: "Lumbo" })).toBe(
      `/book?type=ride&lat=${MINDANAO.lat}&lng=${MINDANAO.lng}&q=Lumbo`,
    );
  });

  test("opening a step keeps the other end", () => {
    // Stepping back to fix the pickup must not cost the destination that was
    // already chosen.
    const params = bookingParamsWith(
      new URLSearchParams({ type: "ride" }),
      "destination",
      { ...MINDANAO, label: "Lumbo" },
    );
    const url = locationStepUrl("pickup", params);
    expect(url.startsWith("/book/pickup?")).toBe(true);
    expect(url).toContain("type=ride");
    expect(readBookingPrefill(new URLSearchParams(url.split("?")[1])).destination?.address).toBe(
      "Lumbo",
    );
  });
});

describe("the booking form hands over instead of editing in place", () => {
  const commuter = readFileSync("src/pages/CommuterHome.tsx", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const screen = readFileSync("src/pages/SetLocation.tsx", "utf8");

  test("both step screens are routed and protected", () => {
    for (const path of ["/book/pickup", "/book/destination"]) {
      const route = main.slice(main.indexOf(`path="${path}"`));
      expect(route.slice(0, 220)).toContain("RequireAuth");
    }
    expect(main).toContain('<SetLocation step="pickup" />');
    expect(main).toContain('<SetLocation step="destination" />');
  });

  test("the form's two ends open the steps", () => {
    expect(commuter).toContain('openStep("pickup")');
    expect(commuter).toContain('openStep("destination")');
  });

  test("a tap on empty map opens the step rather than dropping a pin", () => {
    // Choosing a *place* — an address, a saved spot, somewhere across town —
    // is the step screen's job. A tap on bare map that silently dropped a pin
    // was the fastest way to send a rider to the wrong gate, so that tap still
    // hands over instead.
    expect(commuter).toContain("openStep(target)");
  });

  test("the end being edited is a draggable pin on the booking map", () => {
    // Interactive pinning on the booking map: a commuter who can see the pin
    // two metres off their gate can now move it two metres, instead of having
    // to re-pick the whole address on another screen. Nudging is not the same
    // gesture as choosing, which is why both exist.
    expect(commuter).toContain("dragPoint={dragPoint}");
    expect(commuter).toContain("onDragPointChange={handleDragPointChange}");
    expect(commuter).toContain("onDragPointEnd={handleDragPointEnd}");
    // Only the *active* end is draggable, and never while a ride is live: the
    // ends of a booked ride are facts, not suggestions.
    expect(commuter).toContain("const dragPoint: Point | null = active?.ride");
  });

  test("a drag resolves its address through a debounced lookup", () => {
    // Reverse geocoding every pointer frame would spend the commuter's metered
    // quota in one gesture, so the lookup is debounced and distance-gated.
    expect(commuter).toContain("useReverseGeocode(dragPoint, handleGeocoded)");
  });

  test("a destination can be typed on the booking screen, not only chosen elsewhere", () => {
    // Three ways to name a destination — type it, tap a recent, drag the pin —
    // and none of them should cost a screen transition. Opening another screen
    // to type an address you could have typed here is the friction that makes a
    // booking app feel slow.
    expect(commuter).toContain("<PlaceSearch");
    expect(commuter).toContain('placeholder="Where are you going?"');
    expect(commuter).toContain("useRecentDestinations()");
    expect(commuter).toContain("recents.rows.map");
    expect(commuter).toContain("recents.clear");
  });

  test("every way of naming a destination lands in the same place", () => {
    // A search result, a recent and a dragged pin must all end up as the same
    // state, or the fare, the route and the booking request can end up talking
    // about different trips.
    expect(commuter).toContain("const chooseDestination = useCallback(");
    expect(commuter).toContain('applyPlace("destination", point, label)');
  });

  test("the inline editor is gone from the form", () => {
    expect(commuter).not.toContain("PlaceField");
    expect(commuter).not.toContain("handleUseGps");
  });

  test("the pickup step offers the current location, the destination step search", () => {
    // Search on the pickup screen invites picking the wrong end twice; nobody
    // searches for where they are already standing.
    expect(screen).toContain("goToCurrentLocation");
    const destinationBranch = screen.slice(screen.indexOf('step === "destination" && !editing'));
    expect(destinationBranch).toContain("<PlaceSearch");
  });
});