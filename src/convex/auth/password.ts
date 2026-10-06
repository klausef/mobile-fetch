import { Password } from "@convex-dev/auth/providers/Password";
import { emailOtp } from "./emailOtp";
import { assertPasswordRequirements } from "../lib/password";

/**
 * Email + password sign-in, alongside the existing email-OTP flow.
 *
 * Hashing is Scrypt and happens server-side (Lucia's default via the
 * Password provider), so the browser only ever sends the plaintext password
 * over TLS to Convex.
 *
 * Password *changes* go through the reset flow rather than a dedicated
 * "changePassword" flow — the provider has no such flow, and a reset verified
 * by an emailed code is the safer design anyway: nobody can quietly repoint a
 * live admin account's credentials. `emailOtp` is reused as the delivery
 * channel so no second mail integration is needed.
 */
export const password = Password({
  id: "password",
  reset: emailOtp,
  // This account owns the fare table and the rider approval queue, so the bar
  // is higher than the provider default. The rule lives in lib/password.ts so
  // it can be asserted in tests.
  validatePasswordRequirements: assertPasswordRequirements,
});