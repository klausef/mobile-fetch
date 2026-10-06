import { AppShell } from "@/components/AppShell";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { PlaceSearch } from "@/components/ride/PlaceSearch";
import { PassengerAvatar } from "@/components/ride/RideRequestModal";
import { RideRatingReadOnly } from "@/components/ride/RideRating";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useNow } from "@/hooks/use-now";
import {
  DRIVER_PLATFORM_RATE,
  driverStage,
  etaMinutesFrom,
  formatDuration,
  settleTrip,
  tripDurationMs,
  type DriverStage,
} from "@/lib/driver";
import { errorMessage } from "@/lib/errors";
import { formatDistance, formatPeso, haversineKm, shortAddress } from "@/lib/geo";
import type { LatLng } from "@/lib/geo";
import { REGION } from "@/lib/region";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Check,
  Flag,
  Loader2,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  ShoppingBasket,
  Star,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

/** Before a GPS fix, this page opens on the province it serves. */
const FALLBACK_CENTER: LatLng = REGION.center;

/**
 * The rider's next action, by stage.
 *
 * The label is what the rider does — "I've arrived", not "RIDER_ARRIVED" — and
 * the status is the single legal transition the server will accept. Kept here
 * rather than derived from a status table so a screen can never show a button
 * the mutation would reject.
 */
const NEXT_ACTION: Record<
  DriverStage,
  { label: string; status: "RIDER_ARRIVING" | "RIDER_ARRIVED" | "IN_PROGRESS" | "COMPLETED" } | null
> = {
  to_pickup: { label: "I'm on my way", status: "RIDER_ARRIVING" },
  // `RIDER_ARRIVING` is the same screen as `ACCEPTED`; once the rider is on
  // their way, the only thing left before the pickup is arriving.
  at_pickup: { label: "Start trip", status: "IN_PROGRESS" },
  in_trip: { label: "Complete trip", status: "COMPLETED" },
  done: null,
};

/**
 * The second action available while en route to the pickup.
 *
 * `ACCEPTED → RIDER_ARRIVING → RIDER_ARRIVED` are three server states but one
 * journey, so the "I'm on my way" tap is only offered once and the arriving tap
 * takes over from there.
 */
const ARRIVE_ACTION = { label: "I've arrived", status: "RIDER_ARRIVED" } as const;

/**
 * The trip the rider is running, on its own screen.
 *
 * One full-height map answers "where am I going", and one card underneath
 * answers "what do I do next" for exactly one stage of the job. Split out from
 * the dashboard because a rider mid-trip should never scroll past earnings to
 * find their pickup.
 */
