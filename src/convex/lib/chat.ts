/**
 * Chat rules, kept dependency-free so the send path and the test suite share
 * one definition.
 */

/** Long enough for "gate is closed, use the back gate", short enough for a phone. */
export const MAX_MESSAGE_LENGTH = 500;

/** Only the most recent messages are kept in the thread. */
export const MAX_THREAD_MESSAGES = 200;

/** Trimmed message text, or an error explaining why it was rejected. */
export function normalizeMessage(raw: string | undefined): string {
  const body = (raw ?? "").trim();
  if (!body) {
    throw new Error("Type a message first.");
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Keep it under ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return body;
}

/**
 * The sentences a rider and a commuter actually send each other.
 *
 * These are the questions that get asked by typing on a phone with one hand on
 * a helmet handlebar: where are you, what should I buy, I am not there yet.
 * Offering them as taps instead of typing keeps the thread short, which is what
 * makes it worth reading at all. They are suggestions, not a fixed vocabulary —
 * the composer stays free text.
 */
export type QuickReply = { label: string; body: string };

/** Asked of the rider, so the words are the commuter's. */
export const COMMUTER_QUICK_REPLIES: QuickReply[] = [
  { label: "On my way", body: "I am on my way to the pickup point." },
  { label: "Please call", body: "Please call me when you arrive." },
  { label: "Change the pin", body: "I pinned the wrong spot. Can you adjust?" },
  { label: "Running late", body: "I am running a few minutes late." },
];

/** Asked of the commuter, so the words are the rider's. */
export const RIDER_QUICK_REPLIES: QuickReply[] = [
  { label: "On my way", body: "I am on my way to the pickup point." },
  { label: "Arrived", body: "I have arrived at the pickup point." },
  { label: "No stock", body: "The store does not have that item in stock." },
  { label: "Need payment", body: "I need cash to pay for the items." },
];

/**
 * The taps for one audience.
 *
 * Unknown or missing roles get the passenger's set: a rider who briefly sees a
 * commuter's phrasing still understands it, and the sets are near-identical
 * anyway — only "arrived" and "need payment" are the rider's business.
 */
export function quickRepliesFor(
  audience: string | null | undefined,
): QuickReply[] {
  return audience === "rider" ? RIDER_QUICK_REPLIES : COMMUTER_QUICK_REPLIES;
}

/**
 * The one line the ride itself writes into the thread.
 *
 * Notifications are the platform talking at somebody; a thread is two people
 * talking to each other. Without this, "your rider has arrived" and the reply
 * that follows it look like they came from nowhere.
 */
export function systemLineFor(status: string): string | null {
  const lines: Record<string, string> = {
    SEARCHING: "Request sent. Looking for a rider.",
    ACCEPTED: "A rider accepted your request.",
    RIDER_ARRIVING: "Your rider is on the way.",
    RIDER_ARRIVED: "Your rider has arrived.",
    IN_PROGRESS: "On the way to your destination.",
    COMPLETED: "Ride completed.",
    CANCELLED: "This ride was cancelled.",
  };
  return lines[status] ?? null;
}