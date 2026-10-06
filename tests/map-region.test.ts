/**
 * The map stays in Bukidnon.
 *
 * Three separate things can take the map out of the province, and each needed
 * its own fix: panning past the edge (the map had no `maxBounds` at all), a
 * search that answers with a Valencia in another country (MapTiler's
 * `proximity` is a hint, not a filter), and a GPS fix from a commuter who
 * opened the app somewhere we do not serve (which flew the camera off and left
 * them looking at a road no rider will ever come to).
 *
 * The three are deliberately different. The edge is a camera constraint. Search
 * is a filter on answers. A fix outside the province is a real reading that must
 * not be *moved* — so the camera falls back to the nearest city we cover while
 * the pickup stays exactly where GPS put it, which the existing out-of-area card
 * already explains.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  clampToRegion,
  isInRegion,
  isInServiceArea,
  nearestLiveCity,
  REGION,
} from "../src/lib/region.ts";

const MALAYBALAY = { lat: 8.1550421, lng: 125.1305726 };
const DAVAO = { lat: 7.1907, lng: 125.4553 };
const MANILA = { lat: 14.5995, lng: 120.9842 };
const VALENCIA_SPAIN = { lat: 39.4699, lng: -0.3763 };

describe("the province box", () => {
  test("Malaybalay is in it, and is the capital", () => {
    expect(isInRegion(MALAYBALAY)).toBe(true);
    expect(isInRegion(REGION.center)).toBe(true);
  });

  test("Davao City and Manila are not", () => {
    expect(isInRegion(DAVAO)).toBe(false);
    expect(isInRegion(MANILA)).toBe(false);
  });

  test("it is looser than the service area, on purpose", () => {
    // The two checks answer different questions. `isInServiceArea` is "will a
    // rider come here"; `isInRegion` is "is this still the province". Somebody in
    // Impasugong has no rider yet and must still see a map and be able to search.
    expect(isInServiceArea(DAVAO)).toBe(false);
    expect(isInRegion(DAVAO)).toBe(false);
    expect(REGION.bounds.maxLat - REGION.bounds.minLat).toBeGreaterThan(1);
  });

  test("nonsense is not in the region", () => {
    expect(isInRegion(null)).toBe(false);
    expect(isInRegion(undefined)).toBe(false);
    expect(isInRegion({ lat: Number.NaN, lng: 0 })).toBe(false);
  });
});

describe("clamping a camera", () => {
  test("a point inside is left exactly alone", () => {
    expect(clampToRegion(MALAYBALAY)).toEqual(MALAYBALAY);
  });

  test("Manila is pulled to the edge of the province", () => {
    const inside = clampToRegion(MANILA);
    expect(isInRegion(inside)).toBe(true);
    // North of the province and west of it, so each axis lands on the boundary
    // it crossed rather than being pulled to the far side.
    expect(inside.lat).toBe(REGION.bounds.maxLat);
    expect(inside.lng).toBe(REGION.bounds.minLng);
  });

  test("the clamp is total — a point of NaN still yields a usable one", () => {
    // Only reachable from a corrupt fix, but a camera handed NaN renders
    // nothing at all, which is worse than showing the wrong place.
    const inside = clampToRegion({ lat: Number.NaN, lng: Number.NaN });
    expect(Number.isFinite(inside.lat)).toBe(true);
    expect(Number.isFinite(inside.lng)).toBe(true);
  });

  test("the clamp cannot walk outside the bounds either", () => {
    // Outside means "less than min" or "more than max" in either direction.
    for (const corner of [
      { lat: -89, lng: -179 },
      { lat: 89, lng: 179 },
    ]) {
      expect(isInRegion(clampToRegion(corner))).toBe(true);
    }
  });
});

describe("the nearest live city", () => {
  test("a fix in Davao City resolves to a city we cover", () => {
    const nearest = nearestLiveCity(DAVAO);
    expect(nearest).not.toBeNull();
    expect(isInServiceArea(nearest)).toBe(true);
    // Not Manila, and not Valencia.
    expect(nearest?.name).not.toBe("Manila");
  });

  test("a fix inside a covered city resolves to that city", () => {
    expect(nearestLiveCity(MALAYBALAY)?.name).toBe("Malaybalay City");
  });

  test("a point in another country still gets a real city", () => {
    expect(nearestLiveCity(VALENCIA_SPAIN)).not.toBeNull();
  });

  test("nothing in, nothing out", () => {
    expect(nearestLiveCity(null)).toBeNull();
    expect(nearestLiveCity({ lat: Number.NaN, lng: 1 })).toBeNull();
  });
});

describe("the map itself", () => {
  const view = readFileSync("src/components/map/MapView.tsx", "utf8");

  test("it has an edge", () => {
    // Without maxBounds this is a generic slippy map: a pinch goes to the
    // satellite and a stray drag lands in Kota Kinabalu.
    expect(view).toContain("maxBounds");
    expect(view).toContain("REGION.bounds.minLng");
    expect(view).toContain("REGION.bounds.maxLat");
  });

  test("both cameras are clamped, not just the initial one", () => {
    // The centre prop and the followed point. A rider driving in from Davao
    // would otherwise drag the map off the province mid-follow.
    expect(view.match(/clampToRegion/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(view).toContain("clampToRegion(center)");
    expect(view).toContain("clampToRegion(followTarget)");
  });
});

describe("search answers only from the province", () => {
  const provider = readFileSync("src/lib/map-service.ts", "utf8");

  test("both providers filter their answers", () => {
    // MapTiler: proximity and country=ph are hints, so it will answer Valencia
    // with one in Spain. OSM: its second pass exists to fix spellings, not to
    // leave the province.
    expect(provider.match(/isInRegion\(place\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("the spelling fallback still runs, it just cannot leave", () => {
    // Removed rather than tightened would be worse: a Bukidnon barangay OSM
    // files under a neighbouring town's name would stop resolving.
    expect(provider).toContain("bounded: \"0\"");
    expect(provider).toContain("return anywhere.filter((place) => isInRegion(place))");
  });
});
