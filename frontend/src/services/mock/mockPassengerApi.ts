import type { Booking, CreateBookingInput, Service } from "@/types";
import { MOCK_SERVICES } from "@/data/mock/services";
import { estimateFare, roadDistanceKm } from "@/utils/geo";
import { PASSENGER_CANCELLABLE, isActiveStatus } from "@/utils/bookingStatus";
import {
  allBookings,
  findBooking,
  insertBooking,
  mockLatency,
  nextBookingId,
  session,
  statusEvent,
  updateBooking,
} from "./mockDb";
import type { PassengerApi } from "@/services/api/passengerApi";

const notFound = (id: string): Error => new Error(`Booking ${id} was not found.`);

/**
 * The passenger half of the mock backend.
 *
 * Same interface a real server would implement; the data lives in `mockDb`
 * and every method pretends to be a network call.
 */
export const mockPassengerApi: PassengerApi = {
  async getAvailableServices(): Promise<Service[]> {
    await mockLatency(250);
    return MOCK_SERVICES.filter((service) => service.active).map((service) => ({
      ...service,
    }));
  },

  async getMyBookings(): Promise<Booking[]> {
    await mockLatency();
    return allBookings()
      .filter((booking) => booking.passengerId === session.passengerId)
      .sort((a, b) => {
        const activeFirst = Number(isActiveStatus(b.status)) - Number(isActiveStatus(a.status));
        return activeFirst !== 0
          ? activeFirst
          : b.createdAt.localeCompare(a.createdAt);
      });
  },

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    await mockLatency();
    const service = MOCK_SERVICES.find((candidate) => candidate.id === input.serviceId);
    if (!service || !service.active) {
      throw new Error("That service is not available right now.");
    }
    const distanceKm = roadDistanceKm(input.pickup, input.destination);
    const now = new Date().toISOString();
    const booking: Booking = {
      id: nextBookingId(),
      passengerId: input.passengerId,
      passengerName: input.passengerName,
      serviceId: service.id,
      serviceName: service.name,
      status: "pending",
      pickup: { ...input.pickup },
      destination: { ...input.destination },
      distanceKm,
      fare: estimateFare(service, distanceKm),
      createdAt: now,
      updatedAt: now,
      timeline: [statusEvent("pending")],
    };
    insertBooking(booking);
    return { ...booking, timeline: [...booking.timeline] };
  },

  async cancelBooking(id: string): Promise<Booking> {
    await mockLatency();
    const booking = findBooking(id);
    if (!booking) throw notFound(id);
    if (booking.passengerId !== session.passengerId) {
      throw new Error("That booking belongs to someone else.");
    }
    if (!PASSENGER_CANCELLABLE.includes(booking.status)) {
      throw new Error(
        booking.status === "cancelled"
          ? "This booking is already cancelled."
          : "A trip this far along can no longer be cancelled.",
      );
    }
    return updateBooking(id, { status: "cancelled" }, statusEvent("cancelled"));
  },

  async getBooking(id: string): Promise<Booking> {
    await mockLatency(200);
    const booking = findBooking(id);
    if (!booking) throw notFound(id);
    return booking;
  },
};
