/**
 * Client-side mirror of the Super Admin ownership rules.
 *
 * `RESERVED_ADMIN_EMAIL` duplicates src/convex/lib/adminEmail.ts so the sign-in
 * page can render the owner password form for the right address without
 * importing server code. tests/admin-auth.test.ts asserts the two never drift.
 */
export const RESERVED_ADMIN_EMAIL = "fetchbukidnon@gmail.com";

/**
 * Password the reserved owner account was created with.
 *
 * Prefilled on the one-time owner password form, which only appears while the
 * address has no password credential yet. Kept so the account can be recovered,
 * and asserted by tests/admin-auth.test.ts against the policy it must satisfy.
 * Rotate it from the account menu once you are in, then delete this constant and
 * the prefill together.
 */
export const BOOTSTRAP_OWNER_PASSWORD = "dacelarc12";