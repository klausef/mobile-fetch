import type { Booking, BookingStatus, EarningsSummary, Rider } from "@/types";
import { isActiveStatus, RIDER_NEXT_STATUS, canTransition } from "@/utils/bookingStatus";
import type { RiderApi, RiderProfileApi } from "@/services/api/riderApi";
import {
  allBookings,
  findBooking,
  findRider,
  mockLatency,
  recordRiderTrip,
  session,
  setRiderOnline,
  statusEvent,
  updateBooking,
} from "./mockDb";

const notFound = (id: string): Error => new Error(`Booking ${id} was not found.`);

/**
 * The rider half of the mock backend.
 *
 * Status changes are validated against the same transition table the UI
 * shows, so the demo cannot walk a booking through an impossible step.
 */
export const mockRiderApi: RiderApi = {
  async getAvailableRequests(): Promise<Booking[]> {
    await mockLatency();
    return allBookings()
      .filter(
        (booking) =>
          booking.status === "pending" && booking.riderId === undefined,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async acceptBooking(id: string): Promise<Booking> {
    await mockLatency();
    const booking = findBooking(id);
    if (!booking) throw notFound(id);
    if (!canTransition(booking.status, "accepted")) {
      throw new Error(
        booking.status === "cancelled"
          ? "Someone else's passenger already cancelled this request."
          : "This request has already been taken.",
      );
    }
    if (booking.riderId && booking.riderId !== session.riderId) {
      throw new Error("This request has already been taken.");
    }
    return updateBooking(
      id,
      { status: "accepted", riderId: session.riderId, riderName: session.riderName },
      statusEvent("accepted", session.riderName),
    );
  },

  async updateBookingStatus(id: string, status: BookingStatus): Promise<Booking> {
    await mockLatency();
    const booking = findBooking(id);
    if (!booking) throw notFound(id);
    if (booking.riderId !== session.riderId) {
      throw new Error("This trip is assigned to another rider.");
    }
    if (!canTransition(booking.status, status)) {
      throw new Error(
        `A ${booking.status.replace("_", " ")} trip cannot move to ${status.replace("_", " ")}.`,
      );
    }
    const updated = updateBooking(
      id,
      { status, ...(status === "accepted" ? { riderId: session.riderId, riderName: session.riderName } : {}) },
      statusEvent(status, session.riderName),
    );
    if (status === "completed") {
      recordRiderTrip(session.riderId, booking.fare);
    }
    return updated;
  },
};

export const mockRiderProfileApi: RiderProfileApi = {
  async getProfile(): Promise<Rider> {
    await mockLatency(200);
    const rider = findRider(session.riderId);
    if (!rider) throw new Error("The demo rider profile is missing.");
    return rider;
  },

  async setOnline(online: boolean): Promise<Rider> {
    await mockLatency(200);
    return setRiderOnline(session.riderId, online);
  },

  async getMyTrips(): Promise<Booking[]> {
    await mockLatency();
    return allBookings()
      .filter((booking) => booking.riderId === session.riderId)
      .sort((a, b) => {
        // A rider works out of this list: active trips first, newest after.
        const activeA = isActiveStatus(a.status) && a.status !== "pending";
        const activeB = isActiveStatus(b.status) && b.status !== "pending";
        const activeFirst = Number(activeB) - Number(activeA);
        return activeFirst !== 0
          ? activeFirst
          : b.updatedAt.localeCompare(a.updatedAt);
      });
  },

  async getEarnings(): Promise<EarningsSummary> {
    await mockLatency(200);
    const rider = findRider(session.riderId);
    const mine = allBookings().filter(
      (booking) => booking.riderId === session.riderId && booking.status === "completed",
    );
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todays = mine.filter((booking) => new Date(booking.updatedAt) >= startOfToday);
    return {
      total: rider?.totalEarnings ?? 0,
      trips: rider?.completedTrips ?? 0,
      todayTotal: todays.reduce((sum, booking) => sum + booking.fare, 0),
      todayTrips: todays.length,
    };
  },
};
