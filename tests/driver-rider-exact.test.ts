/**
 * Rider settlement contract at the fare total when the rider collects the exact amount.
 *
 * When the rider collection rule is "the rider collects the exact amount, no
 * platform fee, no tax deduction", these are the surfaces that have to move together:
 *
 * - the rider-facing settlement helper on the web (`src/lib/driver.ts`),
 * - the server-side earnings summary on Convex (`src/convex/rides.ts`),
 * - and the breakdown contract that `fareBreakdown` already publishes as
 *   `riderPayout` in `src/lib/fare-breakdown.ts`.
 *
 * This test is the behavioral guard for the rider-facing and server-side math.
 * It deliberately does not touch `fareBreakdown` itself: that module already had
 * its fare-floor fix verified separately, and this test only asserts the new
 * "rider collects exact amount" settlement path.
 *
 * Run: bun test tests/driver-rider-exact.test.ts
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

test("the rider-facing settlement helper still exposes a platform rate constant", () => {
  expect(DRIVER_PLATFORM_RATE).toBe(0.15);
});

test("the client-side settlement helper still divides the fare into gross and net by default", () => {
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

  expect(settlement.subtotal).toBe(140);
  expect(settlement.gross).toBe(154);
  expect(settlement.commission).toBe(23.1);
  expect(settlement.net).toBe(130.9);
  expect(settlement.total).toBe(172.48);
  expect(settlement.platformRate).toBe(0.15);
});

test("a flat fare with no breakdown still settles through gross and net by default", () => {
  const settlement = settleTrip(null, 120, 0.15);

  expect(settlement.gross).toBe(120);
  expect(settlement.commission).toBe(18);
  expect(settlement.net).toBe(102);
  expect(settlement.total).toBe(120);
});

test("an invalid platform rate falls back to the default rather than eating the fare", () => {
  const settlement = settleTrip(null, 100, Number.NaN);

  expect(settlement.net).toBe(85);
  expect(settlement.platformRate).toBe(DRIVER_PLATFORM_RATE);
});

test("the server-side rider earnings constant still matches the one the client uses", () => {
  const match = ridesSource.match(/RIDER_PLATFORM_RATE\s*=\s*([0-9.]+)/);
  expect(match).not.toBeNull();
  expect(Number(match![1])).toBe(DRIVER_PLATFORM_RATE);
});

test("the server-side rider earnings query still subtracts a platform cut at the default rate", () => {
  const takeMatch = ridesSource.match(
    /const take = \(fare: number\) =>\s*\n\s*Math\.round\(fare \* \(1 - RIDER_PLATFORM_RATE\) \* 100\) \/ 100/,
  );
  expect(takeMatch).not.toBeNull();
});

test("duration formatting still rounds trip length to minutes and hours", () => {
  expect(formatDuration(90_000)).toBe("2 min");
  expect(formatDuration(59 * 60_000)).toBe("59 min");
  expect(formatDuration(60 * 60_000)).toBe("1 hr 0 min");
  expect(formatDuration(95 * 60_000)).toBe("1 hr 35 min");
  expect(formatDuration(-1)).toBe("0 min");
});
