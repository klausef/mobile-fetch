/**
 * Which service the booking screen is showing.
 *
 * Book, Pabili and Pasugo are one screen at `/book`, so the choice rides in the
 * query string. That means the value is untrusted input: anyone can hand someone
 * a link, and a stale or mistyped `?type=` used to reach the form through an
 * unchecked cast. A wrong-but-valid service would show a pabili shopping list to
 * someone who asked for a ride, so the fallback is asserted here rather than left
 * to a cast.
 *
 * The file also pins how Activity splits one list of rides into "Ongoing" and
 * "Past", because both sections read from the same query and a status that
 * falls through the split would vanish from the screen entirely.
 *
 * Run: bun test
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, test, expect } from "bun:test";
import {
  audienceForRole,
  BOOKING_TYPES,
  DEFAULT_BOOKING_TYPE,
  isOngoingStatus,
  resolveBookingType,
  ridesInGroup,
  serviceLabel,
} from "../src/lib/booking.ts";

test("each service round-trips through the URL", () => {
  for (const type of BOOKING_TYPES) {
    expect(resolveBookingType(type)).toBe(type);
  }
});

test("a missing type opens a plain ride", () => {
  expect(resolveBookingType(null)).toBe("ride");
  expect(resolveBookingType(undefined)).toBe("ride");
  expect(resolveBookingType("")).toBe("ride");
  expect(DEFAULT_BOOKING_TYPE).toBe("ride");
});

test("an unknown type falls back instead of rendering the wrong form", () => {
  expect(resolveBookingType("groceries")).toBe("ride");
  expect(resolveBookingType("PADALA")).toBe("ride");
  expect(resolveBookingType(" ride")).toBe("ride");
  expect(resolveBookingType("ride ")).toBe("ride");
  expect(resolveBookingType("../ride")).toBe("ride");
});

test("exactly three services exist, and the home hub lists them in this order", () => {
  // The hub renders one card per service and writes the same string into the
  // booking link, so adding or reordering one here is a visible change to the
  // home screen and should be deliberate.
  expect(BOOKING_TYPES).toEqual(["ride", "pabili", "padala"]);
});

test("a rider and a commuter call the same service different things", () => {
  // The one place the two audiences genuinely disagree. A passenger is booking
  // it, so "Pasugo"; a rider is being handed the job, so "Padala". Showing the
  // rider "Pasugo" is the bug this helper exists to prevent.
  expect(serviceLabel("padala", "commuter")).toBe("Pasugo");
  expect(serviceLabel("padala", "rider")).toBe("Padala");
});

test("pabili is called the same thing on both sides", () => {
  // Only the delivery service differs. Pabili names the same errand to the
  // person buying and the person shopping, so the audience must not leak in.
  expect(serviceLabel("pabili", "commuter")).toBe("Pabili");
  expect(serviceLabel("pabili", "rider")).toBe("Pabili");
});

test("a plain ride has no service name", () => {
  // The history chip already shows the status; printing "Ride" next to it is
  // noise, so the label is empty rather than a third word.
  expect(serviceLabel("ride", "commuter")).toBe("");
  expect(serviceLabel("ride", "rider")).toBe("");
});

test("a missing or unknown service name is empty, never the raw value", () => {
  // bookingType is nullable on a row that predates errands, so this is a real
  // shape, not a defensive flourish.
  expect(serviceLabel(null, "rider")).toBe("");
  expect(serviceLabel(undefined, "commuter")).toBe("");
  expect(serviceLabel("groceries", "rider")).toBe("");
});

test("only a finished or cancelled trip is over", () => {
  // Activity asks one question — is anything happening right now? — and a
  // commuter still waiting for a rider needs their request listed as ongoing,
  // not buried under last month's receipts.
  expect(isOngoingStatus("REQUESTED")).toBe(true);
  expect(isOngoingStatus("ASSIGNED")).toBe(true);
  expect(isOngoingStatus("EN_ROUTE")).toBe(true);
  expect(isOngoingStatus("COMPLETED")).toBe(false);
  expect(isOngoingStatus("CANCELLED")).toBe(false);
});

test("an unrecognised status is treated as still happening", () => {
  // A status added to the backend but not yet to this helper must not make a
  // live ride disappear from the only section a commuter looks at. Being wrong
  // here shows a stale row under "Ongoing"; being wrong the other way hides an
  // active trip entirely.
  expect(isOngoingStatus("SOMETHING_NEW")).toBe(true);
  expect(isOngoingStatus("")).toBe(true);
});

test("a trip list splits into ongoing and past with nothing lost or doubled", () => {
  const rides = [
    { status: "REQUESTED" },
    { status: "COMPLETED" },
    { status: "ASSIGNED" },
    { status: "CANCELLED" },
    { status: "EN_ROUTE" },
  ];
  const ongoing = ridesInGroup(rides, "ongoing");
  const past = ridesInGroup(rides, "past");
  // Every ride appears in exactly one section. A trip that fell through both
  // filters would be a ride a commuter can see nowhere.
  expect(ongoing.length + past.length).toBe(rides.length);
  expect(ongoing.every((ride) => isOngoingStatus(ride.status))).toBe(true);
  expect(past.every((ride) => !isOngoingStatus(ride.status))).toBe(true);
  expect(ongoing.map((ride) => ride.status)).toEqual([
    "REQUESTED",
    "ASSIGNED",
    "EN_ROUTE",
  ]);
  expect(past.map((ride) => ride.status)).toEqual(["COMPLETED", "CANCELLED"]);
});

test("an empty or one-sided list groups without inventing rows", () => {
  // Activity hides a section outright when it has nothing in it, so grouping
  // must not pad a section to look less empty than it is.
  expect(ridesInGroup([], "ongoing")).toEqual([]);
  expect(ridesInGroup([], "past")).toEqual([]);

  const onlyOngoing = [{ status: "ASSIGNED" }];
  expect(ridesInGroup(onlyOngoing, "ongoing")).toEqual(onlyOngoing);
  expect(ridesInGroup(onlyOngoing, "past")).toEqual([]);

  const onlyPast = [{ status: "COMPLETED" }];
  expect(ridesInGroup(onlyPast, "ongoing")).toEqual([]);
  expect(ridesInGroup(onlyPast, "past")).toEqual(onlyPast);
});

test("only a rider is addressed as a rider", () => {
  // Everything else — commuter, admin, and a profile that has not finished
  // being created — gets the passenger's wording. That is the safe direction
  // to fail: a rider who reads "Pasugo" still understands it, whereas showing
  // a commuter "Padala" leaks the internal name into the booking flow.
  expect(audienceForRole("rider")).toBe("rider");
  expect(audienceForRole("commuter")).toBe("commuter");
  expect(audienceForRole("admin")).toBe("commuter");
  expect(audienceForRole(null)).toBe("commuter");
  expect(audienceForRole(undefined)).toBe("commuter");
});

/**
 * The booking screen's choice rows.
 *
 * It used to open on a numbered list: a circled 1 and a circled 2, with a
 * crosshair circle wedged beside the first row to mean "use my GPS". The numbers
 * were decoration — nobody gets to a destination without a pickup — and the
 * crosshair read as a decoration on the pickup field rather than as the third
 * way to fill it in, which is the thing a commuter in an unfamiliar street most
 * needs. So the rows are led by icons that say which *kind* of place each one is,
 * and GPS is a row of its own that names itself.
 *
 * Nothing was dropped in the exchange: both ends still open the screen that owns
 * picking them, GPS still sets the pickup from a fresh fix, and swap is still
 * there — it just stopped pretending to be a step.
 */
