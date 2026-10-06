/**
 * The approval wall on the rider dashboard tab.
 *
 * The booking screen has always waited for the Super Admin before showing a
 * rider their work surfaces. The dashboard tab — earnings, rating, and the
 * vehicle editor — did not, which meant a rider the console had declined or
 * suspended could still open it, read what they had earned, and change the
 * vehicle a passenger was about to be told about.
 *
 * Two halves, and the second is the one that matters: the screen stops
 * rendering, and `riderEarnings` / `getDriverStats` stop answering. A gate drawn
 * in JSX is a suggestion to anybody calling the query directly.
 *
 * Both halves have to agree on the edge cases, so the client helper is asserted
 * against the server's rule rather than against a hand-written list — if the two
 * ever diverge, the screen either hides something the server would have shown or
 * (worse) promises a number the server will not hand over.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { canShowRiderSurfaces } from "../src/components/ride/ApprovalGate";
import { riderApprovalSatisfied } from "../src/convex/lib/audience.ts";

const dashboard = readFileSync("src/pages/RiderDashboard.tsx", "utf8");
const overview = readFileSync("src/pages/RiderOverview.tsx", "utf8");
const register = readFileSync("src/pages/RiderRegister.tsx", "utf8");
const rides = readFileSync("src/convex/rides.ts", "utf8");
const riders = readFileSync("src/convex/riders.ts", "utf8");
const rideScreen = readFileSync("src/pages/RiderRide.tsx", "utf8");

/** The body of an exported function, up to the next top-level export. */
const bodyOf = (source: string, marker: string): string => {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

const riderEarningsBody = (): string =>
  bodyOf(rides, "export const riderEarnings");
const getDriverStatsBody = (): string =>
  bodyOf(riders, "export const getDriverStats");
const saveVehicleBody = (): string =>
  bodyOf(riders, "export const saveVehicle");

const APPROVALS = [
  "APPROVED",
  "PENDING",
  "SUSPENDED",
  "REJECTED",
  undefined,
  null,
];
const GUESTISH = [true, false, undefined];

describe("the screen gate and the server rule cannot disagree", () => {
  test("every approval value, against every kind of session", () => {
    // Parity, not a table of cases I liked the look of. `riderApprovalSatisfied`
    // is what `canOperateAsRider` calls on the server, so this compares the two
    // halves of one rule across the whole cross-product.
    for (const approval of APPROVALS) {
      for (const isGuest of GUESTISH) {
        const onScreen = canShowRiderSurfaces(approval, isGuest);
        const onServer = riderApprovalSatisfied(approval, isGuest === true);
        expect(onScreen).toBe(onServer);
      }
    }
  });

  test("an approved rider gets their numbers", () => {
    expect(canShowRiderSurfaces("APPROVED", false)).toBe(true);
    expect(canShowRiderSurfaces("APPROVED", undefined)).toBe(true);
  });

  test("a real rider the console has not cleared is held", () => {
    // The rule the whole approval queue exists to enforce.
    expect(canShowRiderSurfaces("PENDING", false)).toBe(false);
    expect(canShowRiderSurfaces("SUSPENDED", false)).toBe(false);
    expect(canShowRiderSurfaces("REJECTED", false)).toBe(false);
  });

  test("a guest session skips the wait", () => {
    // A throwaway demo account will never sit in an approval queue, so holding
    // it back would strand it on a screen it can never leave.
    expect(canShowRiderSurfaces("PENDING", true)).toBe(true);
    expect(canShowRiderSurfaces("REJECTED", true)).toBe(true);
  });

  test("no decision on file is not a decision to approve, even for a guest", () => {
    // The guest exemption is about skipping a queue, not about treating an
    // absent rider record as approved.
    expect(canShowRiderSurfaces(undefined, true)).toBe(false);
    expect(canShowRiderSurfaces(null, true)).toBe(false);
  });
});

const gateImport = `import {
  ApprovalGate,
  canShowRiderSurfaces,
} from "@/components/ride/ApprovalGate";`;

describe("both rider screens stand behind the gate", () => {
  test("the dashboard tab gates and imports the shared gate", () => {
    expect(dashboard).toContain(gateImport);
    expect(dashboard).toContain(
      "if (!canShowRiderSurfaces(rider.approval, isGuest))",
    );
    expect(dashboard).toContain("return <ApprovalGate approval={rider.approval} />;");
  });

  test("the overview tab gates the same way", () => {
    expect(overview).toContain(gateImport);
    expect(overview).toContain(
      "if (!canShowRiderSurfaces(rider.approval, isGuest))",
    );
    expect(overview).toContain('bottomActiveKey="dashboard"');
  });

  test("the overview reads the guest flag, or it would lock out demo riders", () => {
    expect(overview).toContain("api.profiles.isGuest");
  });

  test("both screens wait for the guest flag before deciding", () => {
    // A live regression this suite did not catch the first time. `useQuery`
    // hands back `undefined` until the answer arrives, and `undefined` is
    // indistinguishable from "not a guest" — so a demo rider whose row loads
    // first renders the gate and then flips to the dashboard underneath it.
    // Both screens have to hold the spinner until all three answers are in.
    for (const [name, source] of [
      ["dashboard", dashboard],
      ["overview", overview],
    ] as const) {
      const start = source.indexOf("profile === undefined");
      expect(start).toBeGreaterThan(-1);
      const loading = source.slice(start, start + 200);
      expect(loading).toContain("isGuest === undefined");
      // And the wait has to come before the gate, not merely exist.
      expect(source.indexOf("isGuest === undefined")).toBeLessThan(
        source.indexOf("canShowRiderSurfaces(rider.approval"),
      );
      expect(name).toBeTruthy();
    }
  });

  test("the gate is decided on a rider row that exists", () => {
    // Both screens bail out earlier when there is no rider record, so reaching
    // the gate means `rider.approval` is a real decision rather than a crash on
    // a missing row.
    for (const [name, source] of [
      ["dashboard", dashboard],
      ["overview", overview],
    ] as const) {
      const missing = source.indexOf("if (!rider) {");
      const gate = source.indexOf("canShowRiderSurfaces(rider.approval");
      expect(missing).toBeGreaterThan(-1);
      expect(gate).toBeGreaterThan(missing);
      expect(name).toBeTruthy();
    }
  });

  test("the gate comes before the earnings panel and the vehicle form", () => {
    // Ordering, not just presence: a gate rendered underneath the thing it is
    // gating hides nothing.
    const gate = overview.indexOf("canShowRiderSurfaces(rider.approval");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(overview.indexOf("Earnings today"));
    expect(gate).toBeLessThan(overview.indexOf("handleSaveVehicle"));
    expect(gate).toBeLessThan(overview.indexOf("name=\"plate\""));
  });
});

describe("the server refuses to hand over the numbers", () => {
  test("riderEarnings is gated, and gated on a real rider lookup", () => {
    const body = riderEarningsBody();
    expect(body).toContain("getRider(ctx, userId)");
    expect(body).toContain("canOperateAsRider(ctx, rider)");
    // The gate has to come before the scan, or the money is read first and
    // merely not returned — which still costs the read and still trusts the
    // caller to have stopped.
    expect(body.indexOf("canOperateAsRider")).toBeLessThan(
      body.indexOf(".query(\"rides\")"),
    );
  });

  test("getDriverStats is gated the same way", () => {
    const body = getDriverStatsBody();
    expect(body).toContain("getRider(ctx, userId)");
    expect(body).toContain("canOperateAsRider(ctx, rider)");
    expect(body.indexOf("canOperateAsRider")).toBeLessThan(
      body.indexOf(".query(\"ratings\")"),
    );
  });

  test("both refuse quietly rather than throwing", () => {
    // The trip receipt reads both queries, and a rider suspended part-way
    // through a ride still has to see what that one ride paid. An unhandled
    // server error there replaces the receipt with a dead screen; `null` drops
    // it back to the figures already on the ride itself.
    expect(riderEarningsBody()).toContain("return null;");
    expect(getDriverStatsBody()).toContain("return null;");
  });

  test("the screens that read them survive a null", () => {
    // Every use is optional-chained or defaulted, so the null is a rendering
    // choice and not a crash waiting for a suspended rider.
    expect(overview).toContain("earnings?.today ?? 0");
    expect(overview).toContain("stats?.rating");
    expect(rideScreen).toContain("earnings?.today ?? settlement.net");
    expect(rideScreen).toContain("earnings?.platformRate ?? DRIVER_PLATFORM_RATE");
    expect(rideScreen).toContain("stats?.rating");
  });
});

describe("registration is not collateral damage", () => {
  test("saveVehicle stays open before approval", () => {
    // This is the trap. `RiderRegister` writes the vehicle as step two of the
    // application — before any approval exists — so gating this mutation would
    // make rider sign-up impossible. The gate belongs on the screen, and the
    // screen is where it is.
    expect(saveVehicleBody()).not.toContain("canOperateAsRider");
    expect(register).toContain("saveVehicle");
  });

  test("the registration screen is a separate route from the gated tab", () => {
    // So the vehicle can still be filled in during application.
    expect(overview).toContain("api.riders.saveVehicle");
    expect(register).toContain("api.riders.saveVehicle");
  });
});