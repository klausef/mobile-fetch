/**
 * Current-location policy: which status means what on screen.
 *
 * A location feature is easy to get wrong in exactly one direction — it looks
 * fine when the phone says yes. The interesting assertions are all about the
 * refusals: does a blocked permission get a retry button that cannot possibly
 * work, does a timeout read as an error the commuter caused, does a dead GPS
 * signal leave the screen with no way forward at all.
 *
 * The rules live in `src/lib/location.ts` as pure functions so they can be
 * asserted here rather than by driving a browser's permission dialog.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  canRetry,
  CURRENT_LOCATION_COLOR,
  CURRENT_LOCATION_ZOOM,
  distanceToFixMeters,
  formatCoords,
  isDetecting,
  isSamePlace,
  locationNotice,
  needsAddressFallback,
  shouldWarnFixDrift,
} from "../src/lib/location.ts";

/** Every status the hook can report, so a new one cannot be forgotten here. */
const ALL_STATUSES = [
  "idle",
  "locating",
  "ready",
  "denied",
  "unavailable",
  "timeout",
  "error",
] as const;

test("only a blocked permission refuses to offer a retry", () => {
  // Every other failure is transient, and a button that fixes it is the whole
  // recovery path. A blocked permission is not: the browser will not show a
  // prompt for an origin the person has already refused, so the button would
  // visibly do nothing.
  expect(canRetry("denied")).toBe(false);
  expect(canRetry("unavailable")).toBe(true);
  expect(canRetry("timeout")).toBe(true);
  expect(canRetry("error")).toBe(true);
});

test("every non-retryable status has exactly one explanation", () => {
  // A status with no message would leave the commuter staring at a map that
  // will never load, so this asserts the pairing rather than the wording.
  for (const status of ALL_STATUSES) {
    const notice = locationNotice(status, false);
    if (status === "denied") {
      expect(notice).not.toBeNull();
    } else if (status === "unavailable" || status === "timeout" || status === "error") {
      expect(notice).not.toBeNull();
    } else {
      // Nothing is wrong in these states, so there must be nothing to say.
      expect(notice).toBeNull();
    }
  }
});

test("a refusal that cannot be re-asked tells the commuter how to undo it", () => {
  // "We cannot show your location" with no next step is the failure mode here:
  // the commuter decides the app is broken rather than that a browser setting
  // is. `hasPermissionPrompt` is the one thing that changes the wording.
  const stuck = locationNotice("denied", false) ?? "";
  const undoable = locationNotice("denied", true) ?? "";
  expect(stuck.length).toBeGreaterThan(0);
  expect(undoable).not.toBe(stuck);
  expect(undoable.toLowerCase()).toContain("setting");
});

test("a timeout reads as 'try again', not as a failure the commuter caused", () => {
  const notice = (locationNotice("timeout", false) ?? "").toLowerCase();
  expect(notice).toContain("too long");
  expect(notice).toContain("try again");
});

test("GPS failure always leaves a way to set the pickup by hand", () => {
  // The screen cannot refuse to work. Each failing status pairs with a fallback.
  for (const status of [
    "denied",
    "unavailable",
    "timeout",
    "error",
  ] as const) {
    expect(needsAddressFallback(status)).toBe(true);
    expect(locationNotice(status, false)).not.toBeNull();
  }
});

test("a fix in flight or in hand does not ask for a typed address", () => {
  // Showing a search box because GPS is slow trains people to stop waiting for
  // GPS at all, which is how they end up typing their home address forever.
  expect(needsAddressFallback("idle")).toBe(false);
  expect(needsAddressFallback("locating")).toBe(false);
  expect(needsAddressFallback("ready")).toBe(false);
});

test("only the in-flight states are 'detecting'", () => {
  expect(isDetecting("idle")).toBe(true);
  expect(isDetecting("locating")).toBe(true);
  expect(isDetecting("ready")).toBe(false);
  for (const status of ["denied", "unavailable", "timeout", "error"] as const) {
    expect(isDetecting(status)).toBe(false);
  }
});

test("every status is classified rather than falling through", () => {
  // Guards the switch: a new status that is not in any branch would otherwise
  // be silently treated as "fine" and produce a screen with no message.
  const failing = ALL_STATUSES.filter((s) => needsAddressFallback(s));
  const working = ALL_STATUSES.filter((s) => !needsAddressFallback(s));
  expect(failing.length + working.length).toBe(ALL_STATUSES.length);
  expect(working).toContain("ready");
  expect(failing).toContain("denied");
});

test("the current-location zoom is close enough to check a gate", () => {
  // 13 shows a whole city, where a pin "on the right street" is
  // indistinguishable from one three streets over. 15 is the neighbourhood.
  expect(CURRENT_LOCATION_ZOOM).toBeGreaterThanOrEqual(15);
  expect(CURRENT_LOCATION_ZOOM).toBeLessThanOrEqual(17);
});

test("the current-location dot is blue, not brand red", () => {
  // Red already means pickup, destination, the route and the rider. A red "you
  // are here" would be indistinguishable from the pin the rider is going to.
  expect(CURRENT_LOCATION_COLOR).toMatch(/^#[0-9a-f]{6}$/i);
  const [r, g, b] = [1, 3, 5].map((i) =>
    Number.parseInt(CURRENT_LOCATION_COLOR.slice(i, i + 2), 16),
  );
  expect(b).toBeGreaterThan(r);
  expect(b).toBeGreaterThan(g);
});

test("coordinates are shown at a precision the reader can use", () => {
  // Five decimals is about a metre; the raw float's eight digits read as a bug
  // in an address field.
  expect(formatCoords({ lat: 8.1550421, lng: 125.1305726 })).toBe(
    "8.15504, 125.13057",
  );
});

test("distance to the fix is measured in metres", () => {
  // Roughly 111 m per 0.001 degree of latitude, which is close enough for a
  // drift warning and exact enough not to need a projection.
  const metres = distanceToFixMeters(
    { lat: 8.15504, lng: 125.13057 },
    { lat: 8.15604, lng: 125.13057 },
  );
  expect(metres).toBeGreaterThan(100);
  expect(metres).toBeLessThan(120);

  expect(distanceToFixMeters(null, { lat: 1, lng: 1 })).toBeNull();
  expect(distanceToFixMeters({ lat: 1, lng: 1 }, null)).toBeNull();
});

test("the drift warning ignores phone-level noise and fires on a wrong street", () => {
  // A few metres is just a phone with two bars. A couple of hundred is a
  // different street, and the rider would have to walk to find the gate.
  expect(shouldWarnFixDrift(null)).toBe(false);
  expect(shouldWarnFixDrift(0)).toBe(false);
  expect(shouldWarnFixDrift(8)).toBe(false);
  expect(shouldWarnFixDrift(30)).toBe(false);
  expect(shouldWarnFixDrift(31)).toBe(true);
  expect(shouldWarnFixDrift(200)).toBe(true);
});

test("two pins within a metre are one pin on screen", () => {
  // At the zoom a GPS-seeded pickup opens at, anything under a metre is a
  // single dot, so drawing both reads as a glitch.
  const a = { lat: 8.1550421, lng: 125.1305726 };
  expect(isSamePlace(a, { lat: 8.1550422, lng: 125.1305727 })).toBe(true);
  expect(isSamePlace(a, { lat: 8.1551, lng: 125.1306 })).toBe(false);
  expect(isSamePlace(null, a)).toBe(false);
  expect(isSamePlace(a, undefined)).toBe(false);
});