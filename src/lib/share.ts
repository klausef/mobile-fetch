/**
 * Sending a trip to somebody who is not in it.
 *
 * In Bukidnon a trip detail is passed on in a group chat: "kuya is on the way,
 * this is the plate". So the shared text has to carry the things a family
 * member standing at a gate would need, and nothing else — no internal ids, no
 * fare nobody asked about, no coordinates.
 */

import { formatPeso, shortAddress } from "./geo";
import { scheduleLabel } from "./schedule";

export type ShareableTrip = {
  code: string;
  /** "Ride", "Pabili" or "Pasugo" — the word a passenger uses. */
  service: string;
  status: string;
  pickupAddress: string;
  destinationAddress: string;
  fare: number;
  scheduledFor?: number | null;
  /** The rider's plate, once there is a rider. */
  plate?: string | null;
  /** The rider's name, once there is a rider. */
  riderName?: string | null;
};

/**
 * The whole message, as plain text.
 *
 * Plain text rather than a link: the person receiving this is often the one
 * waiting at the pickup point with no app installed, and a link would be a dead
 * end for them. Six lines, and the last one is the code to quote on the phone.
 */
export function tripSummary(trip: ShareableTrip, now: number): string {
  const lines = [
    `Fetch ${trip.service === "Ride" ? "ride" : trip.service.toLowerCase()} ${trip.code} · ${trip.status}`,
    `Pick up: ${shortAddress(trip.pickupAddress) || "—"}`,
    `Going to: ${shortAddress(trip.destinationAddress) || "—"}`,
  ];
  if (trip.scheduledFor != null) {
    lines.push(`Pickup time: ${scheduleLabel(trip.scheduledFor, now)}`);
  }
  if (trip.plate) {
    lines.push(
      `Rider: ${trip.riderName || "Your rider"} · ${trip.plate}`,
    );
  }
  lines.push(`Fare: ${formatPeso(trip.fare)}`);
  return lines.join("\n");
}

/**
 * Hand the text to the phone.
 *
 * The share sheet when the phone has one, the clipboard when it does not, and
 * null when neither is there — an old browser should get the text back rather
 * than a silent no-op, because the caller needs to know it has to ask the
 * person to copy it by hand.
 */
export async function shareText(
  text: string,
  title = "Fetch trip",
): Promise<"shared" | "copied" | "unavailable"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text });
      return "shared";
    } catch {
      // A user dismissing the share sheet is not an error; fall through to the
      // clipboard so a second tap still gets the text somewhere.
    }
  }
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard?.writeText
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}
