/**
 * The rider-finish settlement path: the rider collects the exact amount.
 *
 * This is the behavioral guard for the "no platform fee, no tax deduction" rule
 * on the rider side, and it is separate from `tests/driver-flow.test.ts` because
 * that suite also covers the rider's countdown/ETA/demand arithmetic. Two things
 * are pinned here:
 *
 * - the live rate is 0, so a finished ride pays the rider the whole fare — the
 *   number on the receipt and the number handed over are the same;
 * - the commission arithmetic still works if a fee is ever reintroduced, because
 *   `settleTrip` remains the one place a payout is split.
 *
 * Run: bun test tests/driver-finish-exact.test.ts
 */

import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DRIVER_PLATFORM_RATE,
  formatDuration,
  settleTrip,
} from "../src/lib/driver.ts";

const ridesSource = readFileSync(
  new URL("../src/convex/rides.ts", import.meta.url),
  "utf8",
);

const breakdown = {
  baseFare: 60,
  distanceFee: 80,
  stopFee: 0,
  surgeFee: 14,
  tax: 0,
  total: 154,
  taxRatePct: 0,
};

test("there is no platform fee to collect", () => {
  expect(DRIVER_PLATFORM_RATE).toBe(0);
});

test("the rider's take-home is the exact fare, with nothing withheld", () => {
  const settlement = settleTrip(breakdown, 154);

  expect(settlement.exactAmount).toBe(true);
  expect(settlement.commission).toBe(0);
  expect(settlement.net).toBe(154);
  expect(settlement.net).toBe(settlement.total);
});

test("the receipt still carries the commuter-facing lines", () => {
  const settlement = settleTrip(breakdown, 154);

  expect(settlement.baseFare).toBe(60);
  expect(settlement.distanceFee).toBe(80);
  expect(settlement.stopFee).toBe(0);
  expect(settlement.subtotal).toBe(140);
  expect(settlement.surgeFee).toBe(14);
});

test("a ride with no breakdown still pays the exact fare", () => {
  const settlement = settleTrip(null, 120);

  expect(settlement.exactAmount).toBe(true);
  expect(settlement.total).toBe(120);
  expect(settlement.gross).toBe(120);
  expect(settlement.commission).toBe(0);
  expect(settlement.net).toBe(120);
});

test("a ride booked as a pasugo errand collects its service fee in full too", () => {
  // Pabili and padala pay a store-stop fee on top of the ride. That fee is part
  // of the fare, so it is part of what the rider collects — the exact-amount
  // rule is about deductions, not about which lines exist.
  const errand = { ...breakdown, stopFee: 40, total: 194 };
  const settlement = settleTrip(errand, 194);

  expect(settlement.stopFee).toBe(40);
  expect(settlement.subtotal).toBe(180);
  expect(settlement.net).toBe(194);
});

test("the server takes no cut either, so the two sides cannot disagree", () => {
  // The client constant and the server constant are separate on purpose; this is
  // what keeps them equal. If the server ever started subtracting again while
  // the receipt said otherwise, this fails before a rider does.
  const match = ridesSource.match(/RIDER_PLATFORM_RATE\s*=\s*([0-9.]+)/);
  expect(match).not.toBeNull();
  expect(Number(match![1])).toBe(DRIVER_PLATFORM_RATE);
  expect(Number(match![1])).toBe(0);
});

test("the platform-fee line is omitted from the rider receipt, not shown as zero", () => {
  // The screen branches on `exactAmount`; a "Platform fee (0%) −₱0.00" row reads
  // as a miscalculation rather than as the absence of a fee.
  const rideScreen = readFileSync(
    new URL("../src/pages/RiderRide.tsx", import.meta.url),
    "utf8",
  );
  expect(rideScreen).toContain("settlement.exactAmount ? null : (");
  expect(rideScreen).toContain("formatPeso(settlement.net)");
});

test("an invalid rate argument does not reintroduce a deduction", () => {
  const settlement = settleTrip(null, 100, Number.NaN);

  expect(settlement.exactAmount).toBe(true);
  expect(settlement.platformRate).toBe(DRIVER_PLATFORM_RATE);
  expect(settlement.net).toBe(100);
});

test("a non-zero rate still splits the fare, so the helper stays correct", () => {
  const settlement = settleTrip(breakdown, 154, 0.15);

  expect(settlement.exactAmount).toBe(false);
  expect(settlement.platformRate).toBe(0.15);
  expect(settlement.gross).toBe(154);
  expect(settlement.commission).toBe(23.1);
  expect(settlement.net).toBe(130.9);
});

test("duration formatting still rounds trip length to minutes and hours", () => {
  expect(formatDuration(90_000)).toBe("2 min");
  expect(formatDuration(59 * 60_000)).toBe("59 min");
  expect(formatDuration(60 * 60_000)).toBe("1 hr 0 min");
  expect(formatDuration(95 * 60_000)).toBe("1 hr 35 min");
  expect(formatDuration(-1)).toBe("0 min");
});
