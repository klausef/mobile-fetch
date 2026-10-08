import { riderApi, riderProfileApi } from "@/services/api";
import { isActiveStatus } from "@/utils/bookingStatus";
import type { RiderDashboardData } from "../types";

/**
 * One load for the rider's home: the profile (with its online switch), the
 * open requests, the trip already in hand, and the money so far.
 */
export async function loadRiderDashboard(): Promise<RiderDashboardData> {
  const [rider, requests, trips, earnings] = await Promise.all([
    riderProfileApi.getProfile(),
    riderProfileApi.getProfile().then(() => riderApi.getAvailableRequests()),
    riderProfileApi.getMyTrips(),
    riderProfileApi.getEarnings(),
  ]);
  return {
    rider,
    requests,
    activeTrip: trips.find((trip) => isActiveStatus(trip.status)),
    earnings,
  };
}
