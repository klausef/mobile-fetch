/**
 * The bottom bar's tab list.
 *
 * Three places, for both sides of the platform: where you start, the trips you
 * have, and the conversations about them. The keys are also the `activeKey`
 * each screen passes to the bar, so a typo here shows up as a tab that never
 * highlights rather than as an error. The URLs are pinned for the same reason.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { COMMUTER_TABS, roleTabs } from "../src/lib/bottomTabs.ts";
import { en } from "../src/lib/i18n/en";
import { ceb } from "../src/lib/i18n/ceb";

const nav = en.nav;

test("the commuter bar is Home, Activity and Chats", () => {
  expect(COMMUTER_TABS.map((tab) => tab.key)).toEqual([
    "home",
    "activity",
    "chats",
  ]);
});

test("each commuter tab points at its own screen", () => {
  // Home stays at /app because every "go home" link in the app already points
  // there (the post-auth redirect, onboarding, the rider's back link).
  expect(COMMUTER_TABS.map((tab) => tab.to)).toEqual([
    "/app",
    "/activity",
    "/chats",
  ]);
});

test("commuter tabs are labelled in everyday words", () => {
  expect(COMMUTER_TABS.map((tab) => tab.label)).toEqual([
    "Home",
    "Activity",
    "Chats",
  ]);
});

test("booking is not a tab — it is reached from Home", () => {
  // The services are cards on the home hub. A tab that swaps the form under
  // its own bar was harder to read, and it left the bar with no room for the
  // trip list or the chats.
  expect(COMMUTER_TABS.some((tab) => tab.to.startsWith("/book"))).toBe(false);
});

test("commuter tabs carry no History — Activity is that screen now", () => {
  expect(COMMUTER_TABS.some((tab) => tab.to === "/rides")).toBe(false);
});

describe("the rider's home does not repeat itself or editorialize", () => {
  // The dashboard used to carry a weekly-trend card under the earnings panel
  // reading "0 trips this week for ₱0.00. Fetch keeps 15% of each fare." Two
  // problems: the dark card directly above it already says "This week ₱0.00",
  // and a zero on a brand-new rider's dashboard reads as a failure rather than
  // as a quiet week.
  const dashboard = readFileSync("src/pages/RiderDashboard.tsx", "utf8");

  test("the duplicate weekly card is gone from the UI", () => {
    expect(dashboard).not.toContain("Fetch keeps");
    expect(dashboard).not.toContain("trips this week for");
    expect(dashboard).not.toContain("weekCount");
    // And its icon went with it, rather than lingering as a dead import.
    expect(dashboard).not.toContain("TrendingUp");
  });

  test("the weekly figure lives on the Dashboard tab, once", () => {
    // Moved rather than deleted: the earnings panel is now its own screen, and
    // it is the one place a rider reads their week.
    const overview = readFileSync("src/pages/RiderOverview.tsx", "utf8");
    expect(overview).toContain('label="This week"');
    expect(overview).toContain("formatPeso(earnings?.week ?? 0)");
    // Exactly one place across both rider screens, so it cannot creep back.
    expect(overview.split('label="This week"').length - 1).toBe(1);
    expect(dashboard).not.toContain('label="This week"');
  });

  test("the platform fee is still disclosed where it costs the rider", () => {
    // Removing it from the home screen is not hiding it. The settlement at the
    // end of the trip still shows the cut in full.
    const ride = readFileSync("src/pages/RiderRide.tsx", "utf8");
    expect(ride).toContain("Platform fee");
    expect(ride).toContain("settleTrip");
  });

  test("the booking screen kept the work and lost only the numbers", () => {
    // What stays is the reason a rider opens it between trips.
    expect(dashboard).toContain("Nearby requests");
    expect(dashboard).toContain("Go online");
    expect(dashboard).toContain("Accepting rides");
    expect(dashboard).toContain("Trip in progress");
    // And what left is what moved to the Dashboard tab.
    expect(dashboard).not.toContain("Earnings today");
    expect(dashboard).not.toContain("Save vehicle");
  });
});

describe("the home screen leads with the choice, not the promo", () => {
  // Ride / Pabili / Pasugo are the question the screen exists to answer;
  // "Serving Bukidnon" is reassurance about coverage that matters once you have
  // picked something. The hero used to sit above the services, so the first
  // thing under the search bar was a pitch rather than the three ways to book.
  const home = readFileSync("src/pages/Home.tsx", "utf8");

  test("the services come before the hero", () => {
    expect(home.indexOf("SERVICES.map")).toBeLessThan(
      home.indexOf("Serving {REGION.name}"),
    );
  });

  test("the hero still comes before the fare note", () => {
    // The fare explains a price the commuter has not asked for yet, so it
    // stays the last word on the block rather than leading.
    expect(home.indexOf("Serving {REGION.name}")).toBeLessThan(
      home.indexOf("liveTariff.minFare"),
    );
  });

  test("there is exactly one services block and one hero", () => {
    expect(home.split("SERVICES.map").length - 1).toBe(1);
    expect(home.split("Serving {REGION.name}").length - 1).toBe(1);
  });

  test("a live trip still takes the hero slot, whichever block that is", () => {
    // The swap moved the services above, not the conditional: somebody with a
    // trip in progress must still see it in the hero position rather than have
    // it pushed under the promo. The live branch comes first inside the ternary
    // and links to the trip, so the services above cannot have displaced it.
    expect(home).toContain("Trip in progress");
    const hero = home.slice(home.indexOf("{liveRide ? ("));
    expect(hero).toContain('to="/book"');
    expect(hero).toContain("STATUS_LABEL[liveRide.status]");
    // The promo is the fallback, and stays below the live-trip branch.
    expect(hero.indexOf('to="/book"')).toBeLessThan(
      hero.indexOf("Serving {REGION.name}"),
    );
    // And the services sit above the whole conditional, not inside it.
    expect(home.indexOf("SERVICES.map")).toBeLessThan(home.indexOf("{liveRide ? ("));
  });
});

describe("the rider's settings live on the profile, not floating over the map", () => {
  // The booking map carried a gear and a person icon in its bottom-right. Both
  // opened things the profile page already holds — Language & appearance, and
  // the profile itself — so they were a second, worse route to the same two
  // places, and they sat on top of the map's own zoom and recentre controls in
  // the corner a rider aims at while positioning themselves.
  const booking = readFileSync("src/pages/RiderDashboard.tsx", "utf8");
  // The profile surface: the page's chrome plus the view that carries the
// account, since the panel now renders the view in place.
const profile = [
  readFileSync("src/pages/Profile.tsx", "utf8"),
  readFileSync("src/components/profile/ProfileView.tsx", "utf8"),
].join("\n");

  test("neither control is drawn over the map any more", () => {
    expect(booking).not.toContain('aria-label="Quick settings"');
    expect(booking).not.toContain('aria-label="Profile"');
    // The sheet they opened is gone with them, rather than left mounted and
    // unreachable.
    expect(booking).not.toContain("SettingsSheet");
    expect(booking).not.toContain("settingsOpen");
  });

  test("the rider still has both places, and they are the profile page's", () => {
    // Removing the overlay is only fair if the destinations survive. The header
    // avatar opens the account menu, whose first row goes to the profile.
    const shell = readFileSync("src/components/AppShell.tsx", "utf8");
    const menu = readFileSync("src/components/AccountMenu.tsx", "utf8");
    expect(shell).toContain("<AccountMenu />");
    // The panel opens the profile itself rather than a list that leads to it,
    // so the destination is the account, not a route.
    expect(menu).toContain("<ProfileView");
    expect(menu).not.toContain("<SettingRow");
  });

  test("the profile page carries the settings row itself", () => {
    // Not a link out to somewhere else — the actual control, on the profile
    // surface the rider reaches. That surface is the view now; the page is the
    // chrome around it.
    expect(profile).toContain("<SettingsSheet");
    expect(profile).toContain("setSettingsOpen(true)");
    expect(profile).toContain('t("profile", "languageAppearance")');
  });

  test("the booking screen kept its own work controls", () => {
    // What must survive the removal: everything that belongs on a work surface.
    for (const marker of ["Nearby requests", "Go online", "Accepting rides"]) {
      expect(booking).toContain(marker);
    }
  });
});

describe("the rider's Dashboard is its own screen, not a section of booking", () => {
  // The split exists because the two answer different questions. Booking is
  // "am I visible and what is coming"; the Dashboard is "did today pay". They
  // shared a screen, which put the earnings panel directly under the fold on the
  // screen whose whole job is the next request.
  const overview = readFileSync("src/pages/RiderOverview.tsx", "utf8");
  const booking = readFileSync("src/pages/RiderDashboard.tsx", "utf8");
  const routes = readFileSync("src/main.tsx", "utf8");

  test("the tab points at a route that exists and is protected", () => {
    expect(roleTabs("rider").some((t) => t.to === "/rider/dashboard")).toBe(true);
    const at = routes.indexOf('path="/rider/dashboard"');
    expect(at).toBeGreaterThan(-1);
    // Riders only: it reads the rider row, and an admin or commuter has none.
    expect(routes.slice(at, at + 300)).toContain("RequireAuth");
    expect(routes.slice(at, at + 300)).toContain("RiderOverview");
  });

  test("it is lazy-loaded like every other screen", () => {
    expect(routes).toContain(
      'lazy(() => import("./pages/RiderOverview.tsx"))',
    );
  });

  test("the Dashboard shows the numbers, the booking screen does not", () => {
    for (const marker of [
      "Earnings today",
      'label="This week"',
      'label="Your rating"',
    ]) {
      expect(overview).toContain(marker);
      expect(booking).not.toContain(marker);
    }
  });

  test("the booking screen kept the work surface", () => {
    for (const marker of ["Nearby requests", "Go online", "Accepting rides"]) {
      expect(booking).toContain(marker);
    }
  });

  test("the vehicle form moved with it, and booking links to it", () => {
    // Going online is disabled without a vehicle, so the booking screen is
    // where somebody discovers that — it has to point at the fix rather than
    // carry a second copy of a long form.
    expect(overview).toContain("handleSaveVehicle");
    expect(overview).toContain("Save vehicle");
    expect(booking).not.toContain("handleSaveVehicle");
    expect(booking).toContain('to="/rider/dashboard"');
  });

  test("the Dashboard guards the same states the booking screen does", () => {
    // Otherwise a rider could reach a page that dereferences a rider row they
    // do not have.
    expect(overview).toContain('to="/onboarding"');
    expect(overview).toContain('to="/admin"');
    expect(overview).toContain('to="/app"');
    expect(overview).toContain("if (!rider)");
  });

  test("the Dashboard marks itself active, so the tab highlights", () => {
    // AppShell takes bottomActiveKey rather than inferring it; without it the
    // Dashboard tab would never light up while you are on the Dashboard.
    expect(overview).toContain('bottomActiveKey="dashboard"');
  });
});

describe("trips live in one place, and that place is the tab", () => {
  // The header used to carry a "Your trips" button that opened a drawer of the
  // same trips the Activity tab lists — two controls for one screen, in a
  // header already carrying brand, bell and account. The drawer went; the trips
  // did not, so these pin both halves: no second door, and the tab still leads
  // to the real list.
  const shell = readFileSync("src/components/AppShell.tsx", "utf8");
  const home = readFileSync("src/pages/Home.tsx", "utf8");
  const commuterHome = readFileSync("src/pages/CommuterHome.tsx", "utf8");

  test("the drawer is gone", () => {
    expect(existsSync("src/components/HistoryDrawer.tsx")).toBe(false);
  });

  test("no screen puts a trips control in the header any more", () => {
    // The escape hatch existed only for this drawer, so it goes with it.
    expect(shell).not.toContain("headerAction");
    expect(home).not.toContain("HistoryDrawer");
    expect(commuterHome).not.toContain("HistoryDrawer");
  });

  test("the header itself never said 'Your trips'", () => {
    expect(shell).not.toContain("Your trips");
    expect(home).not.toContain("Your trips");
    expect(commuterHome).not.toContain("Your trips");
  });

  test("the Activity tab is still how you reach your trips", () => {
    // Removing the drawer must not remove the trips: the list component is
    // still rendered by /activity, which is what the tab points at.
    const activity = COMMUTER_TABS.find((tab) => tab.key === "activity");
    expect(activity?.to).toBe("/activity");
    expect(roleTabs("rider").some((tab) => tab.to === "/activity")).toBe(true);
    const historyPage = readFileSync("src/pages/RideHistory.tsx", "utf8");
    expect(historyPage).toContain("RideHistoryList");
  });
});

test("a rider keeps booking, Dashboard, and the shared Activity and Chats", () => {
  expect(roleTabs("rider").map((tab) => tab.key)).toEqual([
    "rider",
    "dashboard",
    "activity",
    "chats",
  ]);
});

test("the rider's first tab says what a rider is there to do", () => {
  // "Dashboard" named the screen type, which told a rider nothing they did not
  // already get from the icon. It now names the job: see what is available and
  // take it.
  const [first] = roleTabs("rider");
  expect(first.key).toBe("rider");
  expect(first.label).toBe("Available booking");
});

test("the rider's tab resolves through the dictionary", () => {
  // The bar renders `t("nav", labelKey)`, so a labelKey that is not in the
  // dictionary would render the raw key instead of a word.
  const [first] = roleTabs("rider");
  expect(nav[first.labelKey]).toBe("Available booking");
  expect(ceb.nav[first.labelKey]).toBe("Available nga booking");
});

test("the Current ride tab only appears while a ride is in progress", () => {
  // A tab that appears and vanishes with the state of the rider's work is
  // disorienting on a bar used one-handed while driving, so it is shown only
  // when it leads somewhere real.
  expect(roleTabs("rider", false).some((t) => t.to === "/rider/ride")).toBe(
    false,
  );
  expect(roleTabs("rider", true).some((t) => t.to === "/rider/ride")).toBe(
    true,
  );
});

test("the rider's tabs are ordered by category, not by accident", () => {
  // Booking and Current ride are the work; Dashboard is the shift report;
  // Trips and Chats are shared with the passenger side. The bar reads in that
  // order so the two things a rider does while driving are leftmost and
  // reachable with the same thumb.
  expect(roleTabs("rider", true).map((t) => t.key)).toEqual([
    "rider",
    "ride",
    "dashboard",
    "activity",
    "chats",
  ]);
});

test("the Current ride tab is never offered to a commuter or the admin", () => {
  // The ride screen is rider-only; a commuter has no route to show.
  expect(COMMUTER_TABS.some((t) => t.to === "/rider/ride")).toBe(false);
  expect(roleTabs("admin", true).some((t) => t.to === "/rider/ride")).toBe(
    false,
  );
});

test("hasActiveRide defaults to off, so the bar is unchanged without it", () => {
  // AppShell renders before the rider query resolves; a bar that grew a tab
  // on the first frame and shrank a moment later would jump under the thumb.
  expect(roleTabs("rider").map((t) => t.key)).toEqual(
    roleTabs("rider", false).map((t) => t.key),
  );
});

test("every tab's labelKey exists in every dictionary", () => {
  // The tab bar falls back to printing the key itself when a labelKey is
  // missing, which is a visible bug rather than an exception — so it needs a
  // test rather than relying on the fallback.
  const all = [
    ...COMMUTER_TABS,
    ...roleTabs("rider", true),
    ...roleTabs("admin"),
  ];
  for (const tab of all) {
    expect(typeof en.nav[tab.labelKey]).toBe("string");
    expect(typeof ceb.nav[tab.labelKey]).toBe("string");
  }
});

test("rider and commuter still share the Trips and Chats tabs", () => {
  // The bars now differ in the middle as well as the first tab — the rider has
  // a Dashboard and a possible Current ride that the passenger has no use for.
  // What must NOT drift apart is the shared tail: Trips and Chats are the same
  // two places on both sides, and splitting them would be gratuitous.
  const commuter = COMMUTER_TABS.map((tab) => tab.key);
  const rider = roleTabs("rider").map((tab) => tab.key);
  for (const shared of ["activity", "chats"]) {
    expect(commuter).toContain(shared);
    expect(rider).toContain(shared);
  }
  // And the rider-only tabs are genuinely rider-only.
  expect(commuter).not.toContain("dashboard");
  expect(commuter).not.toContain("ride");
});

test("the admin console is a single tab", () => {
  expect(roleTabs("admin").map((tab) => tab.to)).toEqual(["/admin"]);
});

test("a commuter with no profile yet still gets the three tabs", () => {
  // roleTabs is the fallback AppShell uses; it must not regress to an older,
  // shorter set if the override is ever missing.
  expect(roleTabs("commuter").map((tab) => tab.key)).toEqual(
    COMMUTER_TABS.map((tab) => tab.key),
  );
});
