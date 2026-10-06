/**
 * The account card's two bits of wording.
 *
 * The account moved out of the header dropdown and into a card at the bottom of
 * each dashboard, which makes it the only place a rider can see their own name
 * or sign out. Two failure modes matter and neither throws:
 *
 * - a blank avatar, when the profile row has not loaded yet or the person gave
 *   a one-word name, so initials() must always return something visible;
 * - a role label that leaks the internal enum ("commuter") or vanishes when
 *   the role is momentarily unknown.
 *
 * Run: bun test
 */
import { test, expect } from "bun:test";
import { initials, roleLabel } from "../src/lib/account.ts";

test("initials come from the first and last word", () => {
  // First + last, the way a phone contact list does it: a Filipino name is
  // usually "given middle surname", so taking the first two words would give
  // "JD" (dela) and miss the surname people actually recognise.
  expect(initials("Jose dela Cruz")).toBe("JC");
  expect(initials("Maria Victoria Sawit")).toBe("MS");
});

test("a one-word name still gets two letters", () => {
  // Slicing a single letter would render a noticeably lopsided circle.
  expect(initials("JR")).toBe("JR");
  expect(initials("Juanito")).toBe("JU");
});

test("a missing name renders a visible placeholder, never nothing", () => {
  // The profile is a reactive query, so the first paint legitimately has no
  // name. An empty span would collapse the avatar to a dot.
  expect(initials(undefined)).toBe("?");
  expect(initials(null)).toBe("?");
  expect(initials("")).toBe("?");
  expect(initials("   ")).toBe("?");
});

test("surrounding and repeated whitespace does not eat a letter", () => {
  expect(initials("  Jose   dela   Cruz  ")).toBe("JC");
});

test("lowercase names are upper-cased", () => {
  expect(initials("jose dela cruz")).toBe("JC");
});

test("roles are described in words, not enum values", () => {
  expect(roleLabel("commuter")).toBe("Riding with Fetch");
  expect(roleLabel("rider")).toBe("Driving with Fetch");
  expect(roleLabel("admin")).toBe("Fetch team");
});

test("an unknown or missing role falls back instead of rendering blank", () => {
  expect(roleLabel(null)).toBe("Signed in");
  expect(roleLabel(undefined)).toBe("Signed in");
  expect(roleLabel("superadmin")).toBe("Signed in");
});
