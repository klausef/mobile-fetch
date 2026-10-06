/**
 * Backtracking a trip: who was driving, and how do you reach them.
 *
 * The console's ride table used to answer "FETCH-000006" and nothing else. That
 * is enough to count trips and useless for the two questions a support call
 * actually asks: which rider accepted this, and what is their number. The
 * passenger's details belong in the same row for the same reason, because the
 * person who rang is usually the one who booked it.
 *
 * One rule in here is a bug fix rather than a feature. `listLiveRides` used to
 * return a rider *only* when that rider had a GPS fix, because the row existed
 * to draw the console map. So a driver who accepted and then lost signal read as
 * nobody on the trip — hiding exactly the trip an admin needs to trace. Identity
 * and location are separate answers now, and the contracts below are what stop
 * them from being folded back together.
 *
 * The assertions are on the source, as elsewhere in this suite: the server
 * handler cannot be called without a Convex runtime, and a rule that is only
 * checked in a running console is a rule nobody checks.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const admin = readFileSync("src/convex/admin.ts", "utf8");
const operations = readFileSync("src/components/admin/OperationsTabs.tsx", "utf8");
const overview = readFileSync("src/components/admin/OverviewTab.tsx", "utf8");

/** The slice of a source file between two markers, for scoping an assertion. */
const between = (source: string, from: string, to: string): string => {
  const start = source.indexOf(from);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(to, start + from.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

const liveRides = between(admin, "export const listLiveRides", "\n/** How many live rides");
const ridesTab = between(operations, "export function RidesTab", "/* ── Settings");
const exportBody = between(admin, "export const exportRidesCsv", "\nexport const");

/**
 * The quoted strings of an array literal, in order.
 *
 * Used to compare a table's header list against the header list it is exported
 * as: the two are written down separately, and nothing but a test stops them
 * drifting into a different order or a different length.
 */
const stringArray = (source: string, name: string): string[] => {
  const start = source.indexOf(`${name} = [`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("]", start);
  return [...source.slice(start, end).matchAll(/"([^"]*)"/g)].map((m) => m[1]);
};

/**
 * The top-level expressions of an array literal, in order.
 *
 * Splits on the commas that separate values, not the ones inside a
 * `people.get(id)?.name ?? ""` — otherwise a nested comma reads as a column and
 * the count comes out wrong in a way that looks like a real bug.
 */
const arrayValues = (literal: string): string[] => {
  const values: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < literal.length; i += 1) {
    const char = literal[i]!;
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if ("([{".includes(char)) depth += 1;
    else if (")]}".includes(char)) depth -= 1;
    else if (char === "," && depth === 0) {
      values.push(literal.slice(start, i).trim());
      start = i + 1;
    }
  }
  // A trailing comma ends the list rather than starting an empty column.
  const tail = literal.slice(start).trim().replace(/,$/, "").trim();
  if (tail) values.push(tail);
  return values.filter(Boolean);
};

describe("who is on the trip", () => {
  test("both ends of the ride are named", () => {
    // The passenger is usually the one who rang about it, so their name is the
    // first thing to check, not an afterthought.
    expect(liveRides).toContain("commuter: who(ride.commuterId)");
    expect(liveRides).toContain("rider: ride.riderId ? who(ride.riderId) : null");
  });

  test("an assigned rider is named even with no GPS fix", () => {
    // The regression this whole section exists for. `rider` is gated on the
    // assignment; only `riderGps` may be gated on the signal.
    expect(liveRides).toContain("rider: ride.riderId ? who(ride.riderId) : null");
    expect(liveRides).not.toMatch(/rider:\s*hasGps/);
    expect(liveRides).not.toMatch(/rider:\s*riderRow\s*\?/);
  });

  test("identity and location are separate answers", () => {
    expect(liveRides).toContain("riderGps: hasGps");
    expect(liveRides).toContain("lat: riderRow!.lat!");
    expect(liveRides).toContain("lng: riderRow!.lng!");
  });

  test("the phone comes back with the name", () => {
    // A name is what you recognise and a number is what you can ring. Sending
    // only the name makes the admin open the Users tab for every support call.
    expect(liveRides).toContain("return { name: profile.name, phone: profile.phone }");
  });

  test("one profile read per distinct person, not per ride", () => {
    // Forty trips for one commuter costs one read. A read per ride is a
    // console query limit waiting for a busy evening.
    expect(liveRides).toContain("const people = new Set<string>()");
    expect(liveRides).toContain("people.add(ride.commuterId)");
    expect(liveRides).toContain("if (ride.riderId) people.add(ride.riderId)");
    const profileReads = liveRides.match(/getProfile\(ctx/g) ?? [];
    expect(profileReads.length).toBe(1);
  });
});

describe("the console map draws the rider, not the identity", () => {
  test("markers come off riderGps", () => {
    expect(overview).toContain("if (ride.riderGps)");
    expect(overview).toContain("lat: ride.riderGps.lat");
    expect(overview).toContain("lng: ride.riderGps.lng");
    // An assigned rider with no signal is named on the trip without being drawn
    // on the map at a stale position.
    expect(overview).not.toMatch(/ride\.rider\??\.lat/);
    expect(overview).not.toMatch(/ride\.rider\??\.lng/);
  });
});

describe("the rides table says who and rings whom", () => {
  const headers = stringArray(operations, "const RIDE_HEADERS");

  test("the columns are the questions a support call asks", () => {
    expect(headers).toEqual([
      "Trip",
      "Requested",
      "Status",
      "Rider",
      "Rider phone",
      "Passenger",
      "Passenger phone",
      "Pickup",
      "Destination",
      "Fare",
    ]);
  });

  test("every column renders something, in the same order", () => {
    // A header with no cell leaves a blank column; a cell with no header is
    // invisible data. The labels are the only thing that ties the two together.
    const cells = [...ridesTab.matchAll(/<Cell label="([^"]+)"/g)].map((m) => m[1]);
    expect(cells).toEqual(headers);
  });

  test("both numbers are tappable, not just readable", () => {
    // Reading a number off a screen and typing it is the whole friction this
    // column was added to remove.
    expect(ridesTab).toContain("href={`tel:${ride.rider.phone}`}");
    expect(ridesTab).toContain("href={`tel:${ride.commuter.phone}`}");
  });

  test("an unassigned ride says so, and a missing number is not a lie", () => {
    // "Unassigned" is a real state a real trip is in. A dash there would read as
    // a driver who accepted and vanished.
    expect(ridesTab).toContain("Unassigned");
    expect(ridesTab).toContain('className="text-muted-foreground">—');
  });

  test("the row does not read identity off the GPS again", () => {
    expect(ridesTab).toContain("ride.rider?.name");
    expect(ridesTab).not.toContain("ride.riderGps");
  });
});

describe("the CSV carries the same story", () => {
  const headers = stringArray(admin, "const EXPORT_HEADERS");

  test("the row has one value per column, in the column order", () => {
    // A CSV with a missing value does not error and does not look broken: it
    // shifts every later column along and writes another person's number under
    // "Rider". The only thing that catches it is comparing the two lists.
    // Past the opening bracket: the marker itself contains one, which would
    // otherwise hold the scanner a level deep and swallow every comma.
    const literal = between(admin, "rides.map((ride) => [", "]),");
    const values = arrayValues(literal.slice(literal.indexOf("[") + 1));
    expect(values.length).toBe(headers.length);

    // Spot-check the order at the seams the new columns created, because
    // "the same length" is satisfied by two numbers in the wrong place too.
    expect(values[headers.indexOf("Passenger phone")]).toBe(
      'people.get(ride.commuterId)?.phone ?? ""',
    );
    expect(values[headers.indexOf("Rider phone")]).toBe(
      'ride.riderId ? (people.get(ride.riderId)?.phone ?? "") : ""',
    );
    expect(values[headers.indexOf("Pickup")]).toBe('ride.pickup.address ?? ""');
    expect(values[headers.indexOf("Fare")]).toBe("ride.fare");
  });

  test("both people and both numbers are columns", () => {
    expect(headers).toContain("Passenger");
    expect(headers).toContain("Passenger phone");
    expect(headers).toContain("Rider");
    expect(headers).toContain("Rider phone");
  });

  test("a number sits beside the name it belongs to", () => {
    // Header order is the column order, so a number separated from its name by
    // another column is a spreadsheet nobody can read by eye.
    expect(headers.indexOf("Passenger phone")).toBe(headers.indexOf("Passenger") + 1);
    expect(headers.indexOf("Rider phone")).toBe(headers.indexOf("Rider") + 1);
  });

  test("the unassigned rider exports empty, not as a borrowed name", () => {
    // A rider id that no longer resolves must not fall through to the
    // passenger's name, which is the obvious way to get this wrong.
    expect(exportBody).toContain("ride.riderId ? (people.get(ride.riderId)?.phone ?? \"\") : \"\"");
    expect(exportBody).toContain("ride.riderId ? (people.get(ride.riderId)?.name ?? \"\") : \"\"");
  });

  test("one profile read per distinct person, not per row", () => {
    expect(exportBody).toContain("const ids = new Set<string>()");
    const profileReads = exportBody.match(/getProfile\(ctx/g) ?? [];
    expect(profileReads.length).toBe(1);
  });

  test("the export is still built on the server, not in the browser", () => {
    // The client must not be able to decide what leaves the platform.
    expect(exportBody).toContain("EXPORT_HEADERS");
    expect(operations).toContain("const { csv, count } = await exportCsv({})");
  });
});