import type { Booking, CreateBookingInput, Service } from "@/types";

/**
 * What the passenger side of the app needs from a backend.
 *
 * Screens talk to this interface only — never to the mock arrays — so the day
 * this is backed by a real server, `services/api/index.ts` swaps the
 * implementation and nothing else changes.
 */
export interface PassengerApi {
  getAvailableServices(): Promise<Service[]>;
  getMyBookings(): Promise<Booking[]>;
  createBooking(input: CreateBookingInput): Promise<Booking>;
  cancelBooking(id: string): Promise<Booking>;
  getBooking(id: string): Promise<Booking>;
}
