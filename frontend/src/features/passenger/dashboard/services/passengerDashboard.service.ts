import type { Booking, Passenger } from "@/types";
import { passengerApi } from "@/services/api";
import { DEFAULT_PASSENGER } from "@/data/mock/users";
import { isActiveStatus } from "@/utils/bookingStatus";
import type { PassengerDashboardData } from "../types";

/**
 * The dashboard reads through the shared API, never from `data/mock` — that
 * is what keeps this feature honest when a real backend arrives.
 */
export async function loadPassengerDashboard(): Promise<PassengerDashboardData> {
  const bookings = await passengerApi.getMyBookings();
  const passenger: Passenger = DEFAULT_PASSENGER;
  const activeBooking = bookings.find((booking) => isActiveStatus(booking.status));
  const recentBookings: Booking[] = bookings
    .filter((booking) => !isActiveStatus(booking.status))
    .slice(0, 3);
  return { passenger, activeBooking, recentBookings };
}
