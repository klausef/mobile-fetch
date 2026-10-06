/**
 * The rider's navigation contract.
 *
 * Two regressions came out of splitting the rider dashboard into a bookings
 * list and a separate ride screen, and neither is visible in a unit test that
 * only inspects the tab list:
 *
 *  1. `NavLink` matches on path *prefixes* by default, so `to="/rider"` was
 *     also "active" on `/rider/ride` and two tabs lit up at once.
 *  2. GPS streaming lived inside one screen, so opening the ride screen stopped
 *     it — freezing the passenger's live map at exactly the moment it matters.
 *
 * These are source-level assertions. They are not as strong as rendering the
 * components, but they fail loudly when somebody reintroduces either bug,
 * which is the point: both shipped through a fully green suite once already.
 */
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { roleTabs } from "../src/lib/bottomTabs";

const read = (path: string) => readFileSync(path, "utf8");

const bottomTabs = read("src/components/BottomTabs.tsx");
const appShell = read("src/components/AppShell.tsx");
const riderDashboard = read("src/pages/RiderDashboard.tsx");
const main = read("src/main.tsx");

describe("the bottom bar matches tabs exactly", () => {
  test("NavLink is told to match the whole path", () => {
    // Without `end`, react-router matches on a prefix and `/rider` counts as
    // active on `/rider/ride`. Matched between the opening tag and the
    // className so the prop has to sit on this NavLink, not somewhere else.
    const navLink = bottomTabs.slice(
      bottomTabs.indexOf("<NavLink"),
      bottomTabs.indexOf("<NavLink") + 900,
    );
    expect(navLink).toMatch(/^\s*end\s*$/m);
  });

  test("the rider's two routes really are nested, which is why `end` matters", () => {
    // Pinned deliberately: `/rider/ride` IS a sub-path of `/rider`, so this
    // pair is exactly the case `end` exists to handle. If someone ever
    // reorders these into non-overlapping paths the assertion tells them this
    // guard has stopped being load-bearing and can be revisited.
    const paths = roleTabs("rider", true).map((tab) => tab.to);
    expect(paths).toContain("/rider");
    expect(paths).toContain("/rider/ride");
    expect("/rider/ride".startsWith("/rider/")).toBe(true);
  });

  test("every rider route has a tab of its own", () => {
    const withRide = roleTabs("rider", true).map((tab) => tab.to);
    expect(withRide).toContain("/rider");
    expect(withRide).toContain("/rider/ride");
  });
});

describe("GPS streaming survives navigation", () => {
  test("the shell owns the streaming, not a single screen", () => {
    expect(appShell).toContain("useLocationStreaming");
  });

  test("the rider dashboard no longer streams it itself", () => {
    // A second, screen-local interval is what caused the freeze: the rider
    // opened the ride screen, that screen's predecessor unmounted, and the
    // passenger's marker stopped moving.
    //
    // `updateLocation` is still called once, to take a fix at the moment the
    // rider flips themselves online. What must not come back is the timer.
    expect(riderDashboard).not.toContain("setInterval");
    expect(riderDashboard).not.toContain("STREAM_INTERVAL_MS");
  });

  test("the ride screen does not stream it either", () => {
    expect(read("src/pages/RiderRide.tsx")).not.toContain("setInterval");
  });
});

describe("light mode is genuinely the default", () => {
  test("the theme provider disables the system preference", () => {
    // next-themes defaults `enableSystem` to true, and `defaultTheme` falls
    // back to "system" unless it is explicitly false. Naming "light" without
    // this flag leaves a dark-mode phone repainting a bright brand app.
    //
    // Matched against the ThemeProvider element itself rather than the whole
    // file: a comment explaining this very flag would otherwise satisfy the
    // assertion while the attribute was gone.
    const tag = main.slice(
      main.indexOf("<ThemeProvider"),
      main.indexOf("/>", main.indexOf("<ThemeProvider")),
    );
    expect(tag).toMatch(/defaultTheme="light"/);
    expect(tag).toMatch(/enableSystem=\{false\}/);
  });

  test("settings offer no unresolvable theme", () => {
    // "system" is not a theme next-themes can resolve when enableSystem is
    // false; selecting it would set a literal "system" class and change
    // nothing while appearing to work. Matched on the value list rather than
    // the whole file, which still mentions the word in a comment explaining
    // exactly why it is not offered.
    const sheet = read("src/components/SettingsSheet.tsx");
    const options = sheet.slice(sheet.indexOf("const THEMES"));
    expect(options.slice(0, options.indexOf("] as const"))).not.toContain(
      '"system"',
    );
  });
});

describe("the dead store-correction sheet is gone", () => {
  test("the dashboard keeps no unreachable sheet", () => {
    // storeEdit could never be set to non-null once the live-ride card moved,
    // so the sheet and its whole handler were unreachable code.
    expect(riderDashboard).not.toContain("storeEdit");
    expect(riderDashboard).not.toContain("PlaceSearch");
  });

  test("the ride screen owns the store correction instead", () => {
    const ride = read("src/pages/RiderRide.tsx");
    expect(ride).toContain("Correct the store");
    expect(ride).toContain("setStoreEdit({");
  });
});