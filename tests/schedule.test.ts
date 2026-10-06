/**
 * Booking ahead: the time rules.
 *
 * A scheduled ride is one ride with an extra fact on it, and that fact is
 * checked in three places. These are the numbers they all agree on.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  isRiderVisibleNow,
  MAX_SCHEDULE_AHEAD_MS,
  MIN_SCHEDULE_LEAD_MS,
  normalizeScheduledFor,
  RIDER_VISIBILITY_WINDOW_MS,
} from "../src/lib/schedule.ts";

const NOW = Date.UTC(2026, 0, 15, 9, 0, 0);

test("no chosen time means book it now", () => {
  expect(normalizeScheduledFor(null, NOW)).toBeNull();
  expect(normalizeScheduledFor(undefined, NOW)).toBeNull();
  expect(normalizeScheduledFor("", NOW)).toBeNull();
});

test("a sensible time is kept exactly as chosen", () => {
  const at = NOW + 4 * 60 * 60 * 1000;
  expect(normalizeScheduledFor(at, NOW)).toBe(at);
  // ISO strings from a datetime input parse the same way numbers do.
  const iso = new Date(at).toISOString();
  expect(normalizeScheduledFor(iso, NOW)).toBe(at);
});

test("a time that cannot be honoured books the ride now instead", () => {
  // Past, too soon, and too far out all mean the same thing to a rider: go now.
  expect(normalizeScheduledFor(NOW - 1000, NOW)).toBeNull();
  expect(normalizeScheduledFor(NOW + MIN_SCHEDULE_LEAD_MS - 1, NOW)).toBeNull();
  expect(normalizeScheduledFor(NOW + MAX_SCHEDULE_AHEAD_MS + 1, NOW)).toBeNull();
  expect(normalizeScheduledFor("not a date", NOW)).toBeNull();
  expect(normalizeScheduledFor(Number.NaN, NOW)).toBeNull();
  expect(normalizeScheduledFor(Number.POSITIVE_INFINITY, NOW)).toBeNull();
});

test("the boundaries themselves are allowed", () => {
  // One millisecond either side of each limit flips the answer, so the limits
  // are where they are said to be.
  expect(normalizeScheduledFor(NOW + MIN_SCHEDULE_LEAD_MS, NOW)).toBe(
    NOW + MIN_SCHEDULE_LEAD_MS,
  );
  expect(normalizeScheduledFor(NOW + MAX_SCHEDULE_AHEAD_MS, NOW)).toBe(
    NOW + MAX_SCHEDULE_AHEAD_MS,
  );
});

test("an unscheduled ride is on offer to riders immediately", () => {
  expect(isRiderVisibleNow(null, NOW)).toBe(true);
  expect(isRiderVisibleNow(undefined, NOW)).toBe(true);
});

test("a scheduled ride joins the rider list one hour before pickup", () => {
  const at = NOW + 5 * 60 * 60 * 1000;
  // Still five hours out: not this rider's problem yet.
  expect(isRiderVisibleNow(at, NOW)).toBe(false);
  // The window opens exactly an hour ahead.
  expect(
    isRiderVisibleNow(at, at - RIDER_VISIBILITY_WINDOW_MS),
  ).toBe(true);
  expect(
    isRiderVisibleNow(at, at - RIDER_VISIBILITY_WINDOW_MS - 1),
  ).toBe(false);
  // And never closes again: a rider who was late to the list still sees it.
  expect(isRiderVisibleNow(at, at + 60 * 60 * 1000)).toBe(true);
});
