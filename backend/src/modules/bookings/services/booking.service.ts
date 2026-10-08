import { db } from "../../database/db";
import {
  BOOKING_STATUS_ORDER,
  PASSENGER_CANCELLABLE,
  RIDER_NEXT_STATUS,
  canTransition,
  statusEvent,
  type EarningsSummary,
  type Booking,
  type BookingStatus,
} from "../types";

export function getMyBookings(passengerId: string): Booking[] {
  const bookings = db.myBookings(passengerId);
  return bookings
    .slice()
    .sort((a: Booking, b: Booking) => {
      const activeA = BOOKING_STATUS_ORDER.indexOf(a.status) < BOOKING_STATUS_ORDER.length - 2;
      const activeB = BOOKING_STATUS_ORDER.indexOf(b.status) < BOOKING_STATUS_ORDER.length - 2;
      const activeFirst = Number(activeB) - Number(activeA);
      return activeFirst !== 0 ? activeFirst : b.createdAt.localeCompare(a.createdAt);
    });
}

export function getBooking(id: string): Booking | undefined {
  return db.getBooking(id);
}

export async function createBooking(input: {
  passengerId: string;
  passengerName: string;
  serviceId: string;
  pickup: { name: string; address: string };
  destination: { name: string; address: string };
  distanceKm: number;
  fare: number;
}): Promise<Booking> {
  const now = new Date().toISOString();
  const booking: Booking = {
    id: db.nextBookingId(),
    passengerId: input.passengerId,
    passengerName: input.passengerName,
    serviceId: input.serviceId,
    serviceName: "Service " + input.serviceId,
    status: "pending",
    pickup: input.pickup,
    destination: input.destination,
    distanceKm: input.distanceKm,
    fare: input.fare,
    createdAt: now,
    updatedAt: now,
    timeline: [statusEvent("pending")],
  };
  return db.addBooking(booking);
}

export function cancelBooking(id: string, passengerId: string): Booking {
  const booking = db.getBooking(id);
  if (!booking) throw new Error("Booking not found");
  if (booking.passengerId !== passengerId) throw new Error("Booking does not belong to you");
  if (!PASSENGER_CANCELLABLE.includes(booking.status)) throw new Error("Booking cannot be cancelled at this stage");
  return db.updateBooking(id, { ...booking, status: "cancelled", updatedAt: new Date().toISOString(), timeline: [...booking.timeline, statusEvent("cancelled")] });
}

export function getAvailableRequests(riderId: string): Booking[] {
  return db.availableRequestsForRider(riderId).slice().sort((a: Booking, b: Booking) => {
    return Number(b.createdAt < a.createdAt) || b.createdAt.localeCompare(a.createdAt);
  });
}

export async function acceptBooking(id: string, riderId: string, riderName: string): Promise<Booking> {
  const booking = db.getBooking(id);
  if (!booking) throw new Error("Booking not found");
  if (booking.status !== "pending") throw new Error("Booking not pending");
  if (booking.riderId && booking.riderId !== riderId) throw new Error("Booking already taken");
  return db.updateBooking(id, {
    ...booking,
    status: "accepted",
    riderId,
    riderName,
    updatedAt: new Date().toISOString(),
    timeline: [...booking.timeline, statusEvent("accepted", riderName)],
  });
}

export async function updateBookingStatus(id: string, riderId: string, status: BookingStatus): Promise<Booking> {
  const booking = db.getBooking(id);
  if (!booking) throw new Error("Booking not found");
  if (booking.riderId !== riderId) throw new Error("Booking assigned to another rider");
  if (!canTransition(booking.status, status)) throw new Error(`Cannot move ${booking.status} to ${status}`);
  const updated = { ...booking, status, updatedAt: new Date().toISOString(), timeline: [...booking.timeline, statusEvent(status)] };
  const saved = db.updateBooking(id, updated);
  if (status === "completed") db.settleTrip(riderId, booking.fare);
  return saved;
}

export function getMyTrips(riderId: string): Booking[] {
  return db.myTrips(riderId).slice().sort((a: Booking, b: Booking) => {
    const activeA = RIDER_NEXT_STATUS[a.status] !== null || a.status === "pending";
    const activeB = RIDER_NEXT_STATUS[b.status] !== null || b.status === "pending";
    return (activeA ? 1 : 0) - (activeB ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt);
  });
}

export function getEarnings(riderId: string): EarningsSummary {
  return db.earningsSummary(riderId);
}
