import type { Rider } from "../riders/types";
import type { Passenger } from "../passengers/types";
import type { Service } from "../services/types";

export type BookingStatus =
  | "pending"
  | "accepted"
  | "driver_arriving"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Booking {
  id: string;
  passengerId: string;
  passengerName: string;
  serviceId: string;
  serviceName: string;
  status: BookingStatus;
  pickup: { name: string; address: string };
  destination: { name: string; address: string };
  distanceKm: number;
  fare: number;
  riderId?: string;
  riderName?: string;
  createdAt: string;
  updatedAt: string;
  timeline: BookingEvent[];
}

export interface BookingEvent {
  status: BookingStatus;
  at: string;
  by?: string;
}

export interface EarningsSummary {
  total: number;
  trips: number;
  todayTotal: number;
  todayTrips: number;
}

export const BOOKING_STATUS_ORDER: BookingStatus[] = [
  "pending", "accepted", "driver_arriving", "in_progress", "completed",
];

export const PASSENGER_CANCELLABLE: BookingStatus[] = ["pending", "accepted", "driver_arriving"];

export const RIDER_NEXT_STATUS: Record<BookingStatus, BookingStatus | null> = {
  pending: "accepted",
  accepted: "driver_arriving",
  driver_arriving: "in_progress",
  in_progress: "completed",
  completed: null,
  cancelled: null,
};

export const canTransition = (from: BookingStatus, to: BookingStatus): boolean => {
  // Cancellation is the riders' escape hatch from any live stage — the
  // passenger's own narrower rule is `PASSENGER_CANCELLABLE`, which stops a
  // cancellation once the trip has started. A terminal stage (completed,
  // cancelled) accepts nothing at all.
  if (to === "cancelled") return from !== "completed" && from !== "cancelled";
  const next = RIDER_NEXT_STATUS[from] ?? (null as BookingStatus | null);
  return next === to;
};

export const statusEvent = (status: BookingStatus, by?: string): BookingEvent => ({
  status,
  at: new Date().toISOString(),
  ...(by ? { by } : {}),
});

export type { Rider as RiderType } from "../riders/types";
