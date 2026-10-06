/**
 * Password strength policy.
 *
 * Dependency-free so the sign-up/reset path and the test suite share one rule.
 * Throws with a user-facing message, which is exactly what Convex Auth's
 * `validatePasswordRequirements` expects.
 */

/** Stricter than the provider default of "non-empty and 8+ characters". */
export const MIN_PASSWORD_LENGTH = 10;

export function assertPasswordRequirements(password: string | undefined): void {
  const pw = password ?? "";
  if (pw.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) {
    throw new Error("Include at least one letter and one number.");
  }
}