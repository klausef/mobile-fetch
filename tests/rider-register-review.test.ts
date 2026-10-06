/**
 * The driver-registration screen's load-bearing rules.
 *
 * Every assertion here exists because breaking it is silent. The screen sits
 * deliberately outside `RequireAuth` — its first step *creates* the account —
 * so every question it asks has to be answerable by somebody with no session,
 * no profile, and no way to tell the difference yet. Each rule below was either
 * a live bug or an unguarded assumption:
 *
 *   • `getMyProfile` threw when signed out, and the route error boundary
 *     replaced the whole form with "This screen could not load".
 *   • `driverStep` keyed off `profile !== null`, which is true for `undefined`
 *     too, so every first-time driver was shown the *details* form.
 *   • A signed-in passenger fell into the same form and was refused by
 *     `saveVehicle` with no way out.
 *   • The password field accepted 8 characters; the server demands 10 plus a
 *     letter and a number.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const register = readFileSync("src/pages/RiderRegister.tsx", "utf8");
const profiles = readFileSync("src/convex/profiles.ts", "utf8");
const authLib = readFileSync("src/convex/lib/auth.ts", "utf8");
const password = readFileSync("src/convex/lib/password.ts", "utf8");
const routes = readFileSync("src/main.tsx", "utf8");

/** The body of the query, up to the next export. */
const getMyProfileBody = (): string => {
  const start = profiles.indexOf("export const getMyProfile");
  expect(start).toBeGreaterThan(-1);
  const next = profiles.indexOf("\nexport const ", start + 1);
  return profiles.slice(start, next === -1 ? profiles.length : next);
};

describe("the account step is reachable by somebody with no session", () => {
  test("reading your own profile does not throw when nobody is signed in", () => {
    // A thrown query reaches the client as an uncaught server error, and the
    // route error boundary renders that as a dead screen rather than a form.
    // Answering `null` is what keeps step one renderable.
    const body = getMyProfileBody();
    expect(body).not.toContain("requireUserId(ctx)");
    expect(body).toContain("getUserIdOrNull(ctx)");
    expect(body).toContain("if (userId === null) return null;");
  });

  test("the null-safe helper exists and does not throw", () => {
    expect(authLib).toContain("export async function getUserIdOrNull");
    const start = authLib.indexOf("export async function getUserIdOrNull");
    const body = authLib.slice(start, start + 400);
    expect(body).toContain("getAuthUserId(ctx)");
    expect(body).not.toContain("throw");
  });

  test("the screen stays outside RequireAuth, because step one creates the account", () => {
    // Scoped to the element itself. The comment above the route explains *why*
    // it is unprotected and necessarily names RequireAuth, so a wider window
    // matches the prose rather than any wrapper.
    const at = routes.indexOf('path="/rider/register"');
    expect(at).toBeGreaterThan(-1);
    const element = routes.slice(at, routes.indexOf("/>", at) + 2);
    expect(element).not.toContain("RequireAuth");
    expect(element).toContain("<RiderRegister />");
  });
});

describe("the two steps are mutually exclusive, and chosen only once settled", () => {
  test("the loading guard is settled before the step is decided", () => {
    // `profile` is `undefined` while the query is in flight. Deciding on it
    // then flashed the details form at somebody who had not chosen it yet, so
    // the guard has to come first — order is the whole fix here.
    const guard = register.indexOf("if (profile === undefined)");
    const decision = register.indexOf("const driverStep =");
    expect(guard).toBeGreaterThan(-1);
    expect(decision).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(decision);
  });

  test("an unresolved query renders a spinner, not a step", () => {
    const start = register.indexOf("if (profile === undefined)");
    expect(register.slice(start, start + 300)).toContain("Loader2");
  });

  test("the step is keyed off the session, never off 'profile is not null'", () => {
    // `undefined !== null` is true, so this treated every signed-out visitor
    // as though they had already finished step one.
    expect(register).toContain(
      "const driverStep = step === \"driver\" || accountDone || isAuthenticated;",
    );
    expect(register).not.toContain("accountDone || profile !== null");
  });

  test("exactly one of the two forms can render", () => {
    expect(register).toContain("{driverStep ? (");
    expect(register).toContain("<form onSubmit={handleDriver}");
    expect(register).toContain("<form onSubmit={handleAccount}");
    // One conditional opening, one closing — the two forms cannot both show.
    const open = register.split("{driverStep ? (").length - 1;
    expect(open).toBe(1);
  });
});

