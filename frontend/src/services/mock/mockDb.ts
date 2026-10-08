import type { Booking, BookingStatus, BookingEvent, Rider } from "@/types";
import { SEED_BOOKINGS } from "@/data/mock/bookings";
import { DEFAULT_RIDER, MOCK_RIDERS } from "@/data/mock/riders";

/**
 * The mock database.
 *
 * Module-level mutable state behind small functions: the mock APIs mutate
 * this, and screens never see it. It dies with the app process, which is
 * exactly right for mock data — reload and the demo starts over.
 */

const riders: Rider[] = MOCK_RIDERS.map((rider) => ({ ...rider }));
let bookings: Booking[] = SEED_BOOKINGS.map((booking) => ({
  ...booking,
  timeline: [...booking.timeline],
}));

/** Pretend network latency, so loading states are real states. */
export const mockLatency = (ms = 350): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** No auth service: the signed-in people are fixed demo accounts. */
export const session = {
  passengerId: "passenger-1",
  passengerName: "Ana Reyes",
  riderId: DEFAULT_RIDER.id,
  riderName: DEFAULT_RIDER.name,
};

let bookingCounter = 0;

export const nextBookingId = (): string => {
  bookingCounter += 1;
  return `bk-${Date.now().toString(36)}-${bookingCounter}`;
};

export const allBookings = (): Booking[] =>
  bookings.map((booking) => ({ ...booking, timeline: [...booking.timeline] }));

export const findBooking = (id: string): Booking | undefined => {
  const booking = bookings.find((candidate) => candidate.id === id);
  return booking
    ? { ...booking, timeline: [...booking.timeline] }
    : undefined;
};

export const findRider = (id: string): Rider | undefined => {
  const rider = riders.find((candidate) => candidate.id === id);
  return rider ? { ...rider } : undefined;
};

export const insertBooking = (booking: Booking): void => {
  bookings = [booking, ...bookings];
};

export const updateBooking = (
  id: string,
  patch: Partial<Booking>,
  event?: BookingEvent,
): Booking => {
  const index = bookings.findIndex((candidate) => candidate.id === id);
  if (index === -1) throw new Error(`Booking ${id} was not found.`);
  const current = bookings[index];
  const updated: Booking = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
    timeline: event ? [...current.timeline, event] : [...current.timeline],
  };
  bookings = bookings.map((candidate, position) =>
    position === index ? updated : candidate,
  );
  return { ...updated, timeline: [...updated.timeline] };
};

/** A completed trip pays the rider and counts toward their stats. */
export const recordRiderTrip = (riderId: string, fare: number): void => {
  const index = riders.findIndex((candidate) => candidate.id === riderId);
  if (index === -1) return;
  riders[index] = {
    ...riders[index],
    completedTrips: riders[index].completedTrips + 1,
    totalEarnings: riders[index].totalEarnings + fare,
  };
};

export const setRiderOnline = (riderId: string, online: boolean): Rider => {
  const index = riders.findIndex((candidate) => candidate.id === riderId);
  if (index === -1) throw new Error(`Rider ${riderId} was not found.`);
  riders[index] = { ...riders[index], online };
  return { ...riders[index] };
};

export const statusEvent = (
  status: BookingStatus,
  by?: string,
): BookingEvent => ({
  status,
  at: new Date().toISOString(),
  ...(by ? { by } : {}),
});
