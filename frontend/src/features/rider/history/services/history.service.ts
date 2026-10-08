import type { Booking, EarningsSummary } from "@/types";
import { riderProfileApi } from "@/services/api";

export interface RiderHistory {
  trips: Booking[];
  earnings: EarningsSummary;
}

/** The rider's settled trips (completed and cancelled) plus their totals. */
export async function loadRiderHistory(): Promise<RiderHistory> {
  const [trips, earnings] = await Promise.all([
    riderProfileApi.getMyTrips(),
    riderProfileApi.getEarnings(),
  ]);
  const settled = trips.filter(
    (trip) => trip.status === "completed" || trip.status === "cancelled",
  );
  return { trips: settled, earnings };
}
