import { AppShell } from "@/components/AppShell";
import { RideHistoryList } from "@/components/ride/RideHistoryList";
import { RideRating } from "@/components/ride/RideRating";
import { StatusChip, STATUS_LABEL } from "@/components/ride/RideStatus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { audienceForRole, isOngoingStatus, serviceLabel } from "@/lib/booking";
import { formatDistance, formatPeso, shortAddress } from "@/lib/geo";
import { scheduleLabel } from "@/lib/schedule";
import { shareText, tripSummary } from "@/lib/share";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { Loader2, Route, Share2 } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router";
import { toast } from "sonner";

export default function RideHistory() {
  const profile = useQuery(api.profiles.getMyProfile);
  // The same query the two list sections subscribe to. Counted here so that a
  // section with nothing in it is left out entirely, rather than showing a
  // heading over an empty box.
  const rides = useQuery(api.rides.listMyRides);
  const [selected, setSelected] = useState<Doc<"rides"> | null>(null);
  const [sharing, setSharing] = useState(false);
  // "Now", read once for the screen, so a "Today 5:30 PM" pickup time cannot
  // show a different day on a second render of the same dialog.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // A trip detail is passed on in a group chat, so sharing is a first-class
  // action on the receipt rather than something to copy out by hand.
  const shareTrip = async (ride: Doc<"rides">) => {
    if (sharing) return;
    setSharing(true);
    try {
      const result = await shareText(
        tripSummary(
          {
            code: ride.code,
            service: serviceLabel(ride.bookingType, audience) || "Ride",
            status: STATUS_LABEL[ride.status] ?? ride.status,
            pickupAddress: ride.pickup.address ?? "",
            destinationAddress: ride.destination.address ?? "",
            fare: ride.fare,
            scheduledFor: ride.scheduledFor,
          },
          now,
        ),
        `Fetch ${ride.code}`,
      );
      if (result === "copied") {
        toast.success("Copied — paste it to whoever is waiting.");
      } else if (result === "unavailable") {
        toast.error("This phone cannot share or copy. Write the code down instead.");
      }
    } finally {
      setSharing(false);
    }
  };

  if (profile === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (profile === null) return <Navigate to="/onboarding" replace />;

  // This page serves both roles, so the errand it names has to be named in the
  // reader's word: "Pasugo items" for the passenger, "Padala items" for the
  // rider. Same helper the list uses for its chip.
  const audience = audienceForRole(profile.role);
  const isRider = profile.role === "rider";
  const all = rides ?? [];
  const ongoingCount = all.filter((ride) => isOngoingStatus(ride.status)).length;
  const pastCount = all.length - ongoingCount;

  return (
    <AppShell bottomActiveKey="activity">
      <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col sm:min-h-[calc(100dvh-4rem)]">
        <div className="border-b border-border">
          <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
            <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-6">
          {rides === undefined ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : all.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center">
              <Route className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-4 text-sm font-medium tracking-tight">
                No rides yet
              </p>
              <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
                {isRider
                  ? "Trips you complete will appear here."
                  : "Book your first ride and it will show up here."}
              </p>
              <Button asChild className="mt-5" variant="outline">
                <Link to={isRider ? "/rider" : "/book?type=ride"}>
                  {isRider ? "Go to dashboard" : "Book a ride"}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              {ongoingCount > 0 ? (
                <section>
                  <h2 className="text-sm font-semibold tracking-tight">
                    Ongoing
                  </h2>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-border">
                    <RideHistoryList only="ongoing" onSelect={setSelected} />
                  </div>
                </section>
              ) : null}

              {pastCount > 0 ? (
                <section className={ongoingCount > 0 ? "mt-6" : undefined}>
                  <h2 className="text-sm font-semibold tracking-tight">Past</h2>
                  <div className="mt-3 overflow-hidden rounded-2xl border border-border">
                    <RideHistoryList only="past" onSelect={setSelected} />
                  </div>
                </section>
              ) : null}

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Every fare is locked to the tariff that was active when the ride
                was created.
              </p>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[10px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
                  Ride {selected.code}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Ride details
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-baseline justify-between">
                <span className="text-3xl font-semibold tracking-tight">
                  {selected.status === "COMPLETED"
                    ? formatPeso(selected.fare)
                    : "—"}
                </span>
                <StatusChip status={selected.status} />
              </div>

              <Separator />

              <dl className="space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Pickup</dt>
                  <dd className="max-w-[65%] text-right tracking-tight">
                    {shortAddress(selected.pickup.address)}
                  </dd>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-muted-foreground">Destination</dt>
                  <dd className="max-w-[65%] text-right tracking-tight">
                    {shortAddress(selected.destination.address)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Distance</dt>
                  <dd className="tracking-tight">
                    {formatDistance(selected.distanceKm)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Requested</dt>
                  <dd className="tracking-tight">
                    {format(selected.requestedAt, "d MMM yyyy · HH:mm")}
                  </dd>
                </div>
                {selected.scheduledFor ? (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Pickup time</dt>
                    <dd className="tracking-tight">
                      {scheduleLabel(selected.scheduledFor, now)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {(selected.items && selected.items.length > 0) || selected.notes ? (
                <>
                  <Separator />
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {selected.bookingType === "pabili"
                        ? "What to buy"
                        : `${serviceLabel(selected.bookingType, audience)} items`}
                    </p>
                    {selected.items && selected.items.length > 0 ? (
                      <ul className="mt-3 space-y-1.5 text-sm">
                        {selected.items.map((item, index) => (
                          <li
                            key={`${item.name}-${index}`}
                            className="flex items-start justify-between gap-3"
                          >
                            <span className="min-w-0 truncate">
                              <span className="text-muted-foreground">
                                {item.qty}×{" "}
                              </span>
                              {item.name}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {selected.notes ? (
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                        {selected.notes}
                      </p>
                    ) : null}
                    {selected.itemCostActual != null ? (
                      <div className="mt-3 flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Reimbursed to rider
                        </span>
                        <span className="tracking-tight">
                          {formatPeso(selected.itemCostActual)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              <Separator />

              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  Tariff applied
                </p>
                <dl className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <dt>Minimum fare</dt>
                    <dd>{formatPeso(selected.minFareSnapshot)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Included distance</dt>
                    <dd>{selected.includedDistanceSnapshot} km</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Additional rate</dt>
                    <dd>{formatPeso(selected.ratePerKmSnapshot)} / km</dd>
                  </div>
                  {selected.errandMinFareSnapshot != null ? (
                    <>
                      <div className="flex justify-between">
                        <dt>Errand minimum</dt>
                        <dd>{formatPeso(selected.errandMinFareSnapshot)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Store stop fee</dt>
                        <dd>{formatPeso(selected.stopFeeSnapshot ?? 0)}</dd>
                      </div>
                    </>
                  ) : null}
                </dl>
                {selected.quotedFare != null &&
                selected.quotedFare !== selected.fare ? (
                  <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                    You agreed to {formatPeso(selected.quotedFare)}. Your rider
                    corrected the store, so the service fee moved to{" "}
                    {formatPeso(selected.fare)} — within the capped band Fetch
                    allows for a store correction.
                  </p>
                ) : null}
                {selected.storePinConfirmed ? (
                  <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                    You confirmed that pin as sent, even though it sat very close
                    to the drop-off.
                  </p>
                ) : null}
              </div>

              {/* Share, and the stars. Both only make sense for a trip with
                  somebody on the other end of it. */}
              {selected.riderId ? (
                <>
                  <Separator />
                  <div className="flex flex-col gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={sharing}
                      onClick={() => void shareTrip(selected)}
                    >
                      <Share2 className="size-4" />
                      Share this trip
                    </Button>
                    {selected.status === "COMPLETED" && !isRider ? (
                      <RideRating rideId={selected._id} />
                    ) : null}
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
