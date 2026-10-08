import type { MapCoordinate, MapMarker } from "@/services/maps/mapProvider";
import type { Booking } from "@/types";

/** What the live tracking screen renders. */
export interface TrackingView {
  booking: Booking;
  markers: MapMarker[];
  route: MapCoordinate[] | undefined;
  /** Where the map is centred: the pickup, or the moving midpoint. */
  center: MapCoordinate;
}
