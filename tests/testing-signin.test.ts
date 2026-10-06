/**
 * The testing-phase sign-in rules.
 *
 * Two things were slowing down working on the app with two accounts, and both
 * are invisible in a screenshot:
 *
 *   • The passenger side had no way to *create* an account with a password —
 *     only the driver form did — so a commuter either waited on an emailed code
 *     or could not get in at all.
 *   • A newly registered driver sat at "waiting for approval" until a Super
 *     Admin worked the queue, which meant the driver experience could not be
 *     tested from the second account at all.
 *
 * Both are now one step, and both are asserted here because each is a rule that
 * a future refactor could quietly undo.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const db = readFileSync("src/convex/lib/db.ts", "utf8");
const profiles = readFileSync("src/convex/profiles.ts", "utf8");
const admin = readFileSync("src/convex/admin.ts", "utf8");
const auth = readFileSync("src/pages/Auth.tsx", "utf8");
const settingsTab = readFileSync(
  "src/components/admin/OperationsTabs.tsx",
  "utf8",
);
const en = readFileSync("src/lib/i18n/en.ts", "utf8");
const ceb = readFileSync("src/lib/i18n/ceb.ts", "utf8");

const adminFunctionBody = (name: string): string => {
  const start = admin.indexOf(`export const ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = admin.indexOf("\nexport const ", start + 1);
  return admin.slice(start, next === -1 ? admin.length : next);
};

describe("a passenger can create an account with a password", () => {
  test("the password form actually creates the account", () => {
    // `signUp` creates the account *and* signs it in, in one call, so a new
    // passenger lands on onboarding authenticated rather than being sent back
    // to the same form.
    expect(auth).toContain("flow: pwFlow");
    expect(auth).toContain('useState<"signIn" | "signUp">("signIn")');
  });

  test("the same form serves both, and says which one it is doing", () => {
    expect(auth).toContain("setPwFlow");
    // A create form must not offer to autofill an existing password.
    expect(auth).toContain('pwFlow === "signUp" ? "new-password"');
    expect(auth).toContain('t("auth", "submitSignUp")');
    expect(auth).toContain('t("auth", "submitSignIn")');
  });

  test("the create form states the password rule it will be judged by", () => {
    // The server enforces >= 10 chars with a letter and a number; telling the
    // person beforehand is the difference between a form and a guessing game.
    const hint = en.slice(en.indexOf("createHint:"));
    expect(hint.slice(0, 200)).toContain("10 characters");
    expect(hint.slice(0, 200)).toContain("letter and a number");
    // The Bisaya dictionary is typed against English, so a missing translation
    // is already a compile error — this pins the copy as deliberate.
    expect(ceb).toContain("createHint:");
  });
});

describe("a new driver is not stuck behind an unworked queue", () => {
  test("the platform owns the decision, not a constant", () => {
    expect(db).toContain('AUTO_APPROVE_RIDERS_KEY = "autoApproveRiders"');
    expect(db).toContain("export async function autoApproveRiders");
  });

  test("it defaults to on, because the queue is not being worked yet", () => {
    // The opposite default from every other switch here, and deliberately so:
    // an unworked queue is indistinguishable from a broken app for the driver.
    const body = db.slice(db.indexOf("export async function autoApproveRiders"));
    expect(body.slice(0, 700)).toContain(": true;");
  });

  test("a new rider is approved through that switch", () => {
    expect(profiles).toContain("await autoApproveRiders(ctx)");
    expect(profiles).toContain('approved ? "APPROVED" : "PENDING"');
  });

  test("the Super Admin can turn it back on and off", () => {
    const body = adminFunctionBody("setAutoApproveRiders");
    expect(body).toContain("requireAdmin(ctx)");
    expect(body).toContain("AUTO_APPROVE_RIDERS_KEY");
    // Deciding whether an unvetted driver may carry passengers has to be
    // answerable after the fact, so this one is audited.
    expect(body).toContain("await logAction(ctx,");
    expect(body).toContain("set_auto_approve_riders");
  });

  test("the toggle is on the console's Settings tab", () => {
    expect(settingsTab).toContain("api.admin.setAutoApproveRiders");
    expect(settingsTab).toContain("Driver approval");
    expect(settingsTab).toContain("overview?.autoApproveRiders");
  });
});
