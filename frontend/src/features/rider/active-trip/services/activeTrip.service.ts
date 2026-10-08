import type { BookingStatus } from "@/types";
import type { MapCoordinate, MapMarker } from "@/services/maps/mapProvider";
import { riderApi, riderProfileApi } from "@/services/api";
import { isActiveStatus, RIDER_NEXT_STATUS, STATUS_LABELS } from "@/utils/bookingStatus";
import type { ActiveTripView } from "../types";

/**
 * The rider's working trip: the newest active one they hold, shaped with the
 * pins, the line, and the single next action.
 */
export async function loadActiveTrip(): Promise<ActiveTripView | null> {
  const trips = await riderProfileApi.getMyTrips();
  const booking = trips.find(
    (trip) => isActiveStatus(trip.status) && trip.status !== "pending",
  );
  if (!booking) return null;

  const markers: MapMarker[] = [
    { id: "pickup", label: booking.pickup.name, coordinate: [booking.pickup.lng, booking.pickup.lat], kind: "pickup" },
    { id: "destination", label: booking.destination.name, coordinate: [booking.destination.lng, booking.destination.lat], kind: "destination" },
  ];
  const route: MapCoordinate[] = [
    [booking.pickup.lng, booking.pickup.lat],
    [booking.destination.lng, booking.destination.lat],
  ];

  const next = RIDER_NEXT_STATUS[booking.status];
  return {
    booking,
    markers,
    route,
    center: [
      (booking.pickup.lng + booking.destination.lng) / 2,
      (booking.pickup.lat + booking.destination.lat) / 2,
    ],
    nextAction: next ? { status: next, label: actionLabel(next) } : null,
  };
}

function actionLabel(status: BookingStatus): string {
  if (status === "driver_arriving") return "Arrived at pickup";
  if (status === "in_progress") return "Start trip";
  if (status === "completed") return "Complete trip";
  return STATUS_LABELS[status];
}

/** Accept, or advance the trip one status. Both go through the API. */
export async function advanceTrip(
  bookingId: string,
  status: BookingStatus,
): Promise<BookingStatus> {
  if (status === "accepted") {
    await riderApi.acceptBooking(bookingId);
  } else {
    await riderApi.updateBookingStatus(bookingId, status);
  }
  return status;
}
