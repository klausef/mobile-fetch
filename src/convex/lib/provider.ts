/**
 * Is there actually a payment provider behind the cashless toggle?
 *
 * The Super Admin's online-payment switch and the payment credentials are two
 * separate things, and only one of them is a button. An admin who switches
 * online payment on before Stripe keys exist would otherwise hand every
 * commuter a checkout screen that cannot charge anybody — and the failure
 * would only show up at the drop-off, with the rider owed cash.
 *
 * So the toggle is checked against this before it claims to be ready, and
 * online rides degrade to cash until the keys are there.
 */

/**
 * The env vars that have to be present before a fare can be taken online.
 *
 * The secret key is what actually charges a card; the webhook secret is what
 * lets the platform confirm a payment that succeeded even if the phone lost
 * signal. Both are required, because a payment that is marked paid purely on
 * the client's say-so is not a payment.
 */
export const STRIPE_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
] as const;

type EnvRecord = Record<string, string | undefined>;

/**
 * Read the environment without assuming Node globals exist.
 *
 * Convex actions and mutations both expose `process.env`, but this function is
 * also imported by tests and by anything that might run without it, so the
 * lookup is defensive rather than a bare property access.
 */
function readEnv(): EnvRecord {
  if (typeof process === "undefined" || !process.env) return {};
  return process.env as EnvRecord;
}

/**
 * Which of the required keys are missing.
 *
 * Returns names, not values: this runs behind the console's readiness badge,
 * and nothing here should ever be in a position to print a secret.
 */
export function missingStripeKeys(env: EnvRecord = readEnv()): string[] {
  return STRIPE_ENV_VARS.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}

/** Can a fare be charged online right now? */
export function isStripeConfigured(env: EnvRecord = readEnv()): boolean {
  return missingStripeKeys(env).length === 0;
}

/**
 * What the console needs to draw its toggle: whether Stripe is connected, and
 * if not, what is still outstanding.
 */
export function providerStatus(env: EnvRecord = readEnv()): {
  configured: boolean;
  missing: string[];
} {
  const missing = missingStripeKeys(env);
  return { configured: missing.length === 0, missing };
}