export default function RiderRide() {
  const activeRides = useQuery(api.rides.listActiveRides);
  const earnings = useQuery(api.rides.riderEarnings);
  const [receiptId, setReceiptId] = useState<Id<"rides"> | null>(null);
  const receipt = useQuery(
    api.rides.getRide,
    receiptId ? { rideId: receiptId } : "skip",
  );

  const updateRideStatus = useMutation(api.rides.updateRideStatus);
  const reportItemCost = useMutation(api.rides.reportItemCost);
  const cancelRide = useMutation(api.rides.cancelRide);
  const confirmStore = useMutation(api.rides.confirmStore);
  const setOnline = useMutation(api.riders.setOnline);

  const geo = useGeolocation({ watch: true });
  const navigate = useNavigate();
  const now = useNow(1000);

  const [busy, setBusy] = useState(false);
  const [goingOffline, setGoingOffline] = useState(false);
  const [collected, setCollected] = useState(false);
  const [itemCosts, setItemCosts] = useState<Record<string, string>>({});
  const [savingCost, setSavingCost] = useState(false);
  const [storeEdit, setStoreEdit] = useState<{ rideId: Id<"rides"> } | null>(
    null,
  );
  const [storeDraft, setStoreDraft] = useState<{ lat: number; lng: number; label: string } | null>(
    null,
  );
  const [storeBusy, setStoreBusy] = useState(false);
  const previousRideIds = useRef<Set<string>>(new Set());

  // Anything that dropped off the active list just finished: keep it as a
  // receipt, so a rider who taps this tab right after completing still sees
  // what they earned rather than an empty screen.
  useEffect(() => {
    if (activeRides === undefined) return;
    const current = new Set(
      (activeRides ?? []).map((entry) => entry.ride._id as string),
    );
    for (const id of previousRideIds.current) {
      if (!current.has(id)) setReceiptId(id as Id<"rides">);
    }
    previousRideIds.current = current;
    if (current.size > 0) setReceiptId(null);
  }, [activeRides]);

  // Prefill the reported amount when a pasugo ride becomes active. Render-time
  // adjustment (the documented alternative to a sync effect): the key tracks
  // which rides exist and what has already been reported, and the write runs
  // only when that key actually changes.
  const costPrefillKey = (activeRides ?? [])
    .map((entry) => `${entry.ride._id}:${entry.ride.itemCostActual ?? ""}`)
    .join("|");
  const [prefilledCostKey, setPrefilledCostKey] = useState(costPrefillKey);
  if (costPrefillKey !== prefilledCostKey) {
    setPrefilledCostKey(costPrefillKey);
    setItemCosts(
      Object.fromEntries(
        (activeRides ?? []).map((entry) => [
          entry.ride._id as string,
          entry.ride.itemCostActual != null
            ? String(entry.ride.itemCostActual)
            : "",
        ]),
      ),
    );
  }

  const liveRides = activeRides ?? [];
  const primary = liveRides[0] ?? null;
  const selfLocation = geo.coords;
  const platformRate = earnings?.platformRate ?? DRIVER_PLATFORM_RATE;

  const handleAdvance = async (
    rideId: string,
    status: "RIDER_ARRIVING" | "RIDER_ARRIVED" | "IN_PROGRESS" | "COMPLETED",
  ) => {
    setBusy(true);
    try {
      await updateRideStatus({ rideId: rideId as Id<"rides">, status });
      if (status === "COMPLETED") setCollected(false);
      // The rider is looking at the road, not the screen: a confirmation has to
      // announce itself. Without one, a tap that did not register looks exactly
      // like a tap that did.
      const confirmation: Partial<Record<typeof status, [string, string]>> = {
        RIDER_ARRIVING: ["On your way", "Head to the pickup point."],
        RIDER_ARRIVED: ["Arrived", "Let your passenger know you're here."],
        IN_PROGRESS: ["Trip started", "Drive safely."],
        COMPLETED: ["Trip completed", "Collect the fare below."],
      };
      const message = confirmation[status];
      if (message) toast.success(message[0], { description: message[1] });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (rideId: string) => {
    setBusy(true);
    try {
      await cancelRide({ rideId: rideId as Id<"rides"> });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const submitItemCost = async (rideId: string) => {
    // The rider may leave the box empty; Number("") is 0, which would report a
    // ₱0 purchase as though it were fact. Anything unparseable is refused
    // instead, so a typo never becomes a real number in the commuter's receipt.
    const value = Number.parseFloat(itemCosts[rideId] ?? "");
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    setSavingCost(true);
    try {
      await reportItemCost({ rideId: rideId as Id<"rides">, itemCost: value });
      toast.success("Amount reported", {
        description: "The commuter can prepare it for hand-over.",
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingCost(false);
    }
  };

  const submitStore = async () => {
    if (!storeEdit || !storeDraft) return;
    setStoreBusy(true);
    try {
      await confirmStore({
        rideId: storeEdit.rideId,
        store: {
          lat: storeDraft.lat,
          lng: storeDraft.lng,
          address: storeDraft.label,
        },
      });
      setStoreEdit(null);
      setStoreDraft(null);
      toast.success("Store corrected");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setStoreBusy(false);
    }
  };

  const goOffline = async () => {
    setGoingOffline(true);
    try {
      await setOnline({ isOnline: false });
      navigate("/rider");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setGoingOffline(false);
    }
  };

  // Markers: the rider, plus both ends of every ride they are carrying. The
  // drop-off is a flag so the two ends are distinguishable at a glance.
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
  }
  for (const entry of liveRides) {
    const ride = entry.ride;
    markers.push({
      id: `pickup-${ride._id}`,
      lat: ride.pickup.lat,
      lng: ride.pickup.lng,
      kind: "pickup",
      label: ride.code,
    });
    markers.push({
      id: `destination-${ride._id}`,
      lat: ride.destination.lat,
      lng: ride.destination.lng,
      kind: "flag",
      label: ride.code,
    });
  }

  const center: LatLng =
    selfLocation ??
    (primary
      ? { lat: primary.ride.pickup.lat, lng: primary.ride.pickup.lng }
      : FALLBACK_CENTER);

  /**
   * The leg the rider is actually driving right now.
   *
   * Two segments while heading to the pickup — the rider's own route to the
   * passenger — and one while carrying them. `MapView` routes each segment
   * separately and stitches, so drawing both here would not merge them into a
   * single road that ignores the pickup.
   */
  let route: [LatLng, LatLng][] | null = null;
  if (primary) {
    const stage = driverStage(primary.ride.status);
    if (stage === "in_trip") {
      route = selfLocation
        ? [[selfLocation, { lat: primary.ride.destination.lat, lng: primary.ride.destination.lng }]]
        : [
            [
              { lat: primary.ride.pickup.lat, lng: primary.ride.pickup.lng },
              { lat: primary.ride.destination.lat, lng: primary.ride.destination.lng },
            ],
          ];
    } else if (stage === "at_pickup") {
      route = [
        [
          { lat: primary.ride.pickup.lat, lng: primary.ride.pickup.lng },
          { lat: primary.ride.destination.lat, lng: primary.ride.destination.lng },
        ],
      ];
    } else if (stage === "to_pickup") {
      route = selfLocation
        ? [[selfLocation, { lat: primary.ride.pickup.lat, lng: primary.ride.pickup.lng }]]
        : null;
    }
  }

  const hasRide = liveRides.length > 0;
  // Only a completed trip becomes a receipt. A cancelled ride also reaches
  // "done", and a cancelled trip is not something to show a fare breakdown
  // for — there was no trip.
  const showReceipt =
    !hasRide && receipt != null && receipt.ride.status === "COMPLETED";

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-5 sm:py-5">
        {/* Map. Edge-to-edge on a phone, boxed from sm up. */}
        <div className="-mx-4 overflow-hidden border-b border-border sm:mx-0 sm:rounded-3xl sm:border">
          <MapView
            center={center}
            zoom={primary ? 15 : 14}
            markers={markers}
            route={route}
            followTarget={selfLocation}
            recenterTarget={selfLocation}
            className="h-[46dvh] min-h-[320px] w-full lg:h-[54vh]"
          />
        </div>

        <div className="mt-4 space-y-4">
          {!hasRide && !showReceipt ? (
            <section className="rounded-3xl border border-border/70 bg-card p-6 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <MapPin className="size-5 text-muted-foreground" />
              </div>
              <h2 className="mt-4 text-base font-semibold tracking-tight">
                No trip in progress
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                When you accept a booking, the route and the passenger appear
                here — separate from your dashboard, so you are never scrolling
                past earnings to find where you are going.
              </p>
              <Button asChild className="mt-5">
                <Link to="/rider">Back to available bookings</Link>
              </Button>
            </section>
          ) : null}

          {liveRides.map((active) => {
            const ride = active.ride;
            const rideId = ride._id as string;
            const stage = driverStage(ride.status);
            const errand = ride.bookingType != null && ride.bookingType !== "ride";
            const errandKind = ride.bookingType === "pabili" ? "pabili" : "padala";
            const counterparty = active.counterparty;
            /*
             * Who this trip is actually for.
             *
             * `counterparty` is the *account* on the other side — the person who
             * booked, and the one the rider chats with and rates. When the trip
             * was booked for somebody else those are different people, and the
             * one standing at the pickup is the passenger. So the name and the
             * call button below use the passenger; the avatar, rating and chat
             * stay with the account.
             */
            const passenger = active.passenger;
            const toPickupKm = selfLocation
              ? haversineKm(selfLocation, ride.pickup)
              : null;
            const toDestinationKm = selfLocation
              ? haversineKm(selfLocation, ride.destination)
              : null;
            const legKm =
              stage === "to_pickup"
                ? toPickupKm
                : stage === "in_trip"
                  ? toDestinationKm
                  : null;
            const etaMinutes = legKm != null ? etaMinutesFrom(legKm) : null;
            const elapsedMs = tripDurationMs(ride.startedAt, now);
            // How far into the trip the rider is. Derived from the booked
            // distance rather than summed from GPS fixes, so a lost signal
            // does not reset the odometer to zero mid-journey.
            const travelledKm =
              stage === "in_trip" && toDestinationKm != null
                ? Math.max(0, ride.distanceKm - toDestinationKm)
                : null;
            const action =
              stage === "to_pickup" && ride.status === "RIDER_ARRIVING"
                ? ARRIVE_ACTION
                : NEXT_ACTION[stage];

            return (
              <section
                key={rideId}
                className="overflow-hidden rounded-3xl border border-border/70 bg-card"
              >
                {/* Stage banner. */}
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5",
                    stage === "at_pickup"
                      ? "bg-emerald-600 text-white"
                      : stage === "in_trip"
                        ? "bg-fetch-ink text-white"
                        : "bg-muted/60",
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">
                      {ride.code}
                      {errand
                        ? ` · ${errandKind === "pabili" ? "Pabili" : "Padala"}`
                        : ""}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold tracking-tight">
                      {stage === "to_pickup"
                        ? "Heading to pickup"
                        : stage === "at_pickup"
                          ? "You've arrived"
                          : stage === "in_trip"
                            ? "Trip in progress"
                            : "Trip finished"}
                    </p>
                  </div>
                  {elapsedMs != null && stage === "in_trip" ? (
                    <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium tracking-tight">
                      {formatDuration(elapsedMs)}
                    </span>
                  ) : null}
                </div>

                <div className="p-4 sm:p-5">
                  {/* Legs. */}
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold"
                      >
                        A
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm tracking-tight">
                          {shortAddress(ride.pickup.address)}
                        </p>
                        {stage === "to_pickup" && toPickupKm != null ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDistance(toPickupKm)} away
                            {etaMinutes != null
                              ? ` · ${etaMinutes} min`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-fetch-red text-[10px] font-semibold text-white"
                      >
                        B
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm tracking-tight">
                          {shortAddress(ride.destination.address)}
                        </p>
                        {stage === "in_trip" && toDestinationKm != null ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatDistance(toDestinationKm)} remaining
                            {etaMinutes != null ? ` · ${etaMinutes} min` : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Live metrics. */}
                  {stage === "in_trip" ? (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Metric
                        label="Travelled"
                        value={
                          travelledKm != null
                            ? formatDistance(travelledKm)
                            : "—"
                        }
                      />
                      <Metric
                        label="Remaining"
                        value={
                          toDestinationKm != null
                            ? formatDistance(toDestinationKm)
                            : formatDistance(ride.distanceKm)
                        }
                      />
                      <Metric
                        label="ETA"
                        value={etaMinutes != null ? `${etaMinutes} min` : "—"}
                      />
                      <Metric label="Fare" value={formatPeso(ride.fare)} />
                    </div>
                  ) : (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <Metric
                        label="To pickup"
                        value={
                          toPickupKm != null
                            ? formatDistance(toPickupKm)
                            : formatDistance(ride.distanceKm)
                        }
                      />
                      <Metric
                        label="ETA"
                        value={etaMinutes != null ? `${etaMinutes} min` : "—"}
                      />
                      <Metric label="Fare" value={formatPeso(ride.fare)} />
                    </div>
                  )}

                  {/* Passenger. The name and number are the passenger's own, so this is who
                      the rider is about to meet — with the booker named
                      separately when they are somebody else. */}
                  {passenger || counterparty ? (
                    <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                      <PassengerAvatar
                        name={passenger?.name ?? counterparty?.name ?? ""}
                        // The booker's photo only when the booker *is* the
                        // passenger. Beside a somebody-else passenger's name it
                        // would put a different person's face on the person
                        // waiting at the pickup; initials are the honest answer.
                        photoUrl={
                          passenger && !passenger.isBooker
                            ? null
                            : counterparty?.photoUrl ?? null
                        }
                        className="size-11"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          Passenger
                        </p>
                        <p className="truncate text-sm font-medium tracking-tight">
                          {passenger?.name ?? counterparty?.name}
                        </p>
                        {passenger?.phone ? (
                          <a
                            href={`tel:${passenger.phone}`}
                            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                          >
                            {passenger.phone}
                          </a>
                        ) : null}
                        {passenger?.bookedByName ? (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Booked by {passenger.bookedByName}
                          </p>
                        ) : null}
                        {passenger?.isBooker && counterparty?.rating ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Star className="size-3 fill-fetch-gold text-fetch-gold" />
                            {counterparty.rating.avg.toFixed(1)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <a
                      href={
                        // The passenger's number first: they are the one waiting
                        // at the pickup. The booker's is the fallback for a trip
                        // booked before passenger details existed.
                        passenger?.phone ?? counterparty?.phone
                          ? `tel:${passenger?.phone ?? counterparty?.phone}`
                          : undefined
                      }
                      aria-disabled={!(passenger?.phone ?? counterparty?.phone)}
                      className={cn(
                        "flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-medium tracking-tight transition active:bg-secondary",
                        !(passenger?.phone ?? counterparty?.phone) &&
                          "pointer-events-none opacity-50",
                      )}
                    >
                      <Phone className="size-4" />
                      Call
                    </a>
                    <Link
                      to={`/chats?ride=${rideId}`}
                      className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-medium tracking-tight transition active:bg-secondary"
                    >
                      <MessageCircle className="size-4" />
                      Message
                    </Link>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                        shortAddress(
                          stage === "in_trip"
                            ? ride.destination.address
                            : ride.pickup.address,
                        ),
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-border text-xs font-medium tracking-tight transition active:bg-secondary"
                    >
                      <Navigation className="size-4" />
                      Navigate
                    </a>
                  </div>

                  {/* Pasugo. */}
                  {errand ? (
                    <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-3.5">
                      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        <ShoppingBasket className="size-3.5" />
                        {errandKind === "pabili" ? "Pabili" : "Padala"}
                      </p>
                      {ride.bookingType === "padala" && ride.items ? (
                        <ul className="mt-2 space-y-1">
                          {ride.items.map((item) => (
                            <li
                              key={item.name}
                              className="text-sm leading-6 tracking-tight"
                            >
                              {item.qty}× {item.name}
                            </li>
                          ))}
                        </ul>
                      ) : ride.notes ? (
                        <p className="mt-2 text-sm leading-6 tracking-tight">
                          {ride.notes}
                        </p>
                      ) : null}
                      {ride.itemBudget != null ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Budget {formatPeso(ride.itemBudget)}
                        </p>
                      ) : null}
                      {ride.bookingType === "pabili" &&
                      ride.status !== "IN_PROGRESS" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-3"
                          onClick={() => setStoreEdit({ rideId: ride._id })}
                        >
                          Correct the store
                        </Button>
                      ) : null}
                      {ride.itemCostActual != null ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          You reported {formatPeso(ride.itemCostActual)}
                        </p>
                      ) : (
                        <div className="mt-3 space-y-1.5">
                          <Label htmlFor={`cost-${rideId}`} className="text-xs">
                            What did you spend?
                          </Label>
                          <Input
                            // Keyed only on this ride's own reported amount.
                            // Folding the whole list in here remounted the
                            // input every time any ride changed, throwing away
                            // whatever the rider had typed.
                            key={`${rideId}:${ride.itemCostActual ?? ""}`}
                            id={`cost-${rideId}`}
                            inputMode="decimal"
                            placeholder="0.00"
                            value={itemCosts[rideId] ?? ""}
                            onChange={(event) =>
                              setItemCosts((prev) => ({
                                ...prev,
                                [rideId]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingCost}
                            onClick={() => void submitItemCost(rideId)}
                          >
                            {savingCost ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              "Report amount"
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {/* Arrival confirmation, at the pickup. */}
                  {stage === "at_pickup" ? (
                    <div className="mt-4 flex items-center gap-2 rounded-2xl bg-emerald-600/10 px-3.5 py-3 text-xs leading-5 text-emerald-700 dark:text-emerald-400">
                      <BadgeCheck className="size-4 shrink-0" />
                      Waiting for your passenger to board. Start the trip once
                      they are in.
                    </div>
                  ) : null}

                  {/* Actions. */}
                  <div className="mt-4 flex flex-col gap-2">
                    {action ? (
                      <Button
                        className="h-12"
                        disabled={busy}
                        onClick={() =>
                          void handleAdvance(rideId, action.status)
                        }
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            {action.label}
                            <ArrowRight className="size-4" />
                          </>
                        )}
                      </Button>
                    ) : null}
                    {ride.status !== "IN_PROGRESS" ? (
                      <Button
                        variant="outline"
                        className="h-11"
                        disabled={busy}
                        onClick={() => void handleCancel(rideId)}
                      >
                        Cancel ride
                      </Button>
                    ) : (
                      <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                        <AlertCircle className="size-3.5 shrink-0" />
                        A trip in progress cannot be cancelled. Contact support
                        if something is wrong.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          {/* ── Trip completed ─────────────────────────────────────────── */}
          {showReceipt && receipt ? (
            <CompletedPanel
              receipt={receipt}
              platformRate={platformRate}
              collected={collected}
              onCollect={() => setCollected(true)}
              goingOffline={goingOffline}
              onGoOffline={() => void goOffline()}
              onNextRide={() => navigate("/rider")}
            />
          ) : null}
        </div>
      </div>

      <Sheet
        open={storeEdit != null}
        onOpenChange={(open) => {
          if (!open) {
            setStoreEdit(null);
            setStoreDraft(null);
          }
        }}
      >
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Correct the store</SheetTitle>
            <SheetDescription>
              The commuter pins the nearest place they know, which is often not
              the shop. Search for the real store and Fetch reprices the trip —
              your service fee never drops below what they agreed to, and it can
              only rise within the agreed band.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <PlaceSearch
              value={storeDraft?.label ?? ""}
              onSelect={(place) => setStoreDraft(place)}
            />
            <Button
              className="w-full"
              disabled={storeBusy || !storeDraft}
              onClick={() => void submitStore()}
            >
              {storeBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Use this store"
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}

/**
 * The receipt a rider is left looking at when a trip ends.
 *
 * Reads the stored breakdown line by line rather than recomputing it, so the
 * numbers on screen are the ones the commuter was charged. When the rider
 * collects the exact amount, the receipt shows the full fare as the rider's
 * take-home and the platform-fee line is omitted.
 *
 * When the rider is still on the legacy setup, the same panel still shows the
 * commission line from the settlement helper and still uses the stored
 * breakdown for the commuter-facing lines.
 */
function CompletedPanel({
  receipt,
  platformRate,
  collected,
  onCollect,
  goingOffline,
  onGoOffline,
  onNextRide,
}: {
  receipt: {
    ride: {
      _id: Id<"rides">;
      code: string;
      fare: number;
      distanceKm: number;
      startedAt?: number;
      completedAt?: number;
      paymentMethod?: "cash" | "online";
      bookingType?: string;
      destination: { address?: string };
      fareBreakdown?: {
        baseFare: number;
        distanceFee: number;
        stopFee: number;
        surgeFee: number;
        tax: number;
        total: number;
        taxRatePct: number;
      } | null;
    };
  };
  platformRate: number;
  collected: boolean;
  onCollect: () => void;
  goingOffline: boolean;
  onGoOffline: () => void;
  onNextRide: () => void;
}) {
  // Read here rather than plumbed through as props: the receipt is the one
  // place a rider wants the two numbers that changed because of this trip —
  // their standing, and the day's running total.
  const stats = useQuery(api.riders.getDriverStats);
  const earnings = useQuery(api.rides.riderEarnings);
  const ride = receipt.ride;
  const settlement = settleTrip(ride.fareBreakdown, ride.fare, platformRate);
  const durationMs = tripDurationMs(ride.startedAt, ride.completedAt);
  const isCash = (ride.paymentMethod ?? "cash") === "cash";
  const hasBreakdown = ride.fareBreakdown != null;
  const collectAmount = settlement.net;

  return (
    <section className="overflow-hidden rounded-3xl border border-border/70 bg-card">
      <div className="flex items-center gap-3 bg-emerald-600 px-4 py-4 text-white sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Check className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">
            {ride.code}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            Trip completed
          </h2>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Distance" value={formatDistance(ride.distanceKm)} />
          <Metric
            label="Duration"
            value={durationMs != null ? formatDuration(durationMs) : "—"}
          />
          <Metric
            label="Payment"
            value={isCash ? "Cash" : "Online"}
          />
        </div>

        {/* Fare breakdown. */}
        <div className="mt-4 rounded-2xl bg-muted/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Fare breakdown
          </p>
          <dl className="mt-2 space-y-1.5 text-sm">
            {[
              ["Base fare", settlement.baseFare],
              ["Distance charge", settlement.distanceFee],
              ["Service fee", settlement.stopFee],
              ["Surge", settlement.surgeFee],
            ].map(([label, value]) => (
              <div
                key={label as string}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="text-muted-foreground">{label as string}</dt>
                <dd className="tracking-tight">{formatPeso(value as number)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tracking-tight">{formatPeso(settlement.subtotal)}</dd>
            </div>
            {/* Only while a rate is actually being charged — see
                `DEFAULT_TAX_RATE_PCT`, which is 0 during trial runs. A
                "Tax (0%) ₱0.00" line on a rider's settlement reads as a
                miscalculation rather than as the absence of one. */}
            {hasBreakdown && (ride.fareBreakdown?.tax ?? 0) > 0 ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">
                  Tax ({ride.fareBreakdown?.taxRatePct}%)
                </dt>
                <dd className="tracking-tight">
                  {formatPeso(ride.fareBreakdown?.tax ?? 0)}
                </dd>
              </div>
            ) : null}
            {/* A pabili whose store pin was corrected is repriced without the
                itemisation being rewritten, so the fare the rider collects is
                no longer the sum of the rows above. Showing the difference
                keeps the receipt adding up — and it is the one line on this
                screen that explains why the take-home is not the original
                quote. Absent on every other trip. */}
            {settlement.storeCorrection > 0 ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">Store correction</dt>
                <dd className="tracking-tight">
                  +{formatPeso(settlement.storeCorrection)}
                </dd>
              </div>
            ) : null}
            {settlement.exactAmount ? null : (
              <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1.5">
                <dt className="text-muted-foreground">
                  Platform fee ({Math.round(settlement.platformRate * 100)}%)
                </dt>
                <dd className="tracking-tight text-muted-foreground">
                  −{formatPeso(settlement.commission)}
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-sm font-medium tracking-tight">
              You take home
            </span>
            <span className="text-2xl font-bold tracking-tight">
              {formatPeso(settlement.net)}
            </span>
          </div>
        </div>

        {/* Rating, once the passenger leaves one. */}
        <div className="mt-4">
          <RideRatingReadOnly rideId={ride._id} />
        </div>

        {!collected ? (
          <div className="mt-4">
            <p className="mb-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" />
              Waiting for your passenger to step out.
            </p>
            <Button className="h-12 w-full" onClick={onCollect}>
              <Wallet className="size-4" />
              {isCash
                ? `Collect ${formatPeso(collectAmount)} in cash`
                : "Confirm payment received"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {isCash
                ? "Hand the change back before your passenger leaves."
                : "This trip was paid online — nothing to collect."}
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600/10 px-3.5 py-3 text-sm font-medium tracking-tight text-emerald-700 dark:text-emerald-400">
              <BadgeCheck className="size-4" />
              {isCash ? "Payment collected" : "Confirmed"}
            </div>

            {/* Today so far, and where this trip left the rider's standing. */}
            <div className="grid grid-cols-3 gap-2">
              <Metric
                label="Today"
                value={formatPeso(earnings?.today ?? settlement.net)}
              />
              <Metric
                label="Trips today"
                value={String(earnings?.todayCount ?? 1)}
              />
              <Metric
                label="Your rating"
                value={stats?.rating ? stats.rating.avg.toFixed(1) : "—"}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="h-12 flex-1" onClick={onNextRide}>
                <Flag className="size-4" />
                Next ride
              </Button>
              <Button
                variant="outline"
                className="h-12 flex-1"
                disabled={goingOffline}
                onClick={onGoOffline}
              >
                {goingOffline ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Go offline"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium tracking-tight">
        {value}
      </p>
    </div>
  );
}
