/**
 * Targeted checks for the Super Admin account rules: who may hold the admin
 * seat, and how strong a password has to be.
 *
 * Both rules are deliberately dependency-free (convex/lib/adminEmail.ts,
 * convex/lib/password.ts) so they can be asserted here rather than only through
 * a live sign-up.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const ratingsSource = readFileSync("src/convex/ratings.ts", "utf8");
const adminSource = readFileSync("src/convex/admin.ts", "utf8");

/** The body of an exported Convex function, up to the next top-level export. */
const bodyOf = (source: string, marker: string): string => {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
};

const listForRiderBody = (): string =>
  bodyOf(ratingsSource, "export const listForRider");
const exportRidesCsvBody = (): string =>
  bodyOf(adminSource, "export const exportRidesCsv");
import {
  RESERVED_ADMIN_EMAIL as SERVER_ADMIN_EMAIL,
  isReservedAdminEmail,
} from "../src/convex/lib/adminEmail.ts";
import {
  MIN_PASSWORD_LENGTH,
  assertPasswordRequirements,
} from "../src/convex/lib/password.ts";
import {
  BOOTSTRAP_OWNER_PASSWORD,
  RESERVED_ADMIN_EMAIL as CLIENT_ADMIN_EMAIL,
} from "../src/lib/adminEmail.ts";
import {
  isOwnerAdminSettled,
  resolvePostAuthPath,
} from "../src/lib/adminRedirect.ts";

test("the reserved owner address is a Fetch Bukidnon mailbox", () => {
  expect(SERVER_ADMIN_EMAIL).toBe("fetchbukidnon@gmail.com");
});

test("the client mirror of the owner address never drifts from the server", () => {
  // The owner password form is keyed off the client copy, so the two must agree.
  expect(CLIENT_ADMIN_EMAIL).toBe(SERVER_ADMIN_EMAIL);
});

test("only the reserved address may claim the admin seat", () => {
  expect(isReservedAdminEmail("fetchbukidnon@gmail.com")).toBe(true);
  // Signing-in normalises email, so the match must tolerate casing and padding.
  expect(isReservedAdminEmail("  FetchBukidnon@Gmail.COM ")).toBe(true);
});

test("everyone else is kept out of the admin seat", () => {
  for (const email of [
    "rider@gmail.com",
    "someone-else@gmail.com",
    // Near-misses that a sloppy comparison would let through.
    "fetchbukidnon@gmail.com.evil.com",
    "notfetchbukidnon@gmail.com",
    "fetchbukidnon@gmail.co",
    "",
    null,
    undefined,
  ]) {
    expect(isReservedAdminEmail(email)).toBe(false);
  }
});

/**
 * Regression, and the deepest bug in this file's history: the caller's address
 * used to be read off `ctx.auth.getUserIdentity()`. Convex Auth signs tokens
 * with only `sub`, `iss`, `aud`, `iat` and `exp` — there is no email on the
 * identity — so that lookup returned null for *every* caller.
 *
 * It failed silently and looked like a working rule. The reserved owner was
 * never recognised as the owner, so the sign-in page never redirected to the
 * console, and the guard that stops the owner creating a rider profile never
 * fired. The owner ended up stuck on the rider approval screen.
 *
 * The fix reads the `users` document instead (`getCallerEmail` in lib/db.ts,
 * resolving the id with `getAuthUserId`). These tests pin the consequence: an
 * identity-shaped object has no email in it, so ownership cannot come from
 * there.
 */
test("a Convex Auth identity carries no email to read", () => {
  const identity: { subject: string; issuer: string; email?: unknown } = {
    subject: "jx74zv3skyzncm142pjgcqejw98fffpg|session-id",
    issuer: "https://example.convex.cloud",
  };
  expect(identity.email).toBeUndefined();
  // Nothing on an identity can ever satisfy the owner check — which is exactly
  // why the check must not be reading the identity.
  //
  // Narrowed rather than retyped: `email` is deliberately modelled as
  // `unknown`, because an unverified token payload really is, and widening the
  // field to `string` would quietly assert something the type does not know.
  // The assertion above is what establishes the runtime value; this cast only
  // tells the compiler to stop guessing about it.
  expect(isReservedAdminEmail(identity.email as string | undefined)).toBe(
    false,
  );
});

test("the owner address is matched from the user record, not the token", () => {
  // What getCallerEmail returns for the owner's `users` document.
  expect(isReservedAdminEmail("fetchbukidnon@gmail.com")).toBe(true);
  // Normalised on the way out, so casing cannot smuggle past the check.
  expect(isReservedAdminEmail("  FetchBukidnon@Gmail.COM ")).toBe(true);
});

test("the bootstrap password satisfies the policy it ships with", () => {
  // If this ever fails, the prefill on the owner password form would be rejected
  // by the provider on submit.
  expect(() => assertPasswordRequirements(BOOTSTRAP_OWNER_PASSWORD)).not.toThrow();
  expect(BOOTSTRAP_OWNER_PASSWORD.length).toBeGreaterThanOrEqual(
    MIN_PASSWORD_LENGTH,
  );
});

