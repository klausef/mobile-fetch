import type { Booking, MapCoordinate, MapMarker } from "@/services/maps/mapProvider";

/** The trip the rider is working, shaped for its screen. */
export interface ActiveTripView {
  booking: Booking;
  markers: MapMarker[];
  route: MapCoordinate[];
  center: MapCoordinate;
  /** The one action that moves this trip forward. */
  nextAction: { status: Booking["status"]; label: string } | null;
}
