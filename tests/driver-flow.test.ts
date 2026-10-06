/**
 * The rider's arithmetic.
 *
 * The driver screens are the one place where a number being wrong costs a
 * person money at the roadside: a fare breakdown that does not add up, an ETA
 * that runs backwards, a countdown that never ends. None of that is visible in
 * a screenshot, so the rules are pinned here.
 *
 * Also checked: the platform rate the client believes matches the one the
 * server charges with. The two are deliberately separate constants — importing
 * the Convex module into the bundle would drag the server runtime in with it —
 * so this suite is what keeps them from drifting.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DRIVER_PLATFORM_RATE,
  REQUEST_TIMEOUT_MS,
  demandCells,
  demandHeadline,
  driverStage,
  etaMinutesFrom,
  formatCountdown,
  formatDuration,
  isRequestExpired,
  remainingMs,
  settleTrip,
  tripDurationMs,
} from "../src/lib/driver.ts";

const ridesSource = readFileSync(
  new URL("../src/convex/rides.ts", import.meta.url),
  "utf8",
);

test("every ride status maps to exactly one driver screen", () => {
  expect(driverStage("ACCEPTED")).toBe("to_pickup");
  expect(driverStage("RIDER_ARRIVING")).toBe("to_pickup");
  expect(driverStage("RIDER_ARRIVED")).toBe("at_pickup");
  expect(driverStage("IN_PROGRESS")).toBe("in_trip");
  expect(driverStage("COMPLETED")).toBe("done");
  expect(driverStage("CANCELLED")).toBe("done");
  // A status the client has never heard of must not strand the rider on a
  // stage they can never leave; "done" is the safe terminal.
  expect(driverStage("SOMETHING_NEW")).toBe("done");
});

test("the platform rate the client shows matches the one the server charges", () => {
  const match = ridesSource.match(/RIDER_PLATFORM_RATE\s*=\s*([0-9.]+)/);
  expect(match).not.toBeNull();
  expect(Number(match![1])).toBe(DRIVER_PLATFORM_RATE);
});

test("the request window is the fifteen seconds the UI promises", () => {
  expect(REQUEST_TIMEOUT_MS).toBe(15_000);
});

test("a countdown reads as M:SS and never runs past zero", () => {
  expect(formatCountdown(15_000)).toBe("0:15");
  expect(formatCountdown(9_400)).toBe("0:10");
  expect(formatCountdown(65_000)).toBe("1:05");
  expect(formatCountdown(0)).toBe("0:00");
  expect(formatCountdown(-500)).toBe("0:00");
  expect(formatCountdown(Number.NaN)).toBe("0:00");
});

test("a request expires at its deadline, and ties count as expired", () => {
  const deadline = 1_000_000;
  expect(remainingMs(deadline, deadline - 5_000)).toBe(5_000);
  expect(isRequestExpired(deadline, deadline - 1)).toBe(false);
  expect(isRequestExpired(deadline, deadline)).toBe(true);
  expect(isRequestExpired(deadline, deadline + 10_000)).toBe(true);
  // A missing deadline must not read as "forever".
  expect(isRequestExpired(Number.NaN, Date.now())).toBe(true);
});

test("an ETA is at least a minute and scales with distance", () => {
  expect(etaMinutesFrom(0)).toBe(0);
  expect(etaMinutesFrom(-3)).toBe(0);
  // 11 km at the shared 22 km/h average is half an hour.
  expect(etaMinutesFrom(11, 22)).toBe(30);
  // Anything non-trivial rounds up to a whole minute rather than to zero.
  expect(etaMinutesFrom(0.1, 22)).toBe(1);
  // A broken speed falls back to the shared average instead of dividing by it.
  expect(etaMinutesFrom(11, 0)).toBe(30);
});

test("a trip duration is null until both ends exist", () => {
  expect(tripDurationMs(undefined, 5_000)).toBeNull();
  expect(tripDurationMs(1_000, undefined)).toBeNull();
  expect(tripDurationMs(1_000, 5_000)).toBe(4_000);
  // A clock that went backwards is a duration of zero, not a negative one.
  expect(tripDurationMs(5_000, 1_000)).toBe(0);
});

test("durations read as minutes, then hours and minutes", () => {
  expect(formatDuration(90_000)).toBe("2 min");
  expect(formatDuration(59 * 60_000)).toBe("59 min");
  expect(formatDuration(60 * 60_000)).toBe("1 hr 0 min");
  expect(formatDuration(95 * 60_000)).toBe("1 hr 35 min");
  expect(formatDuration(-1)).toBe("0 min");
});

test("a settlement's lines add up to its own net figure", () => {
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
  // The rider's payout is the fare the server stored, less the platform cut.
  expect(settlement.net + settlement.commission).toBe(154);
});

test("a ride with no breakdown still pays the rider its flat fare", () => {
  const settlement = settleTrip(null, 120, 0.15);
  expect(settlement.gross).toBe(120);
  expect(settlement.commission).toBe(18);
  expect(settlement.net).toBe(102);
  expect(settlement.total).toBe(120);
});

test("a nonsense platform rate falls back rather than eating the fare", () => {
  // The fallback is the live rate, and the live rate is 0: FETCH takes no
  // platform fee, so a broken argument must not reintroduce a cut the product
  // no longer takes. The rider is handed the whole fare.
  expect(DRIVER_PLATFORM_RATE).toBe(0);
  expect(settleTrip(null, 100, Number.NaN).net).toBe(100);
  expect(settleTrip(null, 100, Number.NaN).commission).toBe(0);
  expect(settleTrip(null, 100, Number.NaN).platformRate).toBe(
    DRIVER_PLATFORM_RATE,
  );
});

test("the rider collects the exact fare when no rate is named", () => {
  // No commission argument, no deduction: the default settlement pays the
  // whole fare, which is what makes the receipt and the cash agree.
  const breakdown = {
    baseFare: 60,
    distanceFee: 80,
    stopFee: 0,
    surgeFee: 14,
    tax: 0,
    total: 154,
    taxRatePct: 0,
  };
  const settlement = settleTrip(breakdown, 154);
  expect(settlement.exactAmount).toBe(true);
  expect(settlement.commission).toBe(0);
  expect(settlement.net).toBe(154);
  // The fare the server stored is what the rider is handed, down to the peso.
  expect(settlement.net).toBe(settlement.total);
});

test("nearby demand collapses into one heavy cell", () => {
  const cells = demandCells(
    [
      { lat: 8.151, lng: 125.131 },
      { lat: 8.152, lng: 125.132 },
      { lat: 8.1515, lng: 125.1315 },
    ],
    0.01,
  );
  expect(cells).toHaveLength(1);
  expect(cells[0].weight).toBe(3);
});

test("demand cells are heaviest first and ignore broken points", () => {
  const cells = demandCells(
    [
      { lat: 8.15, lng: 125.13 },
      { lat: 8.155, lng: 125.135 },
      { lat: 9.5, lng: 126.5 },
      { lat: 9.5, lng: 126.5 },
      { lat: Number.NaN, lng: 125 },
    ],
    0.01,
  );
  expect(cells).toHaveLength(3);
  expect(cells[0].weight).toBe(2);
  expect(cells[0].lat).toBeCloseTo(9.5, 5);
  expect(demandCells([])).toEqual([]);
});

test("the busy-area headline needs repetition to mean anything", () => {
  expect(demandHeadline([])).toBeNull();
  expect(demandHeadline([{ lat: 8, lng: 125, weight: 1 }])).toBeNull();
  expect(demandHeadline([{ lat: 8, lng: 125, weight: 4 }])).toContain("4");
});
