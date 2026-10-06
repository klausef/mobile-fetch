/**
 * The wording of a tariff notice is the whole user-visible payload of a fare
 * change, and it is easy to regress into something useless ("New rates are in
 * effect") or unreadable (all five dials, changed or not).
 *
 * describeTariffChanges is dependency-free so the copy can be asserted here.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import { describeTariffChanges } from "../src/convex/lib/broadcast.ts";

const BASE = {
  minFare: 60,
  includedDistanceKm: 2,
  ratePerKm: 12,
  errandMinFare: 90,
  stopFee: 25,
};

test("only the dials that moved are mentioned", () => {
  const text = describeTariffChanges(BASE, { ...BASE, ratePerKm: 14 });
  expect(text).toBe("Rate per km ₱12 → ₱14.");
  // The unchanged dials stay out of it, so the reason for the message is visible.
  expect(text).not.toContain("Minimum fare");
  expect(text).not.toContain("Store stop fee");
});

test("a fuel spike lists every dial that moved", () => {
  const text = describeTariffChanges(BASE, {
    minFare: 65,
    includedDistanceKm: 2,
    ratePerKm: 14,
    errandMinFare: 90,
    stopFee: 30,
  });
  expect(text).toContain("Minimum fare ₱60 → ₱65");
  expect(text).toContain("Rate per km ₱12 → ₱14");
  expect(text).toContain("Store stop fee ₱25 → ₱30");
  expect(text).not.toContain("Included distance");
});

test("distance is quoted in km, not pesos", () => {
  const text = describeTariffChanges(BASE, { ...BASE, includedDistanceKm: 3 });
  expect(text).toBe("Included distance 2 km → 3 km.");
  // A peso sign on a distance would be nonsense on a receipt.
  expect(text).not.toContain("₱");
});

test("pesos keep their decimals rather than rounding to whole units", () => {
  // 12.5 is a real rate; rounding it to ₱13 would misreport the change.
  const text = describeTariffChanges(
    { ...BASE, ratePerKm: 12.5 },
    { ...BASE, ratePerKm: 13 },
  );
  expect(text).toBe("Rate per km ₱12.5 → ₱13.");
});

test("the first published tariff has nothing to compare against", () => {
  // `before` is null on a brand-new deployment. The copy must list the dials as
  // set, not as "₱60 → ₱60" — that reads as a change that never happened.
  const text = describeTariffChanges(null, BASE);
  expect(text).toContain("New fares:");
  expect(text).toContain("Minimum fare ₱60");
  expect(text).not.toContain("→");
  expect(text).not.toContain("₱0");
  expect(text).not.toContain("null");
  expect(text).not.toContain("undefined");
});

test("republishing the same numbers says so instead of claiming a change", () => {
  // The admin form can be submitted without edits; a notice claiming fares moved
  // when they did not would train riders to ignore tariff messages.
  expect(describeTariffChanges(BASE, { ...BASE })).toBe("No dials changed.");
});