/**
 * What to do when a ride is going wrong.
 *
 * Three things a passenger reaches for in the fifteen seconds something feels
 * off: tell somebody where they are, get hold of the person driving, and get
 * out of the trip. All three were reachable somewhere in the app already — a
 * share helper in `lib/share.ts`, a `tel:` link on the rider card, a cancel
 * button further down — but not together, and not on the screen that is open at
 * the moment they are needed.
 *
 * That last point is the whole reason this is its own component. On a live ride
 * the rider card answers "where is my rider", and the safety answers are below
 * it, under a timeline and a fare list. Somebody whose ride feels wrong is not
 * scrolling a fare breakdown.
 *
 * So this sits directly under the rider card, above the timeline, and it is the
 * only part of the ride screen that is deliberately not cheerful.
 *
 * The emergency contact is read from the profile the caller already has rather
 * than fetched here: `getMyProfile` carries the emergency name and number, and
 * a second subscription for two fields would be a second request on the screen
 * where every millisecond of latency is felt.
 */

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { shareText, type ShareableTrip } from "@/lib/share";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { PhoneCall, ShieldAlert, Share2 } from "lucide-react";

export function RideSafetyActions({
  trip,
  riderPhone,
  emergencyName,
  emergencyPhone,
}: {
  /** The trip as `lib/share` wants it. */
  trip: ShareableTrip;
  /** Null before a rider is assigned — the call button is hidden, not disabled. */
  riderPhone?: string | null;
  emergencyName?: string | null;
  emergencyPhone?: string | null;
}) {
  const [open, setOpen] = useState(false);

  const share = async () => {
    // `shareText` answers what it managed to do, so the toast can say the
    // truth: a phone with no share sheet and no clipboard gets "copy this
    // yourself" rather than a confirmation for something that did not happen.
    const result = await shareText(
      `${tripSummaryText(trip)}\n\nIf anything goes wrong, call Fetch support and quote ${trip.code}.`,
      `Fetch ${trip.service} ${trip.code}`,
    );
    if (result === "shared") toast.success("Trip shared.");
    else if (result === "copied") toast.success("Copied — paste it anywhere.");
    else toast.error("Copy this by hand:", { description: tripSummaryText(trip) });
  };

  const alertContact = () => {
    // A `sms:` body rather than a bare number, so the person is already told
    // what is happening when the message opens. Dialing alone would put the
    // whole burden on somebody who is not in the app.
    const body = `I am on a Fetch ${trip.service.toLowerCase()} (${trip.code}). Picking up at ${trip.pickupAddress}, going to ${trip.destinationAddress}.`;
    window.location.href = `sms:${emergencyPhone}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void share()}
          className="min-h-11 flex-1 justify-center gap-2"
        >
          <Share2 className="size-4" aria-hidden />
          Share trip
        </Button>

        {riderPhone ? (
          <Button
            asChild
            variant="outline"
            className="min-h-11 flex-1 justify-center gap-2"
          >
            <a href={`tel:${riderPhone}`}>
              <PhoneCall className="size-4" aria-hidden />
              Call rider
            </a>
          </Button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium tracking-tight transition-colors",
          "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ShieldAlert className="size-4" aria-hidden />
        Safety
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Safety</SheetTitle>
            <SheetDescription>
              If something feels wrong, tell somebody where you are before you
              sort it out.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 pb-2">
            {emergencyName && emergencyPhone ? (
              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-medium tracking-tight">
                  Message {emergencyName}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Opens your messages with this trip already written, so they
                  know what is happening without you having to explain it.
                </p>
                <Button
                  type="button"
                  onClick={alertContact}
                  className="mt-3 min-h-11 w-full"
                >
                  <PhoneCall className="size-4" aria-hidden />
                  Text {emergencyName}
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4">
                <p className="text-sm font-medium tracking-tight">
                  No emergency contact yet
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  Add one on your profile and this button will text them your
                  trip details in one tap.
                </p>
                <Button asChild variant="outline" className="mt-3 min-h-11 w-full">
                  <a href="/profile">Add a contact</a>
                </Button>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() => void share()}
              className="min-h-11 w-full justify-center gap-2"
            >
              <Share2 className="size-4" aria-hidden />
              Share this trip
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Kept local so the sheet and the toast cannot drift from each other. */
function tripSummaryText(trip: ShareableTrip): string {
  const lines = [
    `Fetch ${trip.service} ${trip.code} · ${trip.status}`,
    `Pick up: ${trip.pickupAddress}`,
    `Going to: ${trip.destinationAddress}`,
  ];
  if (trip.riderName || trip.plate) {
    lines.push(`Rider: ${trip.riderName || "Your rider"}${trip.plate ? ` · ${trip.plate}` : ""}`);
  }
  return lines.join("\n");
}