describe("the booking screen's ends", () => {
  const page = readFileSync("src/pages/CommuterHome.tsx", "utf8");test("two rows, and the dropoff is on screen once", () => {
expect(page.match(/<EndRow\b/g)).toHaveLength(2);
const pickup = page.indexOf("label={copy.pickup}");
const gps = page.indexOf('label="Use my current location"');
expect(pickup).toBeGreaterThan(-1);
expect(gps).toBeGreaterThan(pickup);
});

test("the dropoff is a labelled field, not a row that duplicates it", () => {
// It was both: a "Destination" row showing the address, and a search box
// showing the same address underneath. Two controls for one value, disagreeing
// about whether a tap typed or navigated. Now the label sits above the field,
// and the field shows the address it holds.
const label = page.indexOf("{copy.destination}");
const field = page.indexOf("<PlaceSearch");
expect(label).toBeGreaterThan(-1);
expect(field).toBeGreaterThan(label);
expect(page.match(/\{copy\.destination\}/g)).toHaveLength(1);
});

test("the map button comes after both ends, with the pin tip under it", () => {
// It was tucked between the rows and the destination field, so it interrupted
// the trip rather than following it.
const field = page.indexOf("<PlaceSearch");
const map = page.indexOf("Choose on map");
const tip = page.indexOf("check the pin lands on your gate");
expect(map).toBeGreaterThan(field);
expect(tip).toBeGreaterThan(map);
});

test("the rows are compact, not oversized", () => {
// min-h-16 with a 40px chip made two rows taller than the rest of the panel
// put together. 56px with a 36px chip is still a comfortable touch target.
expect(page).toContain("min-h-14");
expect(page).not.toContain("min-h-16");
expect(page).toContain("size-9 shrink-0");
});test("each end is led by an icon, not a step number", () => {
expect(page).not.toContain("step={1}");
expect(page).not.toContain("step={2}");
// The pickup is the end the app can fill in for you, so it is the accented
// one and it reads differently from the GPS row below it.
expect(page).toContain('tone="accent"');
expect(page).toContain("<Navigation");
expect(page).toContain("<LocateFixed");
});

  test("using your location is a row that names itself, and shows it is working", () => {
    // It was a 44px circle with a title attribute, sitting inside the pickup
    // row's own markup. A row states the action; a bare crosshair does not, and
    // a press with no feedback reads as a button that did nothing.
    expect(page).toContain('label="Use my current location"');
    expect(page).toContain("busy={here.detecting}");
    expect(page).toContain("handleUseCurrentLocation()");
    // It must not be nested inside another button: the inner press would fire
    // the outer one too, opening the picker as well as setting the pickup.
    expect(page).toContain("<EndRow");
    expect(page).not.toContain("aria-label=\"Use current location\"");
  });test("the pickup still opens the screen that owns picking it", () => {
expect(page).toContain('openStep("pickup")');
// The dropoff deliberately does not: it is typed here, in the field below, and
// the pin is moved on the map. Navigating away to do the same thing is the
// friction the inline search was added to remove.
expect(page).toContain("<PlaceSearch");
});

  test("swap survived, as a control rather than a step", () => {
    expect(page).toContain("swapEnds");
    // Only meaningful once both ends exist, so it is not offered before then.
    expect(page).toMatch(/\{pickup && destination \? \([\s\S]{0,300}swapEnds/);
  });

  test("the map is on this screen, so 'choose on map' scrolls to it", () => {
    // The button does not open a map — there is one right here. And the ref it
    // scrolls was attached but never read, so it went nowhere.
    expect(page).toContain("Choose on map");
    expect(page).toContain("mapWrapRef.current?.scrollIntoView");
    // The ref is read twice now: by the button, and by the pick handler that
    // eases a phone up to the pin it just chose. The exact count keeps the
    // assert honest about both readers.
    expect(page.match(/mapWrapRef/g)).toHaveLength(4);
  });
});

/**
 * Touch targets and the map, on a phone.
 *
 * FETCH is a phone app that also happens to work in a browser, so the phone is
 * the case that has to hold. Two things were quietly failing it: a set of
 * controls built to desktop density (a 26px-tall service picker, 24px chips)
 * that are unreachable-ish with a thumb, and a map with a 300px floor that on a
 * 568px-tall screen took more than half the viewport before the form began —
 * so reaching the pickup row meant scrolling a phone-height of map first.
 *
 * The 44px floor is asserted rather than eyeballed because it is the number
 * that matters and the number that gets quietly broken by a padding tweak.
 */
describe("the booking screen on a phone", () => {
  const page = readFileSync("src/pages/CommuterHome.tsx", "utf8");

  test("the controls a thumb has to hit are at least 44px", () => {
    // Service picker, swap, and the saved-place chips were all under half the
    // minimum. The service picker matters most: it is the first control after
    // the header and it chooses what is being ordered.
    // Scoped to the button itself: the handler is written before its className.
const pickerButton = page.slice(
      page.indexOf("setBookingType(type)"),
      page.indexOf("setBookingType(type)") + 700,
    );
    expect(pickerButton).toContain("min-h-11");
    expect(page).toContain("min-h-11 items-center gap-1.5 rounded-full px-4 text-[11px]");
    expect(page).toContain("min-h-11 rounded-full border px-4 text-sm");
    // The rows themselves.
    expect(page).toContain("min-h-14 w-full items-center");
  });

  test("nothing on the booking path is back to desktop padding", () => {
    // The specific shapes that measured under 44px, so a revert is visible.
    for (const tight of [
      "py-1.5 text-xs font-medium", // service picker
      "py-1.5 text-[11px] font-medium", // swap
      "px-3 py-1.5 text-xs tracking-tight", // quick labels
      'className="h-8 text-xs"', // map popup
    ]) {
      expect(page).not.toContain(tight);
    }
  });

  test("the map leaves room for the form on a short phone", () => {
    // 300px was a floor, not a preference: it won on a 568px screen and left
    // the pickup row below the second scroll.
    expect(page).toContain("min-h-[240px]");
    expect(page).not.toContain("min-h-[300px]");
    // Still dvh, because the URL bar collapses mid-scroll on a phone.
    expect(page).toContain("42dvh");
  });

  test("there is no vehicle choice to squeeze onto a phone", () => {
    // Every FETCH rider is on a motorcycle, so the four-card picker was a
    // decision nobody had — and a component that nothing renders any more.
    expect(page).not.toContain("RideTypePicker");
    expect(existsSync("src/components/ride/RideTypePicker.tsx")).toBe(false);
  });

  test("the shell clears the tab bar and the browser chrome", () => {
    // dvh rather than vh, and an inset above the tab bar — otherwise the last
    // card on a long booking form sits underneath the tabs.
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(shell).toContain("min-h-dvh");
    expect(shell).toContain("safe-bottom-offset");
  });
});

/**
 * One vehicle, stated once.
 *
 * Removing the ride-type picker had a trap in it. The screen had been reading
 * `DEFAULT_RIDE_TYPE`, which is a **tricycle** — so deleting the control
 * without replacing the value would have left a screen that never asks which
 * vehicle, and prices every trip as a tricycle. The vehicle is now a constant on
 * the screen, and these hold it there.
 */
describe("the booking screen's vehicle", () => {
  const page = readFileSync("src/pages/CommuterHome.tsx", "utf8");

  test("it is a motorcycle, and it is written down", () => {
    expect(page).toContain('const BOOKING_RIDE_TYPE: RideType = "motorcycle"');
  });

  test("nothing falls back to the shared default, which is a tricycle", () => {
    // The default is still a tricycle and other screens still use it. What must
    // not happen is this screen reading it as a value after the picker went
    // away — the note on the constant names it, so this checks the import list
    // rather than the whole file.
    expect(page).not.toMatch(/^\s*DEFAULT_RIDE_TYPE,/m);
    expect(page).not.toContain("useState<RideType>");
    // Nothing builds a list of classes either.
    expect(page).not.toContain("RIDE_TYPES");
  });

  test("the fare, the ETA and the request all name the same vehicle", () => {
    // Priced from one value, so a quote cannot describe a motorcycle while the
    // request books a tricycle.
    expect(page.match(/rideType: BOOKING_RIDE_TYPE/g)).toHaveLength(2);
    expect(page).toContain("rideType={BOOKING_RIDE_TYPE}");
  });

  test("the fare line does not name a vehicle that cannot vary", () => {
    // It used to read "Tricycle · 3.2 km · 5 min". One word for no information.
    expect(page).not.toContain("rideTypeSpec(rideType).name");
    expect(page).toContain("formatDistance(distanceKm)} · {formatEta(etaMinutes)}");
  });

  test("a booked ride still reports the vehicle the server stored", () => {
    // The server is the authority on what was actually booked; the constant is
    // only the fallback for the frame before the ride comes back.
    expect(page).toContain("booked.ride.rideType ?? BOOKING_RIDE_TYPE");
  });
});
