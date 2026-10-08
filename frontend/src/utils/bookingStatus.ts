import type { BookingStatus } from "@/types";

/** Every status in the order a booking moves through it. */
export const BOOKING_STATUS_ORDER: BookingStatus[] = [
  "pending",
  "accepted",
  "driver_arriving",
  "in_progress",
  "completed",
];

export const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Finding a rider",
  accepted: "Rider accepted",
  driver_arriving: "Rider arriving",
  in_progress: "On the way",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** Which statuses a passenger may still cancel. */
export const PASSENGER_CANCELLABLE: BookingStatus[] = [
  "pending",
  "accepted",
  "driver_arriving",
];

/** The next status a rider moves a trip to, or null when it is settled. */
export const RIDER_NEXT_STATUS: Partial<Record<BookingStatus, BookingStatus>> = {
  accepted: "driver_arriving",
  driver_arriving: "in_progress",
  in_progress: "completed",
};

const ACTIVE_STATUSES: BookingStatus[] = [
  "pending",
  "accepted",
  "driver_arriving",
  "in_progress",
];

export const isActiveStatus = (status: BookingStatus): boolean =>
  ACTIVE_STATUSES.includes(status);

/**
 * The transition table. Every status change in the mock API goes through here,
 * so the mock backend and the UI cannot disagree about what may follow what.
 */
const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  pending: ["accepted", "cancelled"],
  accepted: ["driver_arriving", "cancelled"],
  driver_arriving: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED[from].includes(to);
}