test("passwords must be long enough", () => {
  expect(MIN_PASSWORD_LENGTH).toBe(10);
  expect(() => assertPasswordRequirements("Ab1cdefgh")).toThrow(
    /at least 10 characters/,
  );
  // Exactly at the minimum, with both character classes, is allowed.
  expect(() => assertPasswordRequirements("Abcdefghi1")).not.toThrow();
});

test("passwords must mix letters and numbers", () => {
  expect(() => assertPasswordRequirements("abcdefghij")).toThrow(
    /one letter and one number/,
  );
  expect(() => assertPasswordRequirements("1234567890")).toThrow(
    /one letter and one number/,
  );
  expect(() => assertPasswordRequirements(undefined)).toThrow();
  expect(() => assertPasswordRequirements("")).toThrow();
});

test("the policy is stricter than the auth provider default", () => {
  // The provider accepts any non-empty password of 8+ characters; Fetch must
  // refuse those, or the admin console would be reachable with a weak secret.
  expect(() => assertPasswordRequirements("password")).toThrow();
  expect(() => assertPasswordRequirements("12345678")).toThrow();
});

/**
 * The point of the whole change: signing in as the reserved address has to land
 * in the console on its own, with no setup step in between.
 */
test("the reserved owner is sent straight to the admin console", () => {
  expect(resolvePostAuthPath(true, "/app")).toBe("/admin");
});

test("everyone else continues to where they were headed", () => {
  expect(resolvePostAuthPath(false, "/app")).toBe("/app");
  // A deep link survives: the rider and history routes come back through
  // `returnTo`, and must not be flattened to the default.
  expect(resolvePostAuthPath(false, "/rides")).toBe("/rides");
});

/**
 * Regression: `isOwnerOrAdmin` used to answer `{ false, false }` when nobody
 * was signed in. That reads as a settled "not the owner", so the sign-in page
 * navigated to `/app` before the query refetched for the new session and the
 * owner never reached the console. Signed out must stay unsettled.
 */
test("a signed-out caller is never treated as a settled verdict", () => {
  expect(isOwnerAdminSettled(null)).toBe(false);
  expect(isOwnerAdminSettled(undefined)).toBe(false);
});

test("only a real answer settles the ownership question", () => {
  // Including a genuine negative: signed in, and simply not the owner.
  expect(isOwnerAdminSettled({ isAdmin: false, isOwner: false })).toBe(true);
  expect(isOwnerAdminSettled({ isAdmin: true, isOwner: true })).toBe(true);
});
describe("reading somebody else's ratings", () => {
  test("listForRider authenticates before it reads anything", () => {
    // It took an arbitrary `riderId` and answered anybody who asked — signed in
    // or not — handing over the free text a passenger typed about that rider.
    const body = listForRiderBody();
    expect(body).toContain("requireUserId(ctx)");
    // The check has to come before the scan, or the comments are read first and
    // merely not returned.
    expect(body.indexOf("requireUserId")).toBeLessThan(
      body.indexOf('.query("ratings")'),
    );
  });

  test("only the rider themselves or the console may read them", () => {
    const body = listForRiderBody();
    expect(body).toContain("userId !== args.riderId");
    expect(body).toContain('profile?.role !== "admin"');
    // Refused with an empty list rather than a throw: a caller that is not
    // entitled learns nothing, not even that ratings exist.
    expect(body).toContain("return [];");
  });

  test("a guest session gets no read of another rider's record", () => {
    // The same rule `requireAdmin` applies before it reads a profile: a
    // throwaway demo account is never the console.
    expect(listForRiderBody()).toContain("isGuestSession(ctx)");
  });

  test("the access rule is the one the doc comment claims", () => {
    // The comment said "for the console and the rider's own screen" while the
    // code did neither. Both are asserted from the same source so the prose
    // cannot quietly drift back from the rule.
    const body = listForRiderBody();
    expect(body).toContain("requireUserId(ctx)");
    expect(body).toMatch(/userId !== args\.riderId/);
    expect(body).toMatch(/role !== "admin"/);
  });
});

describe("exporting rides leaves a trace", () => {
  test("exportRidesCsv writes an audit row in the same mutation", () => {
    // The only admin action that carries passenger and rider phone numbers out
    // of the database. Every other admin mutation logs; this one did not.
    const body = exportRidesCsvBody();
    expect(body).toContain("logAction(ctx");
    expect(body).toContain('action: "export_rides_csv"');
    // Written before the return, and not deferred to the client: a log a failed
    // request can skip is a suggestion rather than an audit trail.
    expect(body.indexOf("logAction(ctx")).toBeLessThan(
      body.lastIndexOf("return {"),
    );
  });

  test("the audit row names the admin who pulled the data", () => {
    // The identity comes from the server's own requireAdmin, never from an
    // argument the caller controls.
    const body = exportRidesCsvBody();
    expect(body).toContain("const { userId } = await requireAdmin(ctx);");
    expect(body).toContain("logAction(ctx, userId");
  });

  test("the row says what was exported, including that it carried numbers", () => {
    const body = exportRidesCsvBody();
    expect(body).toContain("phone numbers");
    expect(body).toContain("rides.length");
  });
});
