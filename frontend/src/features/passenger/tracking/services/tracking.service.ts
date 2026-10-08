import type { MapCoordinate, MapMarker } from "@/services/maps/mapProvider";
import { passengerApi } from "@/services/api";
import { isActiveStatus } from "@/utils/bookingStatus";
import type { TrackingView } from "../types";

/** The passenger's bookings, active first, then newest. */
export async function loadMyBookings() {
  return passengerApi.getMyBookings();
}

/** One booking shaped for the live screen: pins, route line, map centre. */
export async function loadTrackingView(id: string): Promise<TrackingView> {
  const booking = await passengerApi.getBooking(id);
  const markers: MapMarker[] = [
    {
      id: "pickup",
      label: booking.pickup.name,
      coordinate: [booking.pickup.lng, booking.pickup.lat],
      kind: "pickup",
    },
    {
      id: "destination",
      label: booking.destination.name,
      coordinate: [booking.destination.lng, booking.destination.lat],
      kind: "destination",
    },
  ];

  const midpoint: MapCoordinate = [
    (booking.pickup.lng + booking.destination.lng) / 2,
    (booking.pickup.lat + booking.destination.lat) / 2,
  ];

  return {
    booking,
    markers,
    // A straight line stands in for the road path; the map abstraction draws
    // whatever it is given. isActiveStatus decides whether the trip is still
    // worth drawing at all.
    route: isActiveStatus(booking.status)
      ? [
          [booking.pickup.lng, booking.pickup.lat],
          [booking.destination.lng, booking.destination.lat],
        ]
      : undefined,
    center: midpoint,
  };
}
