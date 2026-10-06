import { describe, expect, test } from "bun:test";
import {
  canOfferOnlinePayment,
  cashlessReadiness,
  DEFAULT_PAYMENT_METHOD,
  fallbackMessage,
  isPaymentMethod,
  PAYMENT_METHODS,
  resolvePaymentMethod,
} from "../src/lib/payments";

describe("isPaymentMethod", () => {
  test("recognizes the two methods", () => {
    expect(isPaymentMethod("cash")).toBe(true);
    expect(isPaymentMethod("online")).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isPaymentMethod("gcash")).toBe(false);
    expect(isPaymentMethod("CASH")).toBe(false);
    expect(isPaymentMethod("")).toBe(false);
    expect(isPaymentMethod(null)).toBe(false);
    expect(isPaymentMethod(7)).toBe(false);
  });

  test("cash is the default, because cash always works", () => {
    // The failure mode of a payment system is a commuter who cannot pay at
    // all. Cash has to be the value every missing or bad input lands on.
    expect(DEFAULT_PAYMENT_METHOD).toBe("cash");
    expect(PAYMENT_METHODS).toContain(DEFAULT_PAYMENT_METHOD);
  });
});

describe("resolvePaymentMethod", () => {
  test("honours an online request when everything is in place", () => {
    expect(
      resolvePaymentMethod({
        requested: "online",
        cashlessEnabled: true,
        providerConfigured: true,
      }),
    ).toEqual({ method: "online" });
  });

  test("falls back to cash when the admin has it switched off", () => {
    expect(
      resolvePaymentMethod({
        requested: "online",
        cashlessEnabled: false,
        providerConfigured: true,
      }),
    ).toEqual({ method: "cash", fallback: "disabled" });
  });

  test("falls back to cash when no provider is configured", () => {
    // The important one: the admin flipped the toggle but the Stripe keys have
    // not arrived. Charging cannot work, so it must not be offered.
    expect(
      resolvePaymentMethod({
        requested: "online",
        cashlessEnabled: true,
        providerConfigured: false,
      }),
    ).toEqual({ method: "cash", fallback: "unavailable" });
  });

  test("reports the admin's switch before the provider, because that is the fixable one", () => {
    expect(
      resolvePaymentMethod({
        requested: "online",
        cashlessEnabled: false,
        providerConfigured: false,
      }).fallback,
    ).toBe("disabled");
  });

  test("a cash request is always cash, whatever the settings", () => {
    for (const cashlessEnabled of [true, false]) {
      for (const providerConfigured of [true, false]) {
        expect(
          resolvePaymentMethod({
            requested: "cash",
            cashlessEnabled,
            providerConfigured,
          }),
        ).toEqual({ method: "cash" });
      }
    }
  });

  test("never returns online unless both conditions hold", () => {
    for (const cashlessEnabled of [true, false]) {
      for (const providerConfigured of [true, false]) {
        const result = resolvePaymentMethod({
          requested: "online",
          cashlessEnabled,
          providerConfigured,
        });
        if (result.method === "online") {
          expect(cashlessEnabled && providerConfigured).toBe(true);
        }
      }
    }
  });

  test("always returns a method, never nothing", () => {
    // A ride with no payment method is a ride the rider cannot get paid for.
    for (const cashlessEnabled of [true, false]) {
      for (const providerConfigured of [true, false]) {
        for (const requested of PAYMENT_METHODS) {
          expect(
            isPaymentMethod(
              resolvePaymentMethod({
                requested,
                cashlessEnabled,
                providerConfigured,
              }).method,
            ),
          ).toBe(true);
        }
      }
    }
  });
});

describe("canOfferOnlinePayment", () => {
  test("needs both the toggle and the provider", () => {
    expect(canOfferOnlinePayment({ cashlessEnabled: true, providerConfigured: true })).toBe(true);
    expect(canOfferOnlinePayment({ cashlessEnabled: true, providerConfigured: false })).toBe(false);
    expect(canOfferOnlinePayment({ cashlessEnabled: false, providerConfigured: true })).toBe(false);
    expect(canOfferOnlinePayment({ cashlessEnabled: false, providerConfigured: false })).toBe(false);
  });

  test("agrees with resolvePaymentMethod", () => {
    // A control the booking screen shows must match what the server would do,
    // or it offers something that does not work.
    for (const cashlessEnabled of [true, false]) {
      for (const providerConfigured of [true, false]) {
        const offered = canOfferOnlinePayment({ cashlessEnabled, providerConfigured });
        const accepted = resolvePaymentMethod({
          requested: "online",
          cashlessEnabled,
          providerConfigured,
        }).method === "online";
        expect(offered).toBe(accepted);
      }
    }
  });
});

describe("cashlessReadiness", () => {
  test("is ready only when online payment would actually work", () => {
    expect(
      cashlessReadiness({ cashlessEnabled: true, providerConfigured: true }),
    ).toEqual({ ready: true, reason: null });
  });

  test("blames the missing provider ahead of the toggle", () => {
    // "Add your Stripe keys" is the next action; "turn on the toggle" is
    // advice to give only once there is something to turn on.
    expect(
      cashlessReadiness({ cashlessEnabled: true, providerConfigured: false }),
    ).toEqual({ ready: false, reason: "unconfigured" });
    expect(
      cashlessReadiness({ cashlessEnabled: false, providerConfigured: false }),
    ).toEqual({ ready: false, reason: "unconfigured" });
  });

  test("blames the toggle when the provider is fine", () => {
    expect(
      cashlessReadiness({ cashlessEnabled: false, providerConfigured: true }),
    ).toEqual({ ready: false, reason: "disabled" });
  });
});

describe("fallbackMessage", () => {
  test("every fallback has a sentence", () => {
    for (const reason of ["disabled", "unavailable", "invalid"] as const) {
      expect(fallbackMessage(reason).length).toBeGreaterThan(0);
    }
  });

  test("tells the commuter to bring cash in every case", () => {
    for (const reason of ["disabled", "unavailable", "invalid"] as const) {
      expect(fallbackMessage(reason)).toMatch(/cash/i);
    }
  });
});