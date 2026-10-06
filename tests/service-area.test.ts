/**
 * Where Fetch says it runs.
 *
 * The app used to claim all 22 municipalities, which is a promise it cannot
 * keep: a request from a town with no rider online sits in SEARCHING until the
 * commuter cancels it. Claiming two cities and meaning it is the whole point,
 * and it is the kind of claim that rots quietly — somebody adds a third city to
 * the map, or widens a radius, and the copy keeps saying twenty-two.
 *
 * These are pure-function tests, so they are real assertions rather than
 * source greps: the distance maths, the radius boundary, and the guarantee
 * that a city cannot be both live and planned.
 */
import { describe, expect, test } from "bun:test";
import {
  distanceKm,
  isInServiceArea,
  liveCityFor,
  LIVE_CITIES,
  LIVE_CITY_NAMES,
  MUNICIPALITIES,
  PLANNED_MUNICIPALITIES,
} from "../src/lib/region";
import { LEGAL, legalFor } from "../src/lib/legal";

describe("the service area is the two cities we actually staff", () => {
  test("it is Malaybalay and Valencia", () => {
    expect(LIVE_CITY_NAMES).toEqual(["Malaybalay City", "Valencia City"]);
  });

  test("a city is never both live and coming next", () => {
    // The failure this catches is a city added to one list and not removed
    // from the other, which would have the app claiming riders in a town twice.
    for (const name of LIVE_CITY_NAMES) {
      expect(PLANNED_MUNICIPALITIES).not.toContain(name);
      expect(MUNICIPALITIES).toContain(name);
    }
    expect(LIVE_CITY_NAMES.length + PLANNED_MUNICIPALITIES.length).toBe(
      MUNICIPALITIES.length,
    );
  });

  test("every live city has a real centre and a sane radius", () => {
    for (const city of LIVE_CITIES) {
      expect(city.lat).toBeGreaterThan(7);
      expect(city.lat).toBeLessThan(9);
      expect(city.lng).toBeGreaterThan(124);
      expect(city.lng).toBeLessThan(126);
      // A radius of zero would mean the town centre and nothing else; a radius
      // of 100 km would mean the province again, which is what we stopped
      // claiming.
      expect(city.radiusKm).toBeGreaterThan(2);
      expect(city.radiusKm).toBeLessThan(25);
      expect(city.blurb.length).toBeGreaterThan(20);
    }
  });
});

describe("liveCityFor answers with a name or with nothing", () => {
  test("each city centre is inside its own radius", () => {
    for (const city of LIVE_CITIES) {
      expect(liveCityFor(city)?.name).toBe(city.name);
    }
  });

  test("a town with no riders is outside", () => {
    // Maramag is a real place in the data and genuinely not staffed yet.
    expect(liveCityFor({ lat: 7.7610686, lng: 125.005158 })).toBeNull();
    expect(isInServiceArea({ lat: 7.7610686, lng: 125.005158 })).toBe(false);
  });

  test("somewhere off the continent is outside rather than a crash", () => {
    expect(liveCityFor({ lat: 0, lng: 0 })).toBeNull();
    expect(liveCityFor(null)).toBeNull();
    expect(liveCityFor(undefined)).toBeNull();
    // A GPS fix mid-fix can be NaN, and NaN comparisons are all false, which
    // would otherwise read as "outside" for the wrong reason — or worse, as a
    // point that passes every check.
    expect(liveCityFor({ lat: Number.NaN, lng: 125 })).toBeNull();
  });

  test("the boundary itself counts as inside", () => {
    // A passenger exactly 12 km out should not be told they are outside,
    // because the alternative is a rider being cancelled one metre from the
    // line. The longitude step is scaled by cos(lat): a degree of longitude is
    // shorter than a degree of latitude away from the equator, and at 8 degrees
    // north the difference is enough to miss the line by over a hundred metres.
    const city = LIVE_CITIES[0];
    const kmPerDegreeLng = 111.32 * Math.cos((city.lat * Math.PI) / 180);
    const step = (km: number) => ({
      lat: city.lat,
      lng: city.lng + km / kmPerDegreeLng,
    });

    expect(distanceKm(city, step(city.radiusKm))).toBeCloseTo(city.radiusKm, 1);
    expect(isInServiceArea(step(city.radiusKm))).toBe(true);
    // And just outside it is outside, so the test above is not passing because
    // the radius is being ignored.
    expect(isInServiceArea(step(city.radiusKm * 1.5))).toBe(false);
  });
});

describe("distanceKm behaves like a distance", () => {
  test("a point is zero from itself", () => {
    expect(distanceKm({ lat: 8.15, lng: 125.13 }, { lat: 8.15, lng: 125.13 })).toBe(0);
  });

  test("it is symmetric", () => {
    const a = { lat: 8.1550421, lng: 125.1305726 };
    const b = { lat: 7.9111239, lng: 125.0933669 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6);
  });

  test("Malaybalay to Valencia is about 28 km", () => {
    // The two live cities are ~28 km apart, which is the point of covering
    // both: a rider can take a trip between them.
    const malaybalay = LIVE_CITIES[0];
    const valencia = LIVE_CITIES[1];
    expect(distanceKm(malaybalay, valencia)).toBeGreaterThan(24);
    expect(distanceKm(malaybalay, valencia)).toBeLessThan(32);
  });
});

describe("the legal copy is present in both languages", () => {
  test("both translations carry the same paragraphs", () => {
    // The failure this catches: a paragraph added to the English and not the
    // Cebuano, so a Bisaya reader quietly gets a shorter document.
    for (const kind of ["terms", "privacy"] as const) {
      expect(LEGAL[kind].ceb.length).toBe(LEGAL[kind].en.length);
      expect(LEGAL[kind].en.length).toBeGreaterThan(2);
    }
  });

  test("no paragraph is blank or a placeholder", () => {
    for (const kind of ["terms", "privacy"] as const) {
      for (const locale of ["en", "ceb"] as const) {
        for (const paragraph of legalFor(kind, locale)) {
          expect(paragraph.trim().length).toBeGreaterThan(30);
        }
      }
    }
  });

  test("the two documents are not the same text", () => {
    expect(LEGAL.terms.en).not.toEqual(LEGAL.privacy.en);
  });
});
