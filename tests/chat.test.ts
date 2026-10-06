/**
 * Chat message rules.
 *
 * The send path is the only place a stranger's text enters the database, so the
 * normalisation and length cap are pinned here. Kept in lib/chat.ts precisely
 * so this suite can reach them without a Convex runtime.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  MAX_MESSAGE_LENGTH,
  MAX_THREAD_MESSAGES,
  normalizeMessage,
  quickRepliesFor,
  systemLineFor,
} from "../src/convex/lib/chat.ts";

test("a message is trimmed before it is stored", () => {
  expect(normalizeMessage("  gate is closed  ")).toBe("gate is closed");
  expect(normalizeMessage("line one\nline two")).toBe("line one\nline two");
  // Only the outside is trimmed: inner spacing is the sender's business.
  expect(normalizeMessage(" bring  the  eggs ")).toBe("bring  the  eggs");
});

test("empty or whitespace-only messages are refused", () => {
  expect(() => normalizeMessage("")).toThrow(/Type a message/);
  expect(() => normalizeMessage("   ")).toThrow(/Type a message/);
  expect(() => normalizeMessage("\n\t  ")).toThrow(/Type a message/);
  expect(() => normalizeMessage(undefined)).toThrow(/Type a message/);
});

test("the length cap is enforced after trimming, not before", () => {
  const atCap = "a".repeat(MAX_MESSAGE_LENGTH);
  expect(normalizeMessage(atCap)).toBe(atCap);
  expect(() => normalizeMessage("a".repeat(MAX_MESSAGE_LENGTH + 1))).toThrow(
    /Keep it under 500 characters/,
  );
  // Padding must not push an otherwise valid message over the line.
  expect(normalizeMessage(`  ${atCap}  `)).toBe(atCap);
});

test("the caps are sized for a phone screen and a long trip", () => {
  expect(MAX_MESSAGE_LENGTH).toBe(500);
  expect(MAX_THREAD_MESSAGES).toBe(200);
});

test("a rider gets the rider's sentences, a commuter the passenger's", () => {
  // "I have arrived" and "I need cash" are the rider's business to say; asking
  // a commuter "do you need cash to pay for the items" would be nonsense.
  const rider = quickRepliesFor("rider").map((reply) => reply.label);
  const commuter = quickRepliesFor("commuter").map((reply) => reply.label);
  expect(rider).toContain("Arrived");
  expect(rider).toContain("Need payment");
  expect(commuter).not.toContain("Need payment");
  expect(commuter).toContain("Please call");
});

test("an unknown audience reads the passenger's buttons", () => {
  // The safe direction again: a rider who briefly sees the commuter's set can
  // still send every one of them.
  expect(quickRepliesFor(null)).toEqual(quickRepliesFor("commuter"));
  expect(quickRepliesFor(undefined)).toEqual(quickRepliesFor("commuter"));
  expect(quickRepliesFor("admin")).toEqual(quickRepliesFor("commuter"));
});

test("every quick reply is a message the send path would accept", () => {
  // The chips call the same mutation as the composer, so one that the
  // normaliser rejects would be a button that silently does nothing.
  for (const reply of [...quickRepliesFor("rider"), ...quickRepliesFor("commuter")]) {
    expect(normalizeMessage(reply.body)).toBe(reply.body);
    expect(reply.body.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
  }
});

test("the ride writes a line for every status a thread can reach", () => {
  expect(systemLineFor("SEARCHING")).toBe("Request sent. Looking for a rider.");
  expect(systemLineFor("ACCEPTED")).toBe("A rider accepted your request.");
  expect(systemLineFor("RIDER_ARRIVED")).toBe("Your rider has arrived.");
  expect(systemLineFor("COMPLETED")).toBe("Ride completed.");
  expect(systemLineFor("CANCELLED")).toBe("This ride was cancelled.");
});

test("an unrecognised status writes no line at all", () => {
  // Returning the raw status would put a code in the middle of a conversation
  // two people are having. Nothing is the better answer.
  expect(systemLineFor("SOMETHING_NEW")).toBeNull();
  expect(systemLineFor("")).toBeNull();
});