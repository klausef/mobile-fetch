/**
 * The two surfaces added to the live and finished ride screens.
 *
 * Both exist because something was reachable but not *there*. The safety
 * answers — tell somebody where you are, call the rider — were scattered across
 * a share helper, a `tel:` link and a cancel button, none of them on the screen
 * that is open when a ride starts to feel wrong. The stars were only in History,
 * so rating meant opening a list of past trips to find the right one.
 *
 * The rules here are about *placement* and about not quietly dropping a feature
 * that already existed: this file must not become the place where a rewrite
 * removes working code.
 *
 * Run: bun test
 */
import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const safety = readFileSync("src/components/ride/RideSafetyActions.tsx", "utf8");
const home = readFileSync("src/pages/CommuterHome.tsx", "utf8");
const share = readFileSync("src/lib/share.ts", "utf8");

describe("the safety answers sit where they are needed", () => {
  test("the panel exists and is mounted on the ride screen", () => {
    expect(existsSync("src/components/ride/RideSafetyActions.tsx")).toBe(true);
    expect(home).toContain('import { RideSafetyActions }');
    expect(home).toContain("<RideSafetyActions");
  });

  test("it is directly under the rider card, not below the fare list", () => {
    // The whole point of the component. Somebody whose ride feels wrong is not
    // scrolling a fare breakdown to find the button that helps.
    const riderCard = home.indexOf("<RideChat");
    const safetyAt = home.indexOf("<RideSafetyActions");
    const timeline = home.indexOf("<RideTimeline status={liveRide.status}");
    expect(riderCard).toBeGreaterThan(-1);
    expect(safetyAt).toBeGreaterThan(riderCard);
    expect(timeline).toBeGreaterThan(safetyAt);
  });

  test("it reuses the shared trip text rather than writing its own", () => {
    // `lib/share.ts` already encodes what a Bukidnon family member needs to
    // read at a gate. A second formatter would drift from it immediately.
    expect(safety).toContain('from "@/lib/share"');
    expect(safety).toContain("shareText(");
    expect(safety).toContain("type ShareableTrip");
    // And it must not hand-roll navigator.share, which is what shareText is for.
    expect(safety).not.toContain("navigator.share");
    expect(safety).not.toContain("navigator.clipboard");
  });

  test("the share toast tells the truth about what the phone managed", () => {
    // A "shared!" confirmation on a phone that only copied to the clipboard is
    // a lie the commuter finds out about at the gate.
    expect(safety).toContain('result === "shared"');
    expect(safety).toContain('result === "copied"');
    expect(safety).toContain("else");
  });
});

describe("the emergency contact is offered, and its absence is honest", () => {
  test("it texts the contact a trip that is already written", () => {
    // Dialing alone puts the whole burden on somebody who is not in the app.
    expect(safety).toContain("sms:");
    expect(safety).toContain("encodeURIComponent");
    expect(safety).toContain("emergencyPhone");
  });

  test("no contact is an invitation to add one, not a dead button", () => {
    expect(safety).toContain("No emergency contact yet");
    expect(safety).toContain('href="/profile"');
  });

  test("it reads the contact off the profile the page already has", () => {
    // `getMyProfile` already carries both fields; a second subscription for
    // them would be a second request on the screen where latency is felt most.
    expect(home).toContain("profile?.emergencyName");
    expect(home).toContain("profile?.emergencyPhone");
    expect(safety).toContain("emergencyName?: string | null");
  });

  test("the call button only appears once there is a rider to call", () => {
    // Hidden rather than disabled: before a rider is assigned there is nothing
    // to call, and a greyed-out phone reads as a broken app.
    expect(safety).toContain("{riderPhone ? (");
  });
});

describe("a finished ride asks for its rating on the spot", () => {
  test("the stars appear on the receipt, not only in History", () => {
    expect(home).toContain('import { RideRating }');
    expect(home).toContain("<RideRating rideId={receipt.ride._id}");
    // History still has them; this is an addition, not a move.
    expect(readFileSync("src/pages/RideHistory.tsx", "utf8")).toContain(
      "<RideRating",
    );
  });

  test("only a completed trip with a rider is rated", () => {
    // `ratings.rate` throws for a cancelled trip or a ride with nobody
    // assigned, so offering the stars there would be an error on tap.
    const at = home.indexOf("<RideRating rideId={receipt.ride._id}");
    const before = home.slice(Math.max(0, at - 400), at);
    expect(before).toContain('receipt.ride.status === "COMPLETED"');
    expect(before).toContain("receipt.ride.riderId");
  });

  test("it asks a question, because five unexplained stars are not a request", () => {
    expect(home).toContain("How was your ride?");
  });
});

describe("the existing flow was extended, not replaced", () => {
  test("the share helper it builds on is untouched", () => {
    // The safety panel is a consumer of this. If its shape changes, both the
    // panel and the existing share button have to move together.
    expect(share).toContain("export function tripSummary");
    expect(share).toContain("export async function shareText");
    expect(share).toContain("export type ShareableTrip");
  });

  test("the cancel ride button and the live-ride statuses are still there", () => {
    expect(home).toContain("Cancel ride");
    expect(home).toContain('liveRide.status === "SEARCHING"');
    expect(home).toContain("Book another ride");
  });

  test("cash is still the payment story — no wallet was introduced", () => {
    // The panel must not smuggle in a payment rail the rest of the app does
    // not have.
    expect(home).not.toContain("wallet");
  });
});
