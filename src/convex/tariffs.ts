import { query } from "./_generated/server";
import { DEFAULT_TARIFF } from "./lib/fare";

/**
 * The active tariff. Falls back to the documented defaults when no tariff row
 * exists yet, so the client estimate always matches what the server will charge
 * when it seeds the first tariff on the next ride request.
 */
export const getActiveTariff = query({
  args: {},
  handler: async (ctx) => {
    const active = await ctx.db
      .query("tariffs")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .first();
    if (active) {
      return {
        id: active._id as string,
        minFare: active.minFare,
        includedDistanceKm: active.includedDistanceKm,
        ratePerKm: active.ratePerKm,
        // Optional on rows published before long trips were priced separately.
        // Absent means the flat rate all the way, which is what those were
        // quoted — so it is passed through undefined rather than defaulted.
        longTripThresholdKm: active.longTripThresholdKm,
        longTripRatePerKm: active.longTripRatePerKm,
        // Optional on tariff rows seeded before errands were priced separately.
        errandMinFare: active.errandMinFare ?? DEFAULT_TARIFF.errandMinFare,
        stopFee: active.stopFee ?? DEFAULT_TARIFF.stopFee,
      };
    }
    return { id: null as string | null, ...DEFAULT_TARIFF };
  },
});
