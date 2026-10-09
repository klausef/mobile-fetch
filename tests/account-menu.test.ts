/**
 * The account lives in the header, and it is a page.
 *
 * It was a card at the foot of whichever dashboard you happened to be on, so
 * "Sign out" was only reachable from some screens and only after scrolling
 * past the work — and the booking home carried two more copies of the same
 * account, a tappable greeting avatar and an "Account" tile. Three places,
 * none of them obviously the real one.
 *
 * The fix is an avatar in the header that drops down to a profile page. Two
 * things are easy to undo by accident and neither shows up in a rendering
 * test: somebody re-rendering a card on a screen, and somebody adding a
 * profile row that leads nowhere. So these assert the wiring — the route, the
 * menu target, the rows — and that every row opens something real.
 */
import { existsSync, readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const read = (path: string) => readFileSync(path, "utf8");

const appShell = read("src/components/AppShell.tsx");
const menu = read("src/components/AccountMenu.tsx");
const settings = read("src/components/SettingsSheet.tsx");
const profilePage = read("src/pages/Profile.tsx");
const profileView = read("src/components/profile/ProfileView.tsx");
/**
 * The profile *surface*, page chrome plus content.
 *
 * The account is a view now (`components/profile/ProfileView.tsx`), because the
 * header's panel renders it in place instead of navigating to a second copy of
 * it. `/profile` is only the chrome around it. Assertions about the account's
 * rows and forms therefore read both, so they keep testing the account rather
 * than whichever half of the split happens to hold a given line.
 */
const profile = `${profilePage}\n${profileView}`;
const main = read("src/main.tsx");
const convexProfiles = read("src/convex/profiles.ts");
const home = read("src/pages/Home.tsx");
const serviceArea = read("src/components/ServiceAreaSheet.tsx");

/** The JSX of one component, from its export to the end of the file. */
const jsxOf = (source: string, name: string) =>
  source.slice(source.indexOf(`export function ${name}`));

/**
 * The same source with its comments stripped.
 *
 * Several assertions here are negative — "this row does not navigate" — and the
 * comments beside the code routinely *name* the thing they explain. Prose saying
 * `navigate("/profile")` is exactly what an old comment left behind looks like,
 * so a negative assertion over commented source proves nothing.
 */
const code = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGES = [
  "src/pages/Home.tsx",
  "src/pages/CommuterHome.tsx",
  "src/pages/RiderDashboard.tsx",
  "src/pages/RideHistory.tsx",
  "src/pages/AdminDashboard.tsx",
];

/**
 * Every signed-in screen, either role's.
 *
 * The account lives in the shared header rather than in a role's own page, so
 * these are what have to keep rendering it — a commuter screen that skipped
 * `AppShell` would have no avatar to open the profile from.
 */
const ROLE_SCREENS = [
  ...PAGES,
  "src/pages/RiderOverview.tsx",
  "src/pages/RiderRide.tsx",
  "src/pages/Chats.tsx",
];

/** Every source file, for "this exists exactly once" assertions. */
const ALL_SOURCE = [
  ...globSync("src/**/*.tsx"),
  ...globSync("src/**/*.ts"),
].filter((f) => !f.includes("/_generated/"));

describe("the account is in the header", () => {
  test("the shell renders the account menu", () => {
    expect(appShell).toContain(
      'import { AccountMenu } from "@/components/AccountMenu"',
    );
    expect(appShell).toContain("<AccountMenu />");
  });

  test("the loose gear button is gone from the header", () => {
    // Settings is reached through the account menu now, so a second control
    // for it in the same bar is the crowding this replaced.
    expect(appShell).not.toContain("<SettingsSheet />");
  });

  test("the avatar opens the account itself, with no list in front of it", () => {
    // It used to open a panel listing four rows and then make you tap "Profile"
    // to get to your account. Every one of those four rows (language and
    // appearance, service area, help, sign out) was already inside the profile,
    // so the list was a duplicate the whole way round.
    const jsx = jsxOf(menu, "AccountMenu");
    expect(jsx).toContain("<ProfileView");
    expect(jsx).toMatch(/onClick=\{\(\) => setOpen\(true\)\}/);
    expect(jsx).not.toContain("<SettingGroup");
    expect(jsx).not.toContain("<SettingRow");
  });

  test("there is no second copy of the account in the header", () => {
    // The panel's own gold band stated name, role and email. With the profile
    // open above it that said all three twice, and it was a second thing to keep
    // in step with the profile's own identity card.
    const jsx = code(jsxOf(menu, "AccountMenu"));
    expect(jsx).not.toContain("bg-fetch-gold");
    expect(jsx).not.toContain("roleLabel");
    expect(jsx).not.toContain("isAdmin");
  });

  test("the panel has a name for screen readers", () => {
    // The sheet's own close control is a bare icon, so the panel needs a title
    // or a screen reader announces nothing when it opens.
    const jsx = jsxOf(menu, "AccountMenu");
    expect(jsx).toContain("<SheetTitle>");
    expect(jsx).toContain('t("profile", "title")');
  });

  test("it is a sliding panel, not a dropdown", () => {
    // A dropdown closes when the pointer moves two rows away, so it cannot
    // carry a service-area notice, a support address and a sign-out. The panel
    // is what makes the extra rows possible.
    const jsx = jsxOf(menu, "AccountMenu");
    expect(jsx).not.toContain("DropdownMenu");
    expect(jsx).toContain('side="right"');
  });

  test("signing out cannot fail silently", () => {
    // It is a server call. A rejected signOut used to close the panel and leave
    // the person still signed in, with no message at all.
    expect(profileView).toContain("signOutFailed");
    expect(profileView).toMatch(/await signOut\(\)[\s\S]{0,80}catch/);
    // One place, not two: a second copy in the header would be a second
    // sign-out path to keep guarded.
    expect(menu).not.toContain("signOut");
  });

  test("the panel closes before anything leaves it", () => {
    // The panel's open state lives in the app shell, which survives a route
    // change; a row that navigates without closing it leaves the panel hanging
    // over the screen the row just opened. The navigate path is now the `leaveTo`
    // function, which closes the panel before navigating — asserted as the presence
    // of that function's closed form (setOpen(false) precedes navigate(to)).
    const jsx = jsxOf(menu, "AccountMenu");
    expect(jsx).toMatch(
      /const leaveTo[\s\S]{0,80}setOpen\(false\)[\s\S]{0,30}navigate\(to\)/,
    );
    // Handed to the profile so its Trips and Chats rows go through it.
    expect(jsx).toContain("onNavigate={leaveTo}");
  });

  test("the panel has no second face to go back to", () => {
    // There was a "menu" pane and a "profile" pane, with a back arrow between
    // them. With the list gone there is nothing to go back to, and a pane flag
    // that can only ever be one value is a state machine with one state.
    const jsx = code(jsxOf(menu, "AccountMenu"));
    expect(jsx).not.toContain("setPane");
    expect(jsx).not.toContain('pane ===');
    expect(jsx).not.toContain("<ArrowLeft");
  });

  test("the profile renders in the panel, unconditionally", () => {
    // Inside the sheet, not gated — so tapping the avatar cannot land on
    // anything but the account.
    const jsx = code(jsxOf(menu, "AccountMenu"));
    expect(jsx).toMatch(/<ProfileView\s+onNavigate=/);
  });

  test("the panel's top padding clears the sheet's own close control", () => {
    // The close button is absolute at top-3 and 44px tall. Without the inset the
    // first card of the profile would sit underneath it and be untappable.
    const jsx = code(jsxOf(menu, "AccountMenu"));
    expect(jsx).toMatch(/className="[^"]*\bpt-16\b[^"]*"/);
  });

  test("the branding line at the foot is printed once", () => {
    // It belongs to the account, so the view owns it. Repeating it in the panel
    // — which is how "FETCH · Bukidnon" came to appear twice at the bottom of
    // the sheet — is the drift these tests exist to prevent.
    expect(profileView).toContain('t("profile", "footer")');
    expect(menu).not.toContain('t("profile", "footer")');
  });

  test("the profile page is now chrome around that same view", () => {
    // One account, two hosts. If the page ever grows its own rows again the two
    // surfaces drift, which is what the extraction was for.
    expect(profilePage).toContain("<ProfileView />");
    expect(profilePage).toContain("<ArrowLeft");
    expect(profilePage).toContain('if (profile === null) return <Navigate to="/onboarding" replace />');
    expect(existsSync("src/components/AccountCard.tsx")).toBe(false);
  });

  test("the settings sheet is a destination, not a button", () => {
    // It is opened by the menu, so it must not own a trigger of its own or
    // keep its own open state to disagree with. (The mounted flag below is
    // about reading the stored theme, not about whether the sheet is open.)
    expect(settings).not.toContain("SheetTrigger");
    expect(settings).not.toContain("setOpen");
    expect(settings).toContain("onOpenChange: (open: boolean) => void");
  });
});

describe("the profile is a real page", () => {
  test("it is routed and it is protected", () => {
    expect(main).toContain(
      'const Profile = lazy(() => import("./pages/Profile.tsx"))',
    );
    const route = main.slice(main.indexOf('path="/profile"'));
    expect(route.slice(0, 220)).toContain("RequireAuth");
  });

  test("the old card is gone rather than left orphaned", () => {
    expect(existsSync("src/components/AccountCard.tsx")).toBe(false);
  });

  test("it says who you are, and lets you change it", () => {
    // The photo is the one thing changed without a dialog; the pencil opens
    // the name and number form.
    expect(profile).toContain("<PhotoPicker");
    expect(profile).toContain("{displayName}");
    expect(profile).toContain("openEdit");
    expect(profile).toContain("api.profiles.updateMyProfile");
  });

  test("every row leads somewhere that exists", () => {
    const rows = profile.slice(profile.indexOf("<SettingGroup"));
    for (const target of ['to="/activity"', 'to="/chats"', "href={`mailto:"]) {
      expect(rows).toContain(target);
    }
    // And the two that open a dialog rather than a route.
    expect(rows).toContain("setPwOpen(true)");
    expect(rows).toContain("openEmergency");
    expect(rows).toContain("setSettingsOpen(true)");
    expect(rows).toContain("handleSignOut");
  });

  test("a signed-in account with no profile is sent to onboarding", () => {
    // Without this the page renders half-empty and every save is refused by
    // the server: a name-less card, a pencil that cannot work, and no way to
    // fix it from where you are standing.
    expect(profile).toContain('if (profile === null) return <Navigate to="/onboarding" replace />');
  });

  test("it states where Fetch runs, and what the law says", () => {
    expect(profile).toContain("<ServiceAreaSheet");
    expect(profile).toContain('setLegalOpen("terms")');
    expect(profile).toContain('setLegalOpen("privacy")');
  });

  test("it carries the forms the card used to hold", () => {
    // Moving the account to a page must not quietly drop the three things
    // that needed a form: password, emergency contact, and now name/number.
    expect(profile).toContain("setEmergencyContact");
    expect(profile).toContain('flow: "reset"');
    expect(profile).toContain('flow: "reset-verification"');
  });
});

describe("editing your number cannot leave a rider unreachable", () => {
  test("the rider row is written in the same mutation", () => {
    const mutation = convexProfiles.slice(
      convexProfiles.indexOf("export const updateMyProfile"),
    );
    expect(mutation.slice(0, 900)).toContain("getRider");
    expect(mutation.slice(0, 900)).toContain(
      "await ctx.db.patch(rider._id, { name, phone })",
    );
  });
});

describe("no screen carries a second copy of the account", () => {
  for (const path of PAGES) {
    test(`${path} does not render the account card`, () => {
      const page = read(path);
      expect(page).not.toContain("AccountCard");
      expect(page).not.toContain("setAccountOpen");
    });
  }

  test("the booking home has no Account tile either", () => {
    // It opened the same sheet the card lived in, which is now the page.
    expect(home).not.toContain('label="Account"');
  });

  test("the rider and the commuter get the same account", () => {
    // The account is not a rider's thing with a commuter copy: it lives in the
    // shared header, so whichever screen you are on, the avatar opens the same
    // profile. This is the contract that stops a role growing its own — a page
    // that skipped AppShell would have no avatar at all, and a second sheet
    // would be the drift this is guarding against.
    for (const path of ROLE_SCREENS) {
      expect(read(path)).toContain("<AppShell");
    }
    expect(appShell).toContain("<AccountMenu />");
    // One profile component in the whole app, and the header is its only host
    // outside the /profile route.
    const hosts = ALL_SOURCE.filter((f) =>
      f.endsWith(".tsx") && read(f).includes("<ProfileView"),
    );
    expect(hosts.sort()).toEqual([
      "src/components/AccountMenu.tsx",
      "src/pages/Profile.tsx",
    ]);
  });
});

describe("the panel is the account, not a menu in front of it", () => {
  // It was two labelled cards around four rows, then one unlabelled list around
  // the same four rows, then a second face you had to tap into. Every row on it
  // was already inside the profile, which is why it kept being redesigned and
  // kept ending up as a way of getting to the thing that was already there.
  test("the panel carries no rows of its own", () => {
    const jsx = jsxOf(menu, "AccountMenu");
    expect(jsx).not.toContain("<SettingGroup");
    expect(jsx).not.toContain("<SettingRow");
    // And nothing hanging off the panel's own sheets either — the view owns
    // them, so there is one settings dialog rather than two.
    expect(jsx).not.toContain("SettingsSheet");
    expect(jsx).not.toContain("ServiceAreaSheet");
  });

  test("every one of those four destinations is still reachable", () => {
    // Nothing was dropped to simplify it: they moved into the profile, which is
    // where the panel now opens.
    for (const row of [
      't("profile", "languageAppearance")',
      't("coverage", "menuLabel")',
      "href={`mailto:",
      "handleSignOut",
    ]) {
      expect(profileView).toContain(row);
    }
  });

  test("the icon chips are gone; the icons carry the rows", () => {
    const rows = read("src/components/SettingRows.tsx");
    expect(rows).not.toContain("rounded-full bg-secondary text-foreground");
    expect(rows).toContain("shrink-0 text-muted-foreground");
  });

  test("the profile page, which shares these rows, keeps its headings", () => {
    // The panel used to flatten its rows into one list. The profile genuinely
    // does group them (preferences, activity, others), so an untitled group
    // there would lose real structure.
    const rows = read("src/components/SettingRows.tsx");
    expect(rows).toContain("title?: string");
    expect(read("src/components/profile/ProfileView.tsx")).toContain(
      "<SettingGroup title=",
    );
  });
});

describe("the service area is stated once, in one place", () => {
  test("the sheet leads with the cities that have riders", () => {
    expect(serviceArea).toContain("LIVE_CITIES");
    expect(serviceArea).toContain("PLANNED_MUNICIPALITIES");
    // The live list first, and the rest explicitly labelled as not yet.
    expect(serviceArea.indexOf("LIVE_CITIES.map")).toBeLessThan(
      serviceArea.indexOf("PLANNED_MUNICIPALITIES.map"),
    );
  });

  test("the booking home uses that sheet rather than its own copy", () => {
    // It used to render its own list inline, which is how the two drifted into
    // saying different things about the same towns.
    expect(home).toContain("<ServiceAreaSheet");
    expect(home).not.toContain("COVERAGE");
  });

  test("the home page names the two cities instead of counting twenty-two", () => {
    expect(home).toContain("LIVE_CITY_NAMES.join");
    expect(home).not.toMatch(/across \{\w*\.length\} municipalities/);
  });

  test("the booking screen says so before a request goes out, not after", () => {
    // Checked in CommuterHome rather than the sheet, because that is the file
    // open when a commuter pins the pickup.
    const booking = read("src/pages/CommuterHome.tsx");
    expect(booking).toContain("!isInServiceArea(pickup)");
    // The cities are named in the notice itself, so the answer to "can I get a
    // ride here" is on the screen rather than one tap away.
    expect(booking).toContain("LIVE_CITY_NAMES.join");
    // A warning, not a wall: the request is still allowed to go out, because
    // refusing it would be worse than telling somebody the truth.
    expect(booking).not.toMatch(/if \(!isInServiceArea\(pickup\)\) return/);
  });
});
