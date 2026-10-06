import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Throws a user-facing error when the request is not authenticated. */
export async function requireUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Please sign in to continue.");
  }
  return userId;
}

/**
 * The caller's user id, or `null` when nobody is signed in.
 *
 * For queries a *signed-out* visitor is allowed to run. Those must answer
 * "nobody" rather than throw: a thrown query surfaces in the client as an
 * uncaught server error, which the route error boundary renders as "This
 * screen could not load" — so a query that throws when signed out takes the
 * whole screen down instead of simply reporting no user. That is what broke
 * `/rider/register`, which is deliberately outside `RequireAuth` because its
 * first step is what *creates* the account.
 *
 * `null` here is unambiguous and must not be confused with a query result: a
 * caller distinguishes the three states as `undefined` (still loading), `null`
 * (asked, nobody signed in or no row yet), and an object (settled).
 */
export async function getUserIdOrNull(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  return await getAuthUserId(ctx);
}

/** Normalizes a phone number to a compact form, keeping a leading "+". */
export function normalizePhone(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("Enter a valid mobile number (10–15 digits).");
  }
  return `${hasPlus ? "+" : ""}${digits}`;
}

export function requireNonEmpty(value: string, field: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new Error(`${field} is required.`);
  if (trimmed.length > 120) throw new Error(`${field} is too long.`);
  return trimmed;
}
