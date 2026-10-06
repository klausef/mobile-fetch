import { AppShell } from "@/components/AppShell";
import { MapView, type MapMarker } from "@/components/map/MapView";
import {
  ApprovalGate,
  canShowRiderSurfaces,
} from "@/components/ride/ApprovalGate";
import {
  PassengerAvatar,
  RideRequestModal,
  type RideRequest,
} from "@/components/ride/RideRequestModal";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { demandCells, demandHeadline } from "@/lib/driver";
import { errorMessage } from "@/lib/errors";
import { formatDistance, formatPeso, shortAddress } from "@/lib/geo";
import type { LatLng } from "@/lib/geo";
import { REGION } from "@/lib/region";
import { playRequestChime } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowRight,
  Bike,
  Car,
  Loader2,
  Power,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { toast } from "sonner";

/** Before a GPS fix, the dashboard opens on the province it serves. */
const FALLBACK_CENTER: LatLng = REGION.center;

const RIDE_TYPE_ICON: Record<string, typeof Car> = {
  motorcycle: Bike,
  tricycle: Bike,
  car: Car,
  van: Users,
};

/**
 * A rider's home screen.
 *
 * Laid out the way a driver actually holds the phone: the map is the top half
 * and is never something you scroll past, the switch that decides whether you
 * earn is a thumb-sized target within reach, and everything else — profile,
 * vehicle, today's numbers — is a card beneath it.
 *
 * The incoming-request card is a modal rather than a list row, because a
 * request has a deadline. A row you can scroll away from is a request you have
 * silently refused, and the passenger is left watching a pin that will not move.
 */
