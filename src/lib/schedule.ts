/**
 * Booking a ride for later, rather than now.
 *
 * A scheduled request is the same ride with one extra fact — the time the
 * commuter wants to be picked up — and that fact has to mean something to
 * three different people: the commuter who booked it, the rider scanning for
 * work, and the Activity list it has to sit sensibly in. The rules live here so
 * all three read the same numbers.
 */

/** How far ahead a booking can be made. Beyond a week it is a different product. */
export const MAX_SCHEDULE_AHEAD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Lead time on a scheduled booking.
 *
 * Fifteen minutes is the gap between "I'll go in a bit" and "we are already
 * outside". A request for less than that is a request for now, so it is
 * refused rather than silently treated as immediate.
 */
export const MIN_SCHEDULE_LEAD_MS = 15 * 60 * 1000;

/**
 * How long before pickup a rider sees the request.
 *
 * An hour is long enough to plan a route and short enough that the request is
 * still in the future when it is accepted. A request for Friday morning would
 * otherwise sit in Tuesday's list and be taken on Wednesday.
 */
export const RIDER_VISIBILITY_WINDOW_MS = 60 * 60 * 1000;

/**
 * Read a chosen pickup time, or nothing.
 *
 * Returns null for a booking with no chosen time and for one that cannot
 * honestly be honoured — a time in the past, less than the lead time away, or
 * more than a week out. Null means "book it now", which is the safe reading of
 * a time we do not trust.
 */
export function normalizeScheduledFor(
  raw: number | string | null | undefined,
  now: number,
): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const at = typeof raw === "number" ? raw : Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  if (at < now + MIN_SCHEDULE_LEAD_MS) return null;
  if (at > now + MAX_SCHEDULE_AHEAD_MS) return null;
  return Math.round(at);
}

/**
 * Whether a ride is on offer to riders yet.
 *
 * An unscheduled ride always is. A scheduled one joins the list when its window
 * opens, which is what stops a rider taking Friday's trip on Tuesday.
 */
export function isRiderVisibleNow(
  scheduledFor: number | null | undefined,
  now: number,
): boolean {
  if (scheduledFor == null) return true;
  return scheduledFor <= now + RIDER_VISIBILITY_WINDOW_MS;
}

/**
 * "Today 5:30 PM", the way the Activity list reads.
 *
 * Relative to the day it is actually on, not the day it was booked: a trip made
 * on Sunday for Tuesday must not say "Today".
 */
export function scheduleLabel(
  scheduledFor: number | null | undefined,
  now: number,
): string {
  if (scheduledFor == null) return "Now";
  const at = new Date(scheduledFor);
  const time = at.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const days = Math.round(
    (new Date(scheduledFor).setHours(0, 0, 0, 0) - startOfToday.getTime()) /
      (24 * 60 * 60 * 1000),
  );
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days < 7) {
    return `${at.toLocaleDateString("en-PH", { weekday: "long" })} ${time}`;
  }
  return `${at.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
  })} ${time}`;
}
