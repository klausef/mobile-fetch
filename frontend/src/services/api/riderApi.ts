import type { Booking, BookingStatus, EarningsSummary, Rider } from "@/types";

/**
 * What the rider side of the app needs from a backend.
 *
 * The three methods below are the trip lifecycle: see the open requests, take
 * one, then walk it to `completed`. Profile and earnings live on
 * `RiderProfileApi` so this interface stays exactly the lifecycle.
 */
export interface RiderApi {
  getAvailableRequests(): Promise<Booking[]>;
  acceptBooking(id: string): Promise<Booking>;
  updateBookingStatus(id: string, status: BookingStatus): Promise<Booking>;
}

export interface RiderProfileApi {
  getProfile(): Promise<Rider>;
  setOnline(online: boolean): Promise<Rider>;
  /** Every trip assigned to this rider, active ones first. */
  getMyTrips(): Promise<Booking[]>;
  getEarnings(): Promise<EarningsSummary>;
}
