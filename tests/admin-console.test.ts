/**
 * The admin console's contracts.
 *
 * This is the one part of the app where an admin can lock somebody out of their
 * own account, change what every commuter is charged, and tell a driver their
 * application was declined. None of that is visible in a screenshot, and none of
 * it was covered by the rest of the suite — so the rules that protect it are
 * asserted here rather than left to "the button is disabled":
 *
 *   • A rejection must carry a reason. Enforced on the server, because a rule
 *     that lives only in a disabled button is a rule a future screen can walk
 *     straight past — and because the applicant is told this sentence.
 *   • Every consequential action writes an audit row *from inside the mutation
 *     that does it*. A log written as a second step can be skipped by a failed
 *     request, and a log that can be skipped is not an audit trail.
 *   • The console has the sections it is supposed to have.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";

const admin = readFileSync("src/convex/admin.ts", "utf8");
const schema = readFileSync("src/convex/schema.ts", "utf8");
const sidebar = readFileSync("src/components/admin/AdminSidebar.tsx", "utf8");
const documents = readFileSync("src/components/admin/DocumentsTab.tsx", "utf8");
const users = readFileSync("src/components/admin/UsersTab.tsx", "utf8");
const shell = readFileSync("src/pages/AdminDashboard.tsx", "utf8");

const functionBody = (name: string): string => {
  const start = admin.indexOf(`export const ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = admin.indexOf("\nexport const ", start + 1);
  return admin.slice(start, next === -1 ? admin.length : next);
};

describe("a decline has to say why", () => {
  test("the server refuses a rejection with no reason", () => {
    // The button in DocumentsTab is disabled until a reason is typed, but that
    // is a hint, not the rule. The rule lives where the decision is written.
    const body = functionBody("setRiderApproval");
    expect(body).toContain('args.approval === "REJECTED" && !note');
    expect(body).toContain("Say why the application was declined.");
  });

  test("the reason is trimmed before it is stored or sent", () => {
    // A note of "   " is not a reason, and a note stored with its trailing
    // spaces renders as a ragged sentence in the rider's notification.
    const body = functionBody("setRiderApproval");
    expect(body).toContain("const note = args.note?.trim()");
    expect(body).toContain("note?.slice(0, 200)");
  });

  test("the screen asks for the reason before it lets you reject", () => {
    expect(documents).toContain("note.trim().length === 0");
    expect(documents).toContain("Write why");
  });

  test("suspending an account needs a reason too", () => {
    // A suspended person is told the reason and can act on it; "suspended, no
    // reason" is an outage with an admin's name on it.
    expect(users).toContain("reason.trim().length === 0");
    expect(users).toContain("Write why");
    expect(functionBody("setUserSuspended")).toContain(
      'args.suspended ? "No reason given"',
    );
  });
});

describe("the audit trail cannot be skipped", () => {
  test("each consequential mutation writes its own log entry", () => {
    // Called from inside the handler, not by the client afterwards: a log
    // written as a second step is skipped whenever the first one fails.
    for (const [name, action] of [
      ["setRiderApproval", "rider_"],
      ["setUserSuspended", "args.suspended ?"],
      ["replyToTicket", "resolve_ticket"],
      ["createTicket", "create_ticket"],
    ] as const) {
      const body = functionBody(name);
      expect(body).toContain("await logAction(ctx,");
      expect(body).toContain(action);
    }
  });

  test("the admin's own identity is recorded, not just their id", () => {
    // An id cannot answer "who was this" a year later; a name can.
    expect(admin).toContain("adminName: admin?.name ?? admin?.email");
  });

  test("the log keeps who was affected", () => {
    expect(admin).toContain("targetId: rider.userId");
    expect(admin).toContain("targetName: rider.name");
  });
});

describe("the console has the sections it is supposed to have", () => {
  test("every requested section is in the sidebar", () => {
    for (const key of [
      "overview",
      "users",
      "rides",
      "documents",
      "fares",
      "tickets",
      "analytics",
      "logs",
      "settings",
    ]) {
      expect(sidebar).toContain(`"${key}"`);
    }
  });

  test("a queue announces itself without being opened", () => {
    // An admin who has to open "Driver Documents" to discover there are three
    // waiting has already lost the thing the badge is for.
    expect(sidebar).toContain("c.pendingRiders");
    expect(sidebar).toContain("c.openTickets");
  });

  test("the shell refuses a non-admin rather than showing an empty console", () => {
    // An empty console reads as "no data yet", not as "not for you".
    expect(shell).toContain('profile?.role !== "admin"');
    expect(shell).toContain("<Navigate");
  });
});

describe("the data the console reads is bounded", () => {
  test("every scan has a cap", () => {
    // An admin query that collects the whole table stops the console the day
    // the table stops being small. Each of these caps is a real limit, not a
    // placeholder.
    for (const cap of [
      "LOG_LIMIT",
      "LIVE_RIDE_LIMIT",
      "TICKET_LIMIT",
      "ANALYTICS_LIMIT",
      "EXPORT_LIMIT",
    ]) {
      expect(admin).toContain(`const ${cap} =`);
    }
  });

  test("the analytics read states its window rather than promising a total", () => {
    expect(admin).toContain("totalRides: completed.length");
    expect(admin).toContain(`take(ANALYTICS_LIMIT)`);
  });
});

describe("the fare engine the console previews is the one the app charges", () => {
  test("the worked example calls the shared breakdown, not a local formula", () => {
    // A preview computed by a second formula is a preview that can disagree with
    // the charge, which is the one thing a fare preview must not do.
    const fares = readFileSync(
      "src/components/admin/OperationsTabs.tsx",
      "utf8",
    );
    expect(fares).toContain("from \"@/lib/fare-breakdown\"");
    expect(fares).toContain("fareBreakdown({");
  });
});

describe("registering to drive is its own flow", () => {
  const landing = readFileSync("src/pages/Landing.tsx", "utf8");
  const register = readFileSync("src/pages/RiderRegister.tsx", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  const onboarding = readFileSync("src/pages/Onboarding.tsx", "utf8");

  test("the landing link goes to the rider's own screen, not the passenger's", () => {
    // It used to be `/auth?returnTo=/onboarding?role=rider`, which walked a
    // driver through the passenger's sign-up and then a passenger form with a
    // pre-selected card.
    expect(landing).toContain('to="/rider/register"');
    expect(landing).not.toContain("role%3Drider");
  });

  test("the passenger form no longer reads a role from the URL", () => {
    // Nothing links it any more. Leaving the preselect in would keep a second,
    // invisible door into the rider path.
    expect(onboarding).not.toContain('searchParams.get("role")');
    expect(onboarding).not.toContain("useSearchParams");
  });

  test("the passenger form cannot create a rider at all", () => {
    // The role picker is gone entirely, not just unlinked. While it existed,
    // picking "I drive" here created a rider row whose vehicle was the
    // placeholder "—" — an unactionable queue entry, which is the whole reason
    // `/rider/register` asks for a vehicle before applying.
    expect(onboarding).toContain('role: "commuter"');
    expect(onboarding).not.toContain('role: "rider"');
    expect(onboarding).not.toContain('setRole("rider")');
    expect(onboarding).not.toContain("useState<\"commuter\" | \"rider\">");
    // And it always lands on the passenger app, never the rider dashboard.
    expect(onboarding).toContain('navigate("/app"');
    expect(onboarding).not.toContain('navigate(role ===');
  });

  test("the passenger form still points at the driver's own screen", () => {
    // Removing the role card must not remove the way to drive, or somebody who
    // arrived here meaning to drive would have no route at all.
    expect(onboarding).toContain('to="/rider/register"');
  });

  test("the driver's own screen asks for the account and the vehicle", () => {
    expect(register).toContain('flow: "signUp"');
    expect(register).toContain('role: "rider"');
    expect(register).toContain("saveVehicle(");
    // The vehicle is asked for *before* the application is sent: a rider row
    // with "—" as its plate puts an unactionable queue entry in front of an
    // admin.
    expect(register).toContain('name="plate"');
  });

  test("it is not behind the auth guard — step one creates the account", () => {
    // Sliced to the *end of this route*, not an arbitrary window: a fixed
    // character count spills into the next route and would report the guard
    // that route legitimately has.
    const start = main.indexOf('path="/rider/register"');
    expect(start).toBeGreaterThan(-1);
    const route = main.slice(start, main.indexOf("<Route", start + 10));
    expect(route).not.toContain("RequireAuth");
    expect(route.slice(0, 200)).not.toContain("RequireAuth");
  });
});

describe("the schema holds what the console writes", () => {
  test("a suspension is stored, not inferred", () => {
    expect(schema).toContain("suspendedAt: v.optional(v.number())");
    expect(schema).toContain("suspendedReason: v.optional(v.string())");
  });

  test("tickets carry their own lifecycle and thread", () => {
    expect(schema).toContain("tickets: defineTable({");
    expect(schema).toContain("ticketMessages: defineTable({");
    expect(schema).toContain('.index("by_status", ["status"])');
  });
});