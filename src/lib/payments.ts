/**
 * How a fare gets paid, and who is allowed to say so.
 *
 * Fetch settles in cash today: the commuter hands the rider the fare at the
 * drop-off. Online payment is a second path, not a replacement, and the Super
 * Admin controls whether it is offered at all.
 *
 * The policy lives here rather than in a Convex mutation so it can be unit
 * tested, and so the booking screen and the server enforce the same rule rather
 * than each having their own idea of it.
 */

/** How the fare for a ride is settled. */
export const PAYMENT_METHODS = ["cash", "online"] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Default for rides created before this existed, and the safe default now. */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "cash";

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return (
    typeof value === "string" &&
    (PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

/**
 * Why an "online" request ended up as something else.
 *
 * Surfaced to the commuter as a reason, not silently swallowed: somebody who
 * chose to pay by card deserves to know why they are being asked for cash.
 */
export type CashlessFallback = "disabled" | "unavailable" | "invalid";

export type ResolvedPayment = {
  method: PaymentMethod;
  /** Set only when `method` is not what was asked for. */
  fallback?: CashlessFallback;
};

/**
 * Decide how a ride is actually paid.
 *
 * Two independent things have to be true before a fare may be taken online,
 * and neither alone is enough:
 *
 *  - the Super Admin has switched online payment on, and
 *  - a payment provider is actually configured.
 *
 * Both matter, and the second is the one people forget. An admin who flips the
 * toggle before the Stripe keys exist would otherwise be handing every
 * commuter a payment screen that cannot charge anybody — the app would say
 * "pay online", the charge would fail at the drop-off, and the rider would
 * still be owed cash. Rather than that, an online request degrades to cash and
 * says why.
 */
export function resolvePaymentMethod(args: {
  requested: PaymentMethod;
  cashlessEnabled: boolean;
  providerConfigured: boolean;
}): ResolvedPayment {
  if (args.requested !== "online") return { method: "cash" };
  if (!isPaymentMethod(args.requested)) return { method: "cash", fallback: "invalid" };
  if (!args.cashlessEnabled) return { method: "cash", fallback: "disabled" };
  if (!args.providerConfigured) {
    return { method: "cash", fallback: "unavailable" };
  }
  return { method: "online" };
}

/**
 * Whether the booking screen should offer the choice at all.
 *
 * True only when a choice actually exists. Offering a single-option control, or
 * a toggle that silently does nothing, is worse than not offering it.
 */
export function canOfferOnlinePayment(args: {
  cashlessEnabled: boolean;
  providerConfigured: boolean;
}): boolean {
  return args.cashlessEnabled && args.providerConfigured;
}

/**
 * Why the console's toggle is showing as not-ready, for the admin's own eyes.
 *
 * `null` means ready. Distinguishing the two failure reasons matters: "the
 * toggle is off" is a decision, while "no provider connected" is a setup step
 * somebody still has to do.
 */
export function cashlessReadiness(args: {
  cashlessEnabled: boolean;
  providerConfigured: boolean;
}): { ready: boolean; reason: "disabled" | "unconfigured" | null } {
  if (!args.providerConfigured) return { ready: false, reason: "unconfigured" };
  if (!args.cashlessEnabled) return { ready: false, reason: "disabled" };
  return { ready: true, reason: null };
}

/** What the commuter is told, in their own words, for each fallback. */
export function fallbackMessage(fallback: CashlessFallback): string {
  switch (fallback) {
    case "disabled":
      return "Online payment is turned off right now. Please bring cash.";
    case "unavailable":
      return "Online payment is not available yet. Please bring cash.";
    case "invalid":
      return "That payment method is not one we accept. Please bring cash.";
  }
}