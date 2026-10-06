/**
 * Which service a commuter is asking for.
 *
 * The three services are one screen at `/book`, so the choice lives in the URL
 * (`/book?type=pabili`) rather than in component state: that is what survives a
 * refresh, a shared link, and the back button. The home hub links here for each
 * service card; see `bookUrl` in `booking-url.ts` for the link it writes.
 */
export type BookingType = "ride" | "pabili" | "padala";

export const BOOKING_TYPES: BookingType[] = ["ride", "pabili", "padala"];

/** The service a plain "Book a ride" link opens. Same string as the URL value. */
export const DEFAULT_BOOKING_TYPE: BookingType = "ride";

/**
 * Read a service out of a query string.
 *
 * Falls back to a plain ride for anything unrecognised. The value is typed as
 * `string | null` at the boundary because it comes straight from the URL, and
 * an unvalidated cast would let `?type=groceries` through and render the padala
 * form to someone who asked for neither.
 */
export function resolveBookingType(raw: string | null | undefined): BookingType {
  return BOOKING_TYPES.includes(raw as BookingType)
    ? (raw as BookingType)
    : DEFAULT_BOOKING_TYPE;
}

/**
 * Who is being shown the label.
 *
 * The same `padala` ride is called two different things on the two sides of the
 * platform: a commuter is booking it, so "Pasugo" is the word they use; a rider
 * is being handed the job, and "Padala" is the word they use. Getting this
 * backwards shows an internal value to a passenger, so the audience is an
 * argument rather than something each screen decides for itself.
 */
export type ServiceAudience = "commuter" | "rider";

/**
 * Which audience a signed-in profile should be addressed as.
 *
 * Riders are the only role that reads a service name differently, so "is this
 * a rider" is the whole rule. An unknown or missing role resolves to the
 * passenger's wording: that is the safer default, because a rider who briefly
 * reads "Pasugo" is looking at a word they still understand, whereas showing a
 * commuter's "Padala" leaks the internal name into the booking flow.
 */
export function audienceForRole(
  role: string | null | undefined,
): ServiceAudience {
  return role === "rider" ? "rider" : "commuter";
}

/**
 * Whether a trip still needs something from someone.
 *
 * Everything that is neither finished nor cancelled. Activity groups on this:
 * a commuter opening the app has one question — "is anything happening right
 * now?" — and burying an assigned ride under last month's receipts answers it
 * badly.
 */
export function isOngoingStatus(status: string): boolean {
  return status !== "COMPLETED" && status !== "CANCELLED";
}

/**
 * One half of a trip list, by the same rule as `isOngoingStatus`.
 *
 * Activity renders "Ongoing" and "Past" as two sections of one list. The
 * grouping lives here rather than in the list component so the split can be
 * tested, and so a third group is a deliberate change instead of a second
 * filter somebody re-derives slightly differently.
 */
export function ridesInGroup<T extends { status: string }>(
  rides: T[],
  group: "ongoing" | "past",
): T[] {
  return rides.filter((ride) =>
    group === "ongoing"
      ? isOngoingStatus(ride.status)
      : !isOngoingStatus(ride.status),
  );
}

/**
 * The service name as one audience should read it.
 *
 * A plain ride has no service name — the history list leaves it off the chip
 * rather than printing "Ride" next to a status the row already shows.
 */
export function serviceLabel(
  bookingType: string | null | undefined,
  audience: ServiceAudience,
): string {
  if (bookingType === "pabili") return "Pabili";
  if (bookingType === "padala") {
    return audience === "rider" ? "Padala" : "Pasugo";
  }
  return "";
}
