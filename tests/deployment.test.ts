/**
 * One product, one backend.
 *
 * The failure this guards against actually happened. The web client took its
 * deployment from `import.meta.env.VITE_CONVEX_URL` while the phone took its
 * from `app.json`, so the two could disagree — and did: a build was handed the
 * environment's URL instead of the project's, and the APK shipped pointing at a
 * Convex deployment the owner does not control. Nothing crashed. Every query
 * answered. The dashboard just showed rides that were not there, and the phone
 * wrote to a database nobody was reading — which is the kind of split that is
 * found by a user noticing their trip is missing, not by a test.
 *
 * So: the web deployment is a literal in `src/lib/convex.ts` (not a variable
 * the environment can redirect), and the phone has to name the same one. These
 * contracts are cheap and they pin both halves.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const web = readFileSync("src/lib/convex.ts", "utf8");
const appJson = JSON.parse(readFileSync("mobile/app.json", "utf8")) as {
  expo?: { extra?: { convexUrl?: string } };
};

const pinned = /const DEPLOYMENT_URL = "([^"]+)"/.exec(web)?.[1] ?? "";

describe("the web client names its deployment", () => {
  test("it is a literal, not the environment", () => {
    // An already-set process environment variable wins over `.env.local` in
    // Vite, so reading the URL there is what let a build bind to a different
    // deployment than the repository declares.
    expect(pinned).toMatch(/^https:\/\/[a-z0-9-]+\.convex\.cloud$/);
    expect(web).toContain("new ConvexReactClient(DEPLOYMENT_URL)");
  });

  test("a disagreeing VITE_CONVEX_URL is reported, not obeyed", () => {
    // The silent case is the one that cost a build: it has to say so, and it
    // must not then construct the client with the other value.
    expect(web).toContain("configuredUrl !== DEPLOYMENT_URL");
    expect(web).toContain("console.warn");
    expect(web).not.toMatch(/new ConvexReactClient\(\s*configuredUrl/);
  });
});

describe("the phone names the same one", () => {
  test("app.json carries the pinned deployment", () => {
    // Two backends for one product means a ride booked on the phone is not a
    // ride the dashboard can see, and the rider can never accept it.
    expect(appJson.expo?.extra?.convexUrl).toBe(pinned);
  });

  test("and the app refuses to start without one", () => {
    // An empty URL used to reach the client as "" and fail with a message
    // about deployment addresses, which says nothing about where to look.
    const mobile = readFileSync("mobile/lib/convex.ts", "utf8");
    expect(mobile).toContain("No Convex deployment configured");
    expect(mobile).toContain("Constants.expoConfig");
  });
});
