/**
 * The shared core, re-exported for the mobile app.
 *
 * Everything here is pure: no React, no DOM, no clock, no network. It is the
 * same modules the web app and the Convex server use, reached by relative
 * paths so Metro can watch them (see `metro.config.js`). The point is that
 * the fare the phone quotes and the fare the server charges are computed by
 * one function — the moment this file turns into a copy, the two can disagree.
 */

export type { FareBreakdown, FareBreakdownInput, FareTariff, RideType, RideTypeSpec } from "../../src/lib/fare-breakdown";
export {
  fareBreakdown,
  rideTypeSpec,
  formatSurge,
  isSurgeActive,
  surgeMultiplierFor,
  resolveRideType,
  normalizeSurge,
  resolveBillableKm,
  estimateEtaMinutesFor,
  polylineLengthKm,
  RIDE_TYPES,
  RIDE_TYPE_SPECS,
  DEFAULT_RIDE_TYPE,
  MAX_SURGE_MULTIPLIER,
  MAX_ROUTE_DETOUR,
  DEFAULT_TAX_RATE_PCT,
} from "../../src/lib/fare-breakdown";

export type { LatLng } from "../../src/lib/geo";
export type { Place } from "@/lib/places";
export type { Id } from "../../src/convex/_generated/dataModel";
export { DEFAULT_TARIFF } from "../../src/lib/geo";
export {
  distanceFareFor,
  haversineKm,
  formatPeso,
  formatDistance,
  formatEta,
  estimateEtaMinutes,
  shortAddress,
  AVERAGE_SPEED_KMH,
  NEAR_STORE_KM,
  estimateFare,
  estimateErrandFare,
} from "../../src/lib/geo";

export type { DriverStage, StoredFareBreakdown, TripSettlement, DemandCell } from "../../src/lib/driver";
export {
  DRIVER_PLATFORM_RATE,
  REQUEST_TIMEOUT_MS,
  driverStage,
  remainingMs,
  isRequestExpired,
  formatCountdown,
  formatDuration,
  etaMinutesFrom,
  tripDurationMs,
  settleTrip,
  demandCells,
  demandHeadline,
} from "../../src/lib/driver";

export type { BookingType, ServiceAudience } from "../../src/lib/booking";
export { BOOKING_TYPES, DEFAULT_BOOKING_TYPE, resolveBookingType, audienceForRole, isOngoingStatus, ridesInGroup, serviceLabel } from "../../src/lib/booking";

export type { PassengerType, WhoIsRidingValue } from "../../src/lib/passenger";
export { DEFAULT_WHO_IS_RIDING, MIN_PASSENGER_NAME, isValidPassengerPhone, validatePassenger, canBookForPassenger, acceptanceLine } from "../../src/lib/passenger";

export { initials, roleLabel } from "../../src/lib/account";
export { errorMessage } from "../../src/lib/errors";

export { api } from "../../src/convex/_generated/api";

export { whenLabel, timeLabel, countLabel, durationFromMs, titleCase } from "./format";
export { Crest, Wordmark, RideTimeline, PointMarker, WaveGradient } from "@/components/brand";

export { canSearchAddresses, searchPlaces, placeCaption, reverseGeocode } from "@/lib/places";
