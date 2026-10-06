/**
 * "Who is riding?" — booking for somebody who has no Fetch account.
 *
 * The feature is small and the rules around it are not. Three things have to
 * hold at once and are easy to break separately:
 *
 *   1. The booker is always the authenticated session. There is no `bookerId`
 *      argument anywhere, so a client cannot book a ride against somebody else's
 *      account. That is asserted structurally, because it is a property of the
 *      signature rather than of a line of logic.
 *
 *   2. For "myself" the passenger is the booker, and their name and number come
 *      from the *server's* profile — not from anything the client sent. A
 *      client that posts `passengerType: "self"` alongside somebody else's phone
 *      must not be able to put that number on the rider's screen.
 *
 *   3. Rides created before this existed have no passenger fields at all. They
 *      are treated as "self", which is what every one of them meant. Nothing is
 *      rewritten and nothing old changes meaning.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

import {
  acceptanceLine,
  canBookForPassenger,
  isValidPassengerPhone,
  MIN_PASSENGER_NAME,
  validatePassenger,
  type WhoIsRidingValue,
} from "../src/lib/passenger.ts";
import { passengerFromFields } from "../src/convex/lib/passenger.ts";

const rides = readFileSync("src/convex/rides.ts", "utf8");
const schema = readFileSync("src/convex/schema.ts", "utf8");
const riders = readFileSync("src/convex/riders.ts", "utf8");
const home = readFileSync("src/pages/CommuterHome.tsx", "utf8");
const summary = readFileSync("src/components/ride/BookingSummary.tsx", "utf8");
const modal = readFileSync("src/components/ride/RideRequestModal.tsx", "utf8");
const riderRide = readFileSync("src/pages/RiderRide.tsx", "utf8");

const requestRide = (() => {
  const start = rides.indexOf("export const requestRide");
  const next = rides.indexOf("\nexport const ", start + 1);
  return rides.slice(start, next === -1 ? rides.length : next);
})();

const other = (over: Partial<WhoIsRidingValue> = {}): WhoIsRidingValue => ({
  passengerType: "other",
  passengerName: "Juan Dela Cruz",
  passengerPhone: "09171234567",
  ...over,
});
const self = (over: Partial<WhoIsRidingValue> = {}): WhoIsRidingValue => ({
  passengerType: "self",
  passengerName: "",
  passengerPhone: "",
  ...over,
});

describe("Philippine mobile numbers", () => {
  test("the two formats a commuter actually types both work", () => {
    expect(isValidPassengerPhone("09171234567")).toBe(true); // 09XXXXXXXXX
    expect(isValidPassengerPhone("+639171234567")).toBe(true); // +639XXXXXXXXX
    expect(isValidPassengerPhone("9171234567")).toBe(true); // without the zero
  });

  test("spacing and punctuation a person types are tolerated", () => {
    // Rejecting a number because of a space is a booking they cannot complete,
    // which is worse than accepting a slightly untidy one.
    expect(isValidPassengerPhone("0917 123 4567")).toBe(true);
    expect(isValidPassengerPhone("(0917) 123-4567")).toBe(true);
  });

  test("numbers that cannot be dialled are refused", () => {
    expect(isValidPassengerPhone("")).toBe(false);
    expect(isValidPassengerPhone("12345")).toBe(false);
    expect(isValidPassengerPhone("091712345")).toBe(false); // 9 digits, too few
    expect(isValidPassengerPhone("+1234567890123456")).toBe(false); // 16
    expect(isValidPassengerPhone(undefined)).toBe(false);
  });

  test("the client agrees with the server on the boundary", () => {
    // `normalizePhone` in convex/lib/auth.ts is the authority and takes 10-15
    // digits. If these two ever disagree the user is the one who finds out:
    // a client that is stricter blocks a booking the server would have taken,
    // and one that is looser fails after the round trip.
    const auth = readFileSync("src/convex/lib/auth.ts", "utf8");
    expect(auth).toContain("digits.length < 10 || digits.length > 15");
    expect(isValidPassengerPhone("1234567890")).toBe(true); // exactly 10
    expect(isValidPassengerPhone("123456789012345")).toBe(true); // exactly 15
    expect(isValidPassengerPhone("123456789")).toBe(false); // 9
    expect(isValidPassengerPhone("1234567890123456")).toBe(false); // 16
  });
});

describe("the booking screen refuses an incomplete passenger", () => {
  test("myself never has anything to validate", () => {
    // There is no field to get wrong: the server reads the commuter out of
    // their own profile.
    expect(validatePassenger(self())).toEqual({});
    expect(canBookForPassenger(self())).toBe(true);
  });

  test("someone else needs both a name and a number", () => {
    expect(validatePassenger(other())).toEqual({});
    expect(validatePassenger(other({ passengerName: "" }))).toHaveProperty("name");
    expect(validatePassenger(other({ passengerName: "   " }))).toHaveProperty("name");
    expect(validatePassenger(other({ passengerPhone: "" }))).toHaveProperty("phone");
    expect(canBookForPassenger(other({ passengerName: "" }))).toBe(false);
    expect(canBookForPassenger(other({ passengerPhone: "12" }))).toBe(false);
  });

  test("a single letter is a typo, not a name", () => {
    expect(MIN_PASSENGER_NAME).toBe(2);
    expect(validatePassenger(other({ passengerName: "J" }))).toHaveProperty("name");
    expect(validatePassenger(other({ passengerName: "Jo" }))).not.toHaveProperty("name");
  });
});

describe("the booker is the session, never a form field", () => {
  test("requestRide has no booker argument to fill in", () => {
    // The strongest form of the rule: there is nothing to tamper with. If this
    // ever gains a `bookerId`, the guarantee is gone.
    expect(requestRide).not.toContain("bookerId");
  });

  test("the ride is written with the authenticated id", () => {
    expect(requestRide).toContain("const userId = await requireUserId(ctx)");
    expect(requestRide).toContain("commuterId: userId");
  });
});

describe("the server decides who is riding", () => {
  test("myself reads the passenger out of the profile", () => {
    // The client sends nothing for "self", and even if it did the server
    // overwrites: a tampered body must not reach the rider's screen.
    expect(requestRide).toContain('args.passengerType === "other" ? "other" : "self"');
    expect(requestRide).toContain("const booker = await getProfile(ctx, userId);");
    expect(requestRide).toContain("passengerUserId = userId;");
  });

  test("someone else is validated on the server, not just in the browser", () => {
    expect(requestRide).toContain("Enter the passenger's full name.");
    expect(requestRide).toContain("passengerPhone = normalizePhone(args.passengerPhone ?? \"\")");
  });

  test("the ride stores all four fields", () => {
    for (const field of [
      "passengerType,",
      "passengerUserId,",
      "passengerName,",
      "passengerPhone,",
    ]) {
      expect(requestRide).toContain(`\n      ${field}`);
    }
  });

  test("the fields are optional, so old rides still load", () => {
    expect(schema).toContain(
      'passengerType: v.optional(\n        v.union(v.literal("self"), v.literal("other")),\n      )',
    );
    expect(schema).toContain("passengerUserId: v.optional(v.id(\"users\"))");
    expect(schema).toContain("passengerName: v.optional(v.string())");
    expect(schema).toContain("passengerPhone: v.optional(v.string())");
  });
});

describe("old rides keep meaning what they meant", () => {
  const legacy = { passengerType: undefined, passengerName: undefined, passengerPhone: undefined };

  test("a ride with no passenger fields is the booker riding", () => {
    const p = passengerFromFields(legacy, { name: "Ranniel", phone: "09180000000" });
    expect(p.type).toBe("self");
    expect(p.isBooker).toBe(true);
    expect(p.name).toBe("Ranniel");
    expect(p.phone).toBe("09180000000");
    expect(p.bookedByName).toBeNull();
  });

  test("a ride with no fields and no profile is still renderable", () => {
    // Never a blank row: the rider has to see somebody even if the profile has
    // been deleted since.
    const p = passengerFromFields(legacy, null);
    expect(p.name).toBe("Passenger");
  });

  test("the stored snapshot wins over a profile edited later", () => {
    // The rider agreed to the number that was on the job at request time.
    const p = passengerFromFields(
      { passengerType: "self", passengerName: "Ranniel", passengerPhone: "09171234567" },
      { name: "Someone Else", phone: "09990000000" },
    );
    expect(p.name).toBe("Ranniel");
    expect(p.phone).toBe("09171234567");
  });

  test("someone else names the booker", () => {
    const p = passengerFromFields(
      { passengerType: "other", passengerName: "Juan Dela Cruz", passengerPhone: "09171234567" },
      { name: "Ranniel", phone: "09180000000" },
    );
    expect(p.type).toBe("other");
    expect(p.isBooker).toBe(false);
    expect(p.name).toBe("Juan Dela Cruz");
    expect(p.bookedByName).toBe("Ranniel");
  });
});

describe("the rider is told who they are collecting", () => {
  test("the request list resolves the passenger, not the booker", () => {
    // Resolved server-side from the ride, so the pop-up and the list cannot
    // disagree about who is being picked up.
    expect(riders).toContain("passengerFromFields(request.passengerFields, profile)");
    expect(riders).toContain("name: passenger.name,");
    expect(riders).toContain("phone: passenger.phone,");
    expect(riders).toContain("bookedByName: passenger.bookedByName,");
  });

  test("the booker's face and score never stand in for the passenger", () => {
    // A "someone else" passenger has no account, so borrowing the booker's
    // photo puts a different person's face beside the name the rider is about
    // to call — and borrowing the rating attaches a score for somebody who is
    // not in the car. Both must fall back rather than mislead.
    expect(riders).toContain("photoUrl: passenger.isBooker ? photoUrl : null");
    expect(riders).toContain("rating: passenger.isBooker");
    expect(riderRide).toContain("passenger && !passenger.isBooker");
    expect(riderRide).toContain("passenger?.isBooker && counterparty?.rating");
  });

  test("the resolver's scaffolding is not shipped to the client", () => {
    // `passengerFields` exists only to pass the raw ride fields into the
    // resolver. Spread into the response it would send the same name and number
    // twice for every shortlisted request.
    expect(riders).toContain("passengerFields: undefined");
  });

  test("the card names the passenger and says who booked", () => {
    expect(modal).toContain("Passenger");
    expect(modal).toContain("Booked by {request.bookedByName}");
    expect(modal).toContain("href={`tel:${request.phone}`}");
  });

  test("the live trip shows the passenger and rings the passenger", () => {
    expect(riderRide).toContain("const passenger = active.passenger;");
    expect(riderRide).toContain("Booked by {passenger.bookedByName}");
    expect(riderRide).toContain("passenger?.phone ?? counterparty?.phone");
  });

  test("the accept list row shows the same person as the card", () => {
    const dash = readFileSync("src/pages/RiderDashboard.tsx", "utf8");
    expect(dash).toContain("Booked by {request.bookedByName}");
  });
});

describe("the booker is told who they booked for", () => {
  test("the step asks, with both options", () => {
    const step = readFileSync("src/components/ride/WhoIsRiding.tsx", "utf8");
    expect(step).toContain("Who is riding?");
    expect(step).toContain("Choose who will be taking this ride.");
    expect(step).toContain('title="Myself"');
    expect(step).toContain('title="Someone else"');
  });

  test("myself never asks for a name to be typed", () => {
    // The name comes from the profile; an input here is a form that can only be
    // filled in wrong.
    const step = readFileSync("src/components/ride/WhoIsRiding.tsx", "utf8");
    const myselfCard = step.slice(
      step.indexOf('title="Myself"') - 400,
      step.indexOf('title="Myself"') + 100,
    );
    expect(myselfCard).not.toContain("<Input");
  });

  test("the summary states the passenger beside the trip", () => {
    expect(summary).toContain("Passenger");
    expect(summary).toContain("Booker");
    // Both lines are kept even when they are the same person, so the rider
    // always has one unambiguous line labelled "Passenger".
    expect(summary).toContain("Paying for this ride");
    expect(home).toContain("<WhoIsRiding");
    expect(home).toContain("passenger={");
    expect(home).toContain("bookerName={profile?.name ?? null}");
  });

  test("the confirm button is disabled while the passenger is incomplete", () => {
    // A courtesy, not the control — the server refuses regardless.
    expect(home).toContain("Object.keys(passengerErrors).length > 0");
  });

  test("the wording names the passenger only when it is somebody else", () => {
    expect(acceptanceLine({ name: "Juan Dela Cruz", isBooker: true })).toBe(
      "Your ride is confirmed.",
    );
    expect(acceptanceLine({ name: "Juan Dela Cruz", isBooker: false })).toBe(
      "Your ride is booked for Juan Dela Cruz.",
    );
    expect(home).toContain("Your ride is booked for ${active.passenger.name}.");
  });

  test("the booking resets to myself", () => {
    // The passenger on the last ride is not the passenger on the next one, and a
    // leftover name beside a default of "self" would be a booking nobody asked for.
    expect(home).toContain(
      'setWhoIsRiding({ passengerType: "self", passengerName: "", passengerPhone: "" })',
    );
  });
});

describe("the trip itself is untouched", () => {
  test("no new ride status was invented", () => {
    // The status machine is the one thing the whole app agrees on; "booked for
    // someone else" is a fact about a ride, not a new stage.
    expect(rides).not.toMatch(/passengerType:\s*v\.literal\("waiting_for_passenger"\)/);
    expect(requestRide).toContain('status: "SEARCHING"');
  });

  test("the booker still owns the payment and the notifications", () => {
    expect(requestRide).toContain("quotedFare: fare,");
    expect(requestRide).toContain("userId,");
    expect(requestRide).toContain("paymentMethod: payment.method,");
  });
});