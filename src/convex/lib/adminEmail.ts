/**
 * Who is allowed to hold the Super Admin seat.
 *
 * Kept dependency-free so the same rule can be asserted in tests and mirrored
 * for the client (see src/lib/adminEmail.ts, which parity-checks against this).
 *
 * This is not a credential — sign-in itself is handled by Convex Auth. It only
 * gates which identity may take the admin role, so the seat can never be
 * claimed by whoever happens to sign up first.
 */
export const RESERVED_ADMIN_EMAIL = "fetchbukidnon@gmail.com";

/** Case- and whitespace-insensitive match on the reserved owner address. */
export function isReservedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === RESERVED_ADMIN_EMAIL;
}

/**
 * Do NOT read the caller's email off `ctx.auth.getUserIdentity()`.
 *
 * Convex Auth signs its tokens with only `sub`, `iss`, `aud`, `iat` and `exp`
 * (@convex-dev/auth tokens.js). There is no email on the identity and never
 * was, so `identity.email` and `identity.claims.email` are always undefined.
 *
 * A helper that read them anyway returned `null` for every caller, which failed
 * quietly and looked like a working rule: the owner was never recognised as the
 * owner, was never redirected to the console, and was even allowed to create a
 * rider profile. Use `getCallerEmail` in lib/db.ts, which resolves the user id
 * via `getAuthUserId` and reads the `users` document.
 */