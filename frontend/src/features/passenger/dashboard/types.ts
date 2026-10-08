import type { Booking, Passenger } from "@/types";

/** Everything the dashboard shows, loaded in one call. */
export interface PassengerDashboardData {
  passenger: Passenger;
  activeBooking: Booking | undefined;
  recentBookings: Booking[];
}
