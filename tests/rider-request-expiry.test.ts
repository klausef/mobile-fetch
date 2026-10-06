/**
 * A request the rider did not take in time is not a request they refused.
 *
 * The rider's fifteen-second window is right for a passenger waiting at a
 * pickup point: an offer nobody answers is an offer nobody is coming to. But
 * the window used to expire into `rejectRide`, which writes the rider's id into
 * `ride.rejectedBy` — and `nearbyRequests` filters that list out. The result
 * was that a rider who was mid-junction, or whose phone rang, could never be
 * shown that booking again for the rest of the day, while the passenger kept
 * waiting for somebody who had just demonstrated they wanted it.
 *
 * So the two answers are now different things with different storage:
 *
 *   • a refusal (`rejectedBy`) is a decision, and it sticks;
 *   • an expiry (`passedBy`) is an absence, and it only stops the pop-up.
 *
 * These contracts pin that separation, and pin that the request is still
 * *reachable* after an expiry — the second half is the part that was actually
 * broken, and the first half is the part that would be easy to undo by
 * accident while fixing it.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const rides = readFileSync("src/convex/rides.ts", "utf8");
const riders = readFileSync("src/convex/riders.ts", "utf8");
const schema = readFileSync("src/convex/schema.ts", "utf8");
const dashboard = readFileSync("src/pages/RiderDashboard.tsx", "utf8");
const tabs = readFileSync("src/lib/bottomTabs.ts", "utf8");

const body = (source: string, name: string): string => {
  const start = source.indexOf(`export const ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

describe("an expiry is not a refusal", () => {
  test("they are stored in different places", () => {
    expect(schema).toContain("rejectedBy: v.optional(v.array(v.id(\"users\")))");
    expect(schema).toContain("passedBy: v.optional(v.array(v.id(\"users\")))");
  });

  test("a refusal still sticks, per rider", () => {
    // Untouched on purpose. A deliberate "no" must keep hiding the request, or
    // the fix for missed taps becomes harassment from the other direction.
    const reject = body(rides, "rejectRide");
    expect(reject).toContain("rejectedBy: [...already, userId]");
    expect(reject).not.toContain("passedBy");
  });

  test("an expiry records only that the pop-up was seen", () => {
    const pass = body(rides, "passRide");
    expect(pass).toContain("passedBy: [...already, userId]");
    expect(pass).not.toContain("rejectedBy");
  });

  test("neither one records anything once somebody else has taken it", () => {
    // Both used to be able to stamp a rider id onto a ride that was already
    // driven, which grows the array for no reason and makes the row grow.
    for (const name of ["rejectRide", "passRide"]) {
      expect(body(rides, name)).toContain("if (ride.riderId)");
    }
  });

  test("writing the same expiry twice is a no-op", () => {
    expect(body(rides, "passRide")).toContain(
      "if (already.includes(userId)) return { passed: false }",
    );
  });
});

describe("the request is still theirs after the window closes", () => {
  const nearby = body(riders, "nearbyRequests");

  test("only a refusal removes the row", () => {
    // This filter is the one that used to make a missed tap permanent. If it
    // ever learns about `passedBy`, the list empties and the fix is undone.
    expect(nearby).toContain(".filter((ride) => !(ride.rejectedBy ?? []).includes(userId))");
    expect(nearby).not.toMatch(/\.filter\(\(ride\) => !\(ride\.passedBy/);
  });

  test("an expiry is reported to the client rather than used as a filter", () => {
    expect(nearby).toContain("expiredForYou: (ride.passedBy ?? []).includes(userId)");
  });

  test("the client keeps it out of the pop-up and in the list", () => {
    // Two different sets from one query: `unoffered` drives the pop-up,
    // `openRequests` drives the list. Collapsing them to one is the bug.
    expect(dashboard).toContain(
      "const unoffered = openRequests.filter((request) => !request.expiredForYou);",
    );
    expect(dashboard).toContain("(unoffered[0] ?? null)");
    // The list is built from `openRequests`, so a passed request is in it.
    expect(dashboard).toContain("openRequests\n                  .filter((r) => r._id !== offered?._id)");
  });

  test("the expiry path calls passRide, not rejectRide", () => {
    const expire = dashboard.slice(
      dashboard.indexOf("const handleExpire"),
      dashboard.indexOf("const handleExpire") + 600,
    );
    expect(expire).toContain("passRide(");
    expect(expire).not.toContain("rejectRide(");
    // And it must not mark it handled locally either, or the row would vanish
    // from this screen before the server round trip even lands.
    expect(expire).not.toContain("markHandled(");
  });

  test("the modal no longer expires into a refusal", () => {
    expect(dashboard).toContain("onExpire={(request) => void handleExpire(request)}");
    expect(dashboard).not.toContain("onExpire={(request) => void handleReject(request, true)}");
  });

  test("the alert chime still fires for the next offer", () => {
    // The chime is driven by its own list, and a lapse no longer adds the
    // request to `handled` — it stays in the query result on purpose. Filtering
    // that list on `handled` alone pins the id to the lapsed request, so the
    // effect short-circuits and the offer behind it arrives in silence. A rider
    // waiting on a sound is exactly who this hurts.
    expect(dashboard).toContain("!handled.includes(request._id) && !request.expiredForYou");
  });

  test("a passed request says so instead of just reappearing", () => {
    // Otherwise the rider cannot tell a booking they missed from one that just
    // arrived, and the pop-up not reappearing looks like a bug.
    expect(dashboard).toContain("Missed · still open");
  });

  test("a passed request can still be accepted from the list", () => {
    // From the list heading to the modal that follows it: the whole list,
    // not a fixed character window that silently under-reads when it grows.
    const list = dashboard.slice(
      dashboard.indexOf("Available bookings"),
      dashboard.indexOf("<RideRequestModal"),
    );
    expect(list).toContain("Accept");
    expect(list).toContain("handleAccept(");
    // And it is the same list the pop-up draws from, minus the one on screen.
    expect(list).toContain("openRequests");
  });
});

describe("an accepted booking gets its own tab", () => {
  test("the rider's tab bar grows a Current ride cell", () => {
    expect(tabs).toContain("const ACTIVE_RIDE_TAB: BottomTab");
    expect(tabs).toContain('key: "ride"');
    expect(tabs).toContain('to: "/rider/ride"');
    expect(tabs).toContain("...(hasActiveRide ? [ACTIVE_RIDE_TAB] : [])");
  });

  test("it is offered only while they are carrying one", () => {
    // A tab that appears and disappears with the state of their work is
    // disorienting on a bar used one-handed while driving — hence conditional,
    // not always-there-with-a-badge.
    expect(tabs).toContain("export function roleTabs(role: string, hasActiveRide = false)");
    expect(tabs).toContain("hasActiveRide = false");
  });

  test("the shell decides it from the rides it already has loaded", () => {
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    expect(shell).toContain("hasActiveRide={(activeRides ?? []).length > 0}");
    // Rider-scoped, so a commuter or the admin does not pay for the
    // subscription or acquire an empty tab.
    expect(shell).toContain("api.rides.listActiveRides");
  });
});

describe("the request type says what the query returns", () => {
  test("RideRequest carries expiredForYou", () => {
    // The interface is documented as the shape `nearbyRequests` returns and is
    // what the page casts rows to. Leaving the field off it made the documented
    // contract quietly wrong, so a screen reading the flag off a cast row would
    // get `undefined` with no type error to warn about it.
    const modal = readFileSync("src/components/ride/RideRequestModal.tsx", "utf8");
    expect(modal).toContain("export interface RideRequest");
    expect(modal).toContain("expiredForYou?: boolean;");
  });
});