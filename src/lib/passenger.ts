/**
 * Who is riding — the shape, and the checks that go with it.
 *
 * Dependency-free on purpose, for the same reason the fare and region modules
 * are: this is the rule the booking screen enforces *and* the shape the server
 * validates against, so it has to be assertable without a component tree or a
 * Convex runtime.
 *
 * The server does not trust any of this. `requestRide` re-derives the passenger
 * from the authenticated session and re-validates on its own; this module is the
 * courtesy to the person typing, and a disabled button is not a security
 * control.
 */

export type PassengerType = "self" | "other";

/** What the booking screen holds for this step. */
export type WhoIsRidingValue = {
  passengerType: PassengerType;
  passengerName: string;
  passengerPhone: string;
};

/** The default: what every booking meant before this step existed. */
export const DEFAULT_WHO_IS_RIDING: WhoIsRidingValue = {
  passengerType: "self",
  passengerName: "",
  passengerPhone: "",
};

/**
 * Minimum passenger name length.
 *
 * Two characters, so a single "J" is read as a typo rather than accepted as a
 * name the rider has to read aloud at a junction.
 */
export const MIN_PASSENGER_NAME = 2;

/**
 * Whether a Philippine mobile number is dialable.
 *
 * 10–15 digits once everything that is not a digit is stripped. That covers
 * 09XXXXXXXXX (11 digits) and +639XXXXXXXXX (12 digits with the country code,
 * 11 without the plus and the zero), and rejects the rest.
 *
 * Deliberately loose about shape and strict only about length: being clever
 * about prefixes rejects real numbers, and a rejected number is a booking the
 * person cannot complete. The server applies the same rule through
 * `normalizePhone`, which is the authority.
 */
export function isValidPassengerPhone(raw: string | null | undefined): boolean {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * What's wrong with a passenger choice, if anything.
 *
 * Empty for "self" by construction: the passenger is then the authenticated
 * commuter, and their details are read server-side out of their own profile, so
 * there is nothing on this form that can be wrong.
 */
export function validatePassenger(
  value: WhoIsRidingValue,
): { name?: string; phone?: string } {
  const errors: { name?: string; phone?: string } = {};
  if (value.passengerType !== "other") return errors;

  if (value.passengerName.trim().length < MIN_PASSENGER_NAME) {
    errors.name = "Enter the passenger's full name.";
  }
  if (!isValidPassengerPhone(value.passengerPhone)) {
    errors.phone = "Enter a valid mobile number (09XXXXXXXXX).";
  }
  return errors;
}

/** True when the booking may be submitted as it stands. */
export function canBookForPassenger(value: WhoIsRidingValue): boolean {
  return Object.keys(validatePassenger(value)).length === 0;
}

/**
 * The line the booker is told about a trip.
 *
 * "Your ride is confirmed." answers the wrong question when the person waiting
 * at the pickup is somebody else, so the passenger is named.
 */
export function acceptanceLine(
  passenger: { name: string; isBooker: boolean },
): string {
  return passenger.isBooker
    ? "Your ride is confirmed."
    : `Your ride is booked for ${passenger.name}.`;
}