describe("a passenger is told why, instead of being left in a dead end", () => {
  test("an existing commuter profile is intercepted before the driver form", () => {
    // `createProfile` returns the existing profile untouched, so a commuter
    // kept their commuter role and was then refused by `saveVehicle`
    // ("Rider profile not found.") with nothing to click.
    const guard = register.indexOf('profile?.role === "commuter"');
    const decision = register.indexOf("const driverStep =");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(decision);
  });

  test("that dead end offers the sign-out that actually unblocks it", () => {
    const start = register.indexOf('profile?.role === "commuter"');
    const body = register.slice(start, register.indexOf("const driverStep ="));
    expect(body).toContain("signOut");
  });

  test("the rider and commuter branches are checked before the step decision", () => {
    const rider = register.indexOf('profile?.role === "rider"');
    const commuter = register.indexOf('profile?.role === "commuter"');
    const decision = register.indexOf("const driverStep =");
    expect(rider).toBeGreaterThan(-1);
    expect(rider).toBeLessThan(decision);
    expect(commuter).toBeLessThan(decision);
  });
});

describe("an address that already has an account can still finish registering", () => {
  test("a failed sign-up is retried as a sign-in", () => {
    // The password provider reports "this address is taken" as an
    // unserializable action error, which reached the screen as
    // `[CONVEX A(auth:signIn)]` — a dead end for a driver who made an account
    // earlier and came back to finish. The credentials are already in their
    // hands, so signing in is the answer that lets them reach step two.
    const body = register.slice(
      register.indexOf("const handleAccount"),
      register.indexOf("const handleDriver"),
    );
    expect(body).toContain('flow: "signUp"');
    expect(body).toContain('flow: "signIn"');
  });

  test("the retry does not claim success when both flows fail", () => {
    const body = register.slice(
      register.indexOf("const handleAccount"),
      register.indexOf("const handleDriver"),
    );
    const signup = body.indexOf('flow: "signUp"');
    const signin = body.indexOf('flow: "signIn"');
    expect(signin).toBeGreaterThan(signup);
    // Both failing still surfaces an error and stops; step two is never reached.
    expect(body.slice(signin)).toContain("setError(");
    expect(body).toContain("setBusy(false)");
  });
});

describe("the password field states the rule the server will judge it by", () => {
  test("the client minimum is not below the server minimum", () => {
    // The server is the authority; a form that understates the rule accepts
    // something and then rejects it after submit.
    const server = Number(
      password.slice(password.indexOf("MIN_PASSWORD_LENGTH")).match(/=\s*(\d+)/)![1],
    );
    const client = Number(
      register.slice(register.indexOf("const MIN_PASSWORD_LENGTH")).match(/=\s*(\d+)/)![1],
    );
    expect(server).toBe(10);
    expect(client).toBeGreaterThanOrEqual(server);
  });

  test("the input and the copy both say it", () => {
    expect(register).toContain("minLength={MIN_PASSWORD_LENGTH}");
    const hint = register.slice(register.indexOf("At least {MIN_PASSWORD_LENGTH}"));
    expect(hint.slice(0, 200)).toContain("letter and a");
  });

  test("the rule is restated, not imported out of a server module", () => {
    // Importing a value from a Convex module drags it into the client bundle.
    expect(register).not.toMatch(/from "@\/convex\/lib\/password"/);
    expect(register).toContain("const MIN_PASSWORD_LENGTH = 10;");
  });
});
