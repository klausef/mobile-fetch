import type { Booking, Service } from "@/types";

/** The quote the booking screen shows before anything is created. */
export interface FareQuote {
  service: Service;
  distanceKm: number;
  fare: number;
  etaMinutes: number;
}

export type BookingStep = "compose" | "creating" | "created";

export interface BookingResult {
  booking: Booking;
}