export default function RiderDashboard() {
  const profile = useQuery(api.profiles.getMyProfile);
  const { isAdmin: isOwnerAdmin } = useOwnerAdmin();
  const isGuest = useQuery(api.profiles.isGuest);
  const rider = useQuery(api.riders.getMyRider);
  const requests = useQuery(api.riders.nearbyRequests);
  const policy = useQuery(api.riders.getBookingPolicy);
  const demand = useQuery(api.riders.demandHeatmap);
  const activeRides = useQuery(api.rides.listActiveRides);

  const setOnline = useMutation(api.riders.setOnline);
  const updateLocation = useMutation(api.riders.updateLocation);
  const acceptRide = useMutation(api.rides.acceptRide);
  const rejectRide = useMutation(api.rides.rejectRide);
  const passRide = useMutation(api.rides.passRide);

  // The app shell already streams this rider's GPS; asking the browser here as
  // well is only to know where to put this screen's map, and it is the same
  // permission already granted.
  const geo = useGeolocation({ watch: true });
  const navigate = useNavigate();

  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  // Requests answered on this device since the screen opened. The server
  // already hides them (see `rejectRide`), but a local set means the card
  // disappears the instant it is answered rather than one round trip later.
  const [handled, setHandled] = useState<string[]>([]);

  // The id of the next request that would be offered, computed before the
  // early returns so the chime effect below can be an unconditional hook.
  //
  // `expiredForYou` is part of this filter, not just of the pop-up's: a request
  // whose window already closed stays in `requests` (that is the point — it is
  // still theirs to take from the list), so filtering on `handled` alone leaves
  // this pinned to the lapsed request and the chime never fires again for the
  // offer behind it. Silence on the next real request is the exact opposite of
  // what this effect is for.
  const firstOpenId =
    rider && requests
      ? (requests.filter(
          (request) =>
            !handled.includes(request._id) && !request.expiredForYou,
        )[0]?._id ?? null)
      : null;
  const chimedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!firstOpenId) {
      chimedRef.current = null;
      return;
    }
    // One chime per request, not one per re-render: the query re-delivers the
    // same row whenever anything about it changes.
    if (chimedRef.current === firstOpenId) return;
    chimedRef.current = firstOpenId;
    playRequestChime();
  }, [firstOpenId]);

  // `isGuest` joins the wait on purpose. The gate below cannot tell a guest
  // rider from a pending real one while this query is still in flight —
  // `undefined` reads as "not a guest", so a demo account would flash
  // "Waiting for approval" and then swap to the dashboard underneath it.
  if (
    profile === undefined ||
    rider === undefined ||
    isGuest === undefined
  ) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (profile === null) return <Navigate to="/onboarding" replace />;
  if (isOwnerAdmin || profile.role !== "rider") {
    return (
      <Navigate
        to={isOwnerAdmin || profile.role === "admin" ? "/admin" : "/app"}
        replace
      />
    );
  }
  if (!rider) {
    return (
      <AppShell>
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <p className="text-sm font-medium tracking-tight">
            Rider profile unavailable
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Your rider record could not be found. Try signing out and creating
            your profile again.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/rider/register">Set up driving again</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  // A rider only reaches the dashboard once the Super Admin has verified them.
  if (!canShowRiderSurfaces(rider.approval, isGuest)) {
    return <ApprovalGate approval={rider.approval} />;
  }

  const hasVehicle = rider.vehicle.make !== "—";
  const liveRides = activeRides ?? [];
  const hasRide = liveRides.length > 0;
  const maxConcurrent = policy?.maxConcurrentRides ?? 1;

  const toggleOnline = async (next: boolean) => {
    try {
      await setOnline({ isOnline: next });
      if (next) {
        const coords = geo.coords;
        if (coords) await updateLocation({ lat: coords.lat, lng: coords.lng });
        toast.success("You're online", {
          description: "Nearby request will appear here.",
        });
      } else {
        toast("You're offline", { description: "You won't receive new requests." });
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const openRequests = (requests ?? []).filter(
    (request) => !handled.includes(request._id),
  );
  // A request whose fifteen seconds already ran out stays out of the *pop-up*,
  // so somebody who was driving is not interrupted by the same one again. It
  // stays in `openRequests`, which is what puts it back in the list below —
  // missed it while it was busy, still theirs to take when it is not.
  const unoffered = openRequests.filter((request) => !request.expiredForYou);
  // The card is only offered when it can actually be taken: online, not
  // already carrying the maximum, and not sitting on a request already
  // answered on this device.
  const offered =
    rider.isOnline && liveRides.length < maxConcurrent
      ? (unoffered[0] ?? null)
      : null;

  const markHandled = (id: string) =>
    setHandled((prev) => (prev.includes(id) ? prev : [...prev, id]));

  const handleAccept = async (request: RideRequest) => {
    setBusy("accept");
    markHandled(request._id);
    try {
      await acceptRide({ rideId: request._id as Id<"rides"> });
      toast.success("Ride accepted", { description: "Head to the pickup point." });
      navigate("/rider/ride");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  // A deliberate "no". Unlike an expiry this one sticks: the request is not
  // offered to this rider again, so the flag it sets is permanent.
  const handleReject = async (request: RideRequest) => {
    setBusy("reject");
    markHandled(request._id);
    try {
      await rejectRide({ rideId: request._id as Id<"rides"> });
      toast("Request declined", { description: "It's no longer offered to you." });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  // The window closed without an answer. Deliberately NOT `handleReject`: a
  // missed tap is an absence, not a refusal, and refusing would hide this
  // booking from the rider for the rest of the day — which is the complaint
  // this whole path exists to answer.
  const handleExpire = async (request: RideRequest) => {
    try {
      await passRide({ rideId: request._id as Id<"rides"> });
    } catch {
      // Nothing worth interrupting the rider for: the request stays exactly
      // where it was, which is the same place the list would have shown it.
    }
  };

  // Heatmap cells: the grid resolution is a rendering decision, so it is
  // applied here rather than server-side.
  const cells = demandCells(demand ?? [], 0.012);
  const headline = demandHeadline(cells);

  const selfLocation = geo.coords;
  const center: LatLng = selfLocation
    ? { lat: selfLocation.lat, lng: selfLocation.lng }
    : rider.lat != null && rider.lng != null
      ? { lat: rider.lat, lng: rider.lng }
      : FALLBACK_CENTER;

  const markers: MapMarker[] = [];
  if (selfLocation) {
    markers.push({
      id: "self",
      lat: selfLocation.lat,
      lng: selfLocation.lng,
      kind: "rider",
      heading: selfLocation.heading ?? null,
      label: "You",
    });
  } else if (rider.lat != null && rider.lng != null) {
    markers.push({
      id: "self",
      lat: rider.lat,
      lng: rider.lng,
      kind: "rider",
      heading: rider.heading ?? null,
      label: "You",
    });
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-5 sm:pt-5">
        {/* ── Map hero ─────────────────────────────────────────────────── */}
        <div className="relative -mx-4 sm:mx-0">
          <div className="overflow-hidden border-b border-border sm:rounded-3xl sm:border">
            <MapView
              center={center}
              zoom={14}
              markers={markers}
              heatmap={cells}
              followTarget={selfLocation}
              recenterTarget={selfLocation}
              className="h-[40dvh] min-h-[280px] w-full lg:h-[46vh]"
            />
          </div>

          {/* Status pill, over the map. */}
          <div className="pointer-events-none absolute left-3 top-3 z-10">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium tracking-tight shadow-sm backdrop-blur",
                rider.isOnline
                  ? "bg-emerald-600/95 text-white"
                  : "bg-background/90 text-muted-foreground",
              )}
            >
              {rider.isOnline ? (
                <>
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-2 animate-ping rounded-full bg-white/70" />
                    <span className="relative inline-flex size-2 rounded-full bg-white" />
                  </span>
                  Accepting rides
                </>
              ) : (
                <>
                  <span className="size-2 rounded-full bg-muted-foreground" />
                  Offline
                </>
              )}
            </span>
          </div>

          {/* The gear and the person icon that used to float over the map here
              are gone. Both opened things the profile page already holds —
              Language & appearance, and the profile itself — so they were a
              second, worse route to the same two places, sitting on top of the
              map's own zoom and recentre controls in the corner a rider aims at
              while positioning themselves. The map is now the map. */}

          {headline ? (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-[11px] font-medium tracking-tight text-muted-foreground shadow-sm backdrop-blur">
                <Zap className="size-3 text-fetch-red" />
                {headline}
              </span>
            </div>
          ) : null}
        </div>

        {/* ── Panels ───────────────────────────────────────────────────── */}
        <div className="mt-4 space-y-4 pb-4">
          {/* Ride in progress. */}
          {hasRide ? (
            <section className="rounded-2xl border border-fetch-red/30 bg-fetch-red/5 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium tracking-tight">
                    {liveRides.length === 1
                      ? "Trip in progress"
                      : `${liveRides.length} trips in progress`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {liveRides.map((entry) => entry.ride.code).join(" · ")}
                  </p>
                </div>
                <Button asChild>
                  <Link to="/rider/ride">
                    Open trip
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </section>
          ) : null}

          {/* The profile, rating and vehicle card moved to the Dashboard
              tab. A rider who opens this screen is checking whether they
              are visible and taking the next job; who they are and what
              they drive is setup, and setup lives where it is edited. The
              vehicle form especially: it is long, and it is only reachable
              when a rider has no vehicle yet. */}

          {/* The earnings panel and the profile/vehicle card moved to the
              Dashboard tab (`/rider/dashboard`). This screen is a work surface:
              a map, whether you are visible, and the offers arriving. The
              numbers answer a different question, and they were the first thing
              below the fold on the screen whose whole job is the next request. */}

          {/* Availability switch. */}
          <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <button
              type="button"
              disabled={!hasVehicle || hasRide}
              onClick={() => void toggleOnline(!rider.isOnline)}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-4 text-left transition",
                rider.isOnline
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-muted text-foreground",
                (!hasVehicle || hasRide) && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full",
                    rider.isOnline ? "bg-white/20" : "bg-background",
                  )}
                >
                  <Power className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold tracking-tight">
                    {rider.isOnline ? "You're online" : "Go online"}
                  </span>
                  <span
                    className={cn(
                      "block text-xs",
                      rider.isOnline ? "text-white/80" : "text-muted-foreground",
                    )}
                  >
                    {rider.isOnline
                      ? "Tap to stop receiving requests"
                      : "Tap to start accepting rides"}
                  </span>
                </span>
              </span>
              <span
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                  rider.isOnline ? "bg-white/30" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1 size-5 rounded-full bg-white shadow transition-all",
                    rider.isOnline ? "left-6" : "left-1",
                  )}
                />
              </span>
            </button>

            {!hasVehicle ? (
              <p className="mt-3 flex gap-2 text-xs leading-5 text-muted-foreground">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                Add your vehicle details on the{" "}
                <Link
                  to="/rider/dashboard"
                  className="font-medium text-foreground underline underline-offset-2"
                >
                  Dashboard
                </Link>{" "}
                before going online.
              </p>
            ) : null}
            {hasRide ? (
              <p className="mt-3 flex gap-2 text-xs leading-5 text-muted-foreground">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                You stay online until your{" "}
                {liveRides.length === 1 ? "trip is" : "trips are"} finished.
              </p>
            ) : null}
            {geo.status === "denied" ? (
              <p className="mt-3 flex gap-2 text-xs leading-5 text-muted-foreground">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                {geo.message}
              </p>
            ) : null}
          </section>

          {/* Requests list. The modal takes the nearest one; this is the rest,
              so a rider who declines can still see what else is around. */}
          <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium tracking-tight">
                {offered ? "Nearby requests" : "Available bookings"}
              </h2>
              <Zap className="size-4 text-muted-foreground" />
            </div>

            {!rider.isOnline ? (
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Go online to start receiving ride requests.
              </p>
            ) : liveRides.length >= maxConcurrent ? (
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                You're carrying {liveRides.length}{" "}
                {liveRides.length === 1 ? "trip" : "trips"} right now. Finish one
                to take another.
              </p>
            ) : openRequests.filter((r) => r._id !== offered?._id).length ===
              0 ? (
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                {unoffered.length > 0
                  ? "Nothing else nearby right now. The nearest one is on your screen."
                  : "No other requests nearby right now."}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-border/70">
                {openRequests
                  .filter((r) => r._id !== offered?._id)
                  .map((request) => {
                  const Icon = RIDE_TYPE_ICON[request.rideType] ?? Car;
                  return (
                    <li
                      key={request._id}
                      className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"
                    >
                      <PassengerAvatar
                        name={request.name}
                        photoUrl={request.photoUrl}
                        className="size-9"
                      />
                      <div className="min-w-0 flex-1">
                        {/* The passenger, not the booker — the same person the
                            request card shows, so accepting from this row and
                            accepting from the pop-up cannot disagree about who
                            is being collected. */}
                        <p className="truncate text-sm tracking-tight">
                          {request.name}
                        </p>
                        {request.bookedByName ? (
                          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            Booked by {request.bookedByName}
                          </p>
                        ) : null}
                        <p className="truncate text-xs text-muted-foreground">
                          {shortAddress(request.pickup.address)}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          → {shortAddress(request.destination.address)}
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          <Icon className="size-3" />
                          {formatDistance(request.distanceKm)}
                          {request.pickupDistanceKm != null
                            ? ` · ${formatDistance(request.pickupDistanceKm)} away`
                            : ""}
                        </p>
                        {request.expiredForYou ? (
                          // Honest about why it is here rather than popping up
                          // again: the window closed, the booking did not.
                          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-fetch-red/80">
                            Missed · still open
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold tracking-tight">
                          {formatPeso(request.fare)}
                        </p>
                        <Button
                          size="sm"
                          className="mt-1.5"
                          disabled={busy != null}
                          onClick={() =>
                            void handleAccept(request as RideRequest)
                          }
                        >
                          Accept
                        </Button>
                      </div>
                    </li>
                  );
                  })}
              </ul>
            )}
          </section>

          {/* The weekly trend line that used to sit here repeated the dark
              card's own "This week" stat and added a platform-fee sentence to
              the rider's home. Both are removed: the number the rider wants is
              already above, and the cut is stated plainly on the trip
              settlement at the end of a ride, where it actually costs them
              something and so is worth reading. */}
        </div>
      </div>

      {/* Keyed on the request, so each new offer gets a fresh 15-second clock. */}
      {offered ? (
        <RideRequestModal
          key={offered._id}
          request={offered as RideRequest}
          open
          busy={busy != null}
          onAccept={handleAccept}
          onReject={(request) => void handleReject(request)}
          onExpire={(request) => void handleExpire(request)}
        />
      ) : null}
    </AppShell>
  );
}
