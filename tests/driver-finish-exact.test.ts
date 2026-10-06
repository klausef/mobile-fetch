/**
 * The rider-finish settlement path when the rider collects the exact amount.
 *
 * This is the behavioral guard for the "no platform fee, no tax deduction"
 * rule on the rider side. It is separate from the fare-floor tests that
 * already live in `tests/driver-flow.test.ts`, because the fare-floor change
 * was about the commuter-facing quote, while this one is about what the rider
 * takes home at the end of a trip.
 *
 * The old commission path is still exercised here too, because the settlement
 * helper has to keep working for any screen that has not moved to the new rule
 * yet. The two paths are the only thing this file cares about.
 *
 * Run: bun test tests/driver-finish-exact.test.ts
 */

import { test, expect } from "bun:test";
import {
  DRIVER_PLATFORM_RATE,
  formatDuration,
  settleTrip,
} from "../src/lib/driver.ts";

test("the settlement helper still exposes the old platform rate constant", () => {
  expect(DRIVER_PLATFORM_RATE).toBe(0.15);
});

test("the exact-amount rule returns the full fare as the rider's take-home", () => {
  const breakdown = {
    baseFare: 60,
    distanceFee: 80,
    stopFee: 0,
    surgeFee: 14,
    tax: 18.48,
    total: 172.48,
    taxRatePct: 12,
  };

  const settlement = settleTrip(breakdown, 172.48, 0);

  expect(settlement.exactAmount).toBe(true);
  expect(settlement.platformRate).toBe(0);
  expect(settlement.subtotal).toBe(140);
  expect(settlement.total).toBe(172.48);
  expect(settlement.gross).toBe(172.48);
  expect(settlement.commission).toBe(0);
  expect(settlement.net).toBe(172.48);
});

test("the exact-amount rule still keeps the breakdown lines for a receipt", () => {
  const breakdown = {
    baseFare: 60,
    distanceFee: 80,
    stopFee: 0,
    surgeFee: 14,
    tax: 18.48,
    total: 172.48,
    taxRatePct: 12,
  };

  const settlement = settleTrip(breakdown, 172.48, 0);

  expect(settlement.baseFare).toBe(60);
  expect(settlement.distanceFee).toBe(80);
  expect(settlement.stopFee).toBe(0);
  expect(settlement.surgeFee).toBe(14);
});

test("a flat fare with no breakdown still returns the full fare under the exact-amount rule", () => {
  const settlement = settleTrip(null, 120, 0);

  expect(settlement.exactAmount).toBe(true);
  expect(settlement.platformRate).toBe(0);
  expect(settlement.total).toBe(120);
  expect(settlement.gross).toBe(120);
  expect(settlement.commission).toBe(0);
  expect(settlement.net).toBe(120);
});

test("the legacy commission path still splits the fare when the rate is nonzero", () => {
  const breakdown = {
    baseFare: 60,
    distanceFee: 80,
    stopFee: 0,
    surgeFee: 14,
    tax: 18.48,
    total: 172.48,
    taxRatePct: 12,
  };

  const settlement = settleTrip(breakdown, 172.48, 0.15);

  expect(settlement.exactAmount).toBe(false);
  expect(settlement.platformRate).toBe(0.15);
  expect(settlement.subtotal).toBe(140);
  expect(settlement.gross).toBe(154);
  expect(settlement.commission).toBe(23.1);
  expect(settlement.net).toBe(130.9);
  expect(settlement.total).toBe(172.48);
});

test("the legacy commission path still works for a flat fare with no breakdown", () => {
  const settlement = settleTrip(null, 120, 0.15);

  expect(settlement.exactAmount).toBe(false);
  expect(settlement.platformRate).toBe(0.15);
  expect(settlement.gross).toBe(120);
  expect(settlement.commission).toBe(18);
  expect(settlement.net).toBe(102);
  expect(settlement.total).toBe(120);
});

test("an invalid platform rate falls back to the default legacy rate", () => {
  const settlement = settleTrip(null, 100, Number.NaN);

  expect(settlement.exactAmount).toBe(false);
  expect(settlement.platformRate).toBe(DRIVER_PLATFORM_RATE);
  expect(settlement.net).toBe(85);
});

test("duration formatting still rounds trip length to minutes and hours", () => {
  expect(formatDuration(90_000)).toBe("2 min");
  expect(formatDuration(59 * 60_000)).toBe("59 min");
  expect(formatDuration(60 * 60_000)).toBe("1 hr 0 min");
  expect(formatDuration(95 * 60_000)).toBe("1 hr 35 min");
  expect(formatDuration(-1)).toBe("0 min");
});
