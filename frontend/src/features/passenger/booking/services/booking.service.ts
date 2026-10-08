import type { Booking, Service } from "@/types";
import { passengerApi } from "@/services/api";
import { estimateFare, roadDistanceKm } from "@/utils/geo";
import type { CreateBookingInput } from "@/types";
import type { FareQuote } from "../types";

/**
 * The booking feature's own service: it composes a quote from the draft the
 * passenger has picked, and sends the real creation through the API.
 */

export const quoteFor = (service: Service, pickup: { lat: number; lng: number }, destination: { lat: number; lng: number }): FareQuote => {
  const distanceKm = roadDistanceKm(pickup, destination);
  return {
    service,
    distanceKm,
    fare: estimateFare(service, distanceKm),
    etaMinutes: service.etaMinutes,
  };
};

export async function submitBooking(input: CreateBookingInput): Promise<Booking> {
  return passengerApi.createBooking(input);
}

export async function cancelBooking(id: string): Promise<Booking> {
  return passengerApi.cancelBooking(id);
}

export async function loadBooking(id: string): Promise<Booking> {
  return passengerApi.getBooking(id);
}
