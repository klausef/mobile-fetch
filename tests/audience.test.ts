/**
 * Who a Super Admin broadcast reaches, and who is allowed to act as a rider.
 *
 * Both rules were extracted out of lib/db.ts so they can be asserted without a
 * live Convex deployment. That matters: the audience mapping is the difference
 * between "every rider hears their fare changed" and "nobody does", and it is
 * exactly the kind of rule that silently regresses.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import {
  MAX_BROADCAST_RECIPIENTS,
  riderApprovalSatisfied,
  selectBroadcastRecipients,
} from "../src/convex/lib/audience.ts";

const commuter = (id: string) => ({ userId: id, role: "commuter" });
const rider = (id: string) => ({ userId: id, role: "rider" });
const admin = (id: string) => ({ userId: id, role: "admin" });

const CROWD = [
  commuter("c1"),
  rider("r1"),
  rider("r2"),
  admin("a1"),
  commuter("c2"),
];

test("everyone reaches a broadcast addressed to all", () => {
  const recipients = selectBroadcastRecipients(CROWD, "all", "sender");
  expect(recipients.sort()).toEqual(["a1", "c1", "c2", "r1", "r2"]);
});

test("the admin role is included in an all broadcast", () => {
  // Super Admins are people too; leaving them out would mean the console's own
  // operator misses a fare change they made.
  expect(selectBroadcastRecipients(CROWD, "all", "sender")).toContain("a1");
});

test("a riders-only broadcast skips commuters", () => {
  const recipients = selectBroadcastRecipients(CROWD, "riders", "sender");
  expect(recipients.sort()).toEqual(["r1", "r2"]);
  expect(recipients).not.toContain("c1");
});

test("a commuters-only broadcast skips riders", () => {
  const recipients = selectBroadcastRecipients(CROWD, "commuters", "sender");
  expect(recipients.sort()).toEqual(["c1", "c2"]);
});

test("the audience names are plural but the roles are singular", () => {
  // A straight `p.role === audience` comparison silently matches nothing. This
  // is the regression that comparison invites.
  expect(selectBroadcastRecipients(CROWD, "riders", "sender")).not.toEqual([]);
  expect(selectBroadcastRecipients(CROWD, "commuters", "sender")).not.toEqual([]);
});

test("the sender does not receive their own message", () => {
  // They just read it on screen; a notification for yourself reads as a
  // delivery bug.
  expect(selectBroadcastRecipients(CROWD, "all", "a1")).not.toContain("a1");
  expect(selectBroadcastRecipients(CROWD, "all", "a1")).toHaveLength(4);
});

test("the sender is excluded even when they match the audience", () => {
  const crowd = [...CROWD, rider("r1")];
  const recipients = selectBroadcastRecipients(crowd, "riders", "r1");
  expect(recipients).toEqual(["r2"]);
});

test("a user with two profiles is notified once, not twice", () => {
  const duplicated = [rider("r1"), commuter("r1"), rider("r2")];
  expect(selectBroadcastRecipients(duplicated, "all", "s").sort()).toEqual([
    "r1",
    "r2",
  ]);
});

test("de-duplication happens before the cap, not after", () => {
  // 600 people, each holding two profiles. Correct behaviour yields exactly the
  // cap of 500 distinct ids. Slicing first would take the first 500 *rows*,
  // which are only 250 people, and silently drop 350 of them.
  const many: Array<{ userId: string; role: string }> = [];
  for (let i = 0; i < 600; i += 1) {
    many.push(rider(`r${i}`), commuter(`r${i}`));
  }
  const recipients = selectBroadcastRecipients(many, "all", "s");
  expect(recipients).toHaveLength(MAX_BROADCAST_RECIPIENTS);
  expect(new Set(recipients).size).toBe(MAX_BROADCAST_RECIPIENTS);
});

test("the recipient count is capped", () => {
  const many = Array.from({ length: MAX_BROADCAST_RECIPIENTS + 25 }, (_, i) =>
    commuter(`c${i}`),
  );
  expect(selectBroadcastRecipients(many, "all", "s")).toHaveLength(
    MAX_BROADCAST_RECIPIENTS,
  );
});

test("an audience with no members sends to nobody without erroring", () => {
  expect(selectBroadcastRecipients([], "all", "s")).toEqual([]);
  expect(selectBroadcastRecipients([commuter("c1")], "riders", "s")).toEqual([]);
});

/**
 * The guest exemption: a throwaway session must not be stranded on an approval
 * screen it can never leave, but a real unapproved rider still must not carry
 * passengers.
 */
test("an approved rider may operate, guest or not", () => {
  expect(riderApprovalSatisfied("APPROVED", false)).toBe(true);
  expect(riderApprovalSatisfied("APPROVED", true)).toBe(true);
});

test("a pending real rider is held back", () => {
  // This is the rule the whole approval queue exists to enforce.
  expect(riderApprovalSatisfied("PENDING", false)).toBe(false);
  expect(riderApprovalSatisfied("SUSPENDED", false)).toBe(false);
  expect(riderApprovalSatisfied("REJECTED", false)).toBe(false);
});

test("a guest rider skips the wait", () => {
  expect(riderApprovalSatisfied("PENDING", true)).toBe(true);
  expect(riderApprovalSatisfied("REJECTED", true)).toBe(true);
});

test("a missing rider record is never approving", () => {
  // "Truthy guest" would pass here if the record lookup were skipped upstream.
  expect(riderApprovalSatisfied(undefined, true)).toBe(false);
  expect(riderApprovalSatisfied(null, true)).toBe(false);
});