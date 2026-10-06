/**
 * Cash only.
 *
 * Online payment is parked pending a real payment provider, and this file is
 * the thing that keeps "parked" meaning parked. Both halves matter:
 *
 *  - no surface in the product should offer to take a fare electronically, or
 *    an operator testing a deployment will believe it can when it cannot;
 *  - but the server-side guard that forces cash must NOT be deleted along with
 *    the toggle, because it is what makes cash-only true no matter what a
 *    client sends.
 *
 * Run: bun test
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { resolvePaymentMethod } from "../src/lib/payments";

const read = (path: string) => readFileSync(path, "utf8");

const adminConsole = read("src/pages/AdminDashboard.tsx");
const adminFunctions = read("src/convex/admin.ts");
const rides = read("src/convex/rides.ts");

describe("nothing offers an online payment the platform cannot take", () => {
  test("the console has no online-payment toggle", () => {
    expect(adminConsole).not.toContain("setCashlessEnabled");
    expect(adminConsole).not.toContain("Online payment");
  });

  test("the console never surfaces payment-provider state", () => {
    // Provider status in the console was only ever there to explain why the
    // toggle could not be used. With the toggle gone it is dead weight.
    expect(adminConsole).not.toContain("paymentProvider");
    expect(adminFunctions).not.toContain("providerStatus");
  });

  test("no admin mutation can switch it on", () => {
    // The control has to be gone at the API too. A switch removed from the UI
    // but still callable by hand is not "off".
    expect(adminFunctions).not.toContain("setCashlessEnabled");
  });

  test("the ride records cash, whatever a client asks for", () => {
    // A stale or tampered client sending "online" must not produce an online
    // ride: both the admin switch and the provider have to agree, and with the
    // feature parked neither can.
    for (const requested of ["online", "cash"] as const) {
      expect(
        resolvePaymentMethod({
          requested,
          cashlessEnabled: false,
          providerConfigured: false,
        }).method,
      ).toBe("cash");
    }
  });

  test("the ride still persists the method it resolved", () => {
    expect(rides).toContain("paymentMethod: payment.method");
  });
});

describe("the parked feature is still recoverable", () => {
  test("the setting reader survives, so restoring needs no migration", () => {
    expect(read("src/convex/lib/db.ts")).toContain("isCashlessEnabled");
  });

  test("the provider probe survives, so keys can be detected later", () => {
    expect(read("src/convex/lib/provider.ts")).toContain("isStripeConfigured");
  });
});