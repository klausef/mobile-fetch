import { MapView, type MapMarker } from "@/components/map/MapView";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDistance, formatPeso, shortAddress } from "@/lib/geo";
import {
  formatCountdown,
  isRequestExpired,
  REQUEST_TIMEOUT_MS,
  remainingMs,
} from "@/lib/driver";
import { cn } from "@/lib/utils";
import { Bike, Car, Clock, Loader2, Star, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * The shape of one open request, as `riders.nearbyRequests` returns it.
 *
 * Declared here rather than inferred from the query's output type so the
 * component can be rendered with fixture data in a test or a story without a
 * Convex client attached.
 */
export interface RideRequest {
  _id: string;
  code: string;
  name: string;
  phone?: string;
  photoUrl?: string | null;
  rating?: { avg: number; count: number } | null;
  bookingType: string;
  /**
   * Who booked for whom, when the two differ.
   *
   * A rider who accepts "Juan, booked by Ranniel" and then rings Ranniel at the
   * pickup has misunderstood the job, so the card names both and labels them.
   * Null when the passenger is the booker, which is the ordinary case.
   */
  bookedByName?: string | null;
  pickup: { lat: number; lng: number; address?: string };
  destination: { lat: number; lng: number; address?: string };
  distanceKm: number;
  fare: number;
  rideType: string;
  etaMinutes?: number;
  pickupDistanceKm?: number | null;
  /**
   * The rider let the fifteen-second window close on this one.
   *
   * Not read by this component — the card is not shown for a request it is
   * true for. Declared because this type is documented as the shape
   * `riders.nearbyRequests` returns, and it stopped being that shape when the
   * query started reporting a lapse instead of silently dropping the row. The
   * rider screen is what acts on it.
   */
  expiredForYou?: boolean;
}

const RIDE_TYPE_ICON: Record<string, typeof Car> = {
  motorcycle: Bike,
  tricycle: Bike,
  car: Car,
  van: Users,
};

/**
 * An incoming request, as a sheet over the map.
 *
 * The countdown is the point of this screen. A request card that sits open
 * indefinitely is a promise the app cannot keep — the passenger is watching a
 * pin that never moves — so the card owns its own deadline and closes itself.
 * The deadline resets per request because the caller keys this component on the
 * request id, remounting it for each new one; a deadline held in a parent across
 * requests would count down the wrong one.
 *
 * Everything is a full-width, 44px-plus target: a rider taps this with a thumb,
 * often while the vehicle is still rolling.
 */
export function RideRequestModal({
  request,
  open,
  busy,
  onAccept,
  onReject,
  onExpire,
}: {
  request: RideRequest | null;
  open: boolean;
  busy: boolean;
  onAccept: (request: RideRequest) => void;
  onReject: (request: RideRequest) => void;
  /** Called once when the window closes, so the caller can clear the card. */
  onExpire?: (request: RideRequest) => void;
}) {
  // Set once per mount, which is once per request — see the note above.
  const [deadline] = useState(() => Date.now() + REQUEST_TIMEOUT_MS);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const expiredRef = useRef(false);

  useEffect(() => {
    if (!open || !request) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [open, request]);

  // Fire the expiry exactly once. An effect rather than a branch in render,
  // because render must stay pure and the timer can tick past zero several
  // times before the parent reacts.
  useEffect(() => {
    if (!open || !request) return;
    if (expiredRef.current) return;
    if (!isRequestExpired(deadline, nowMs)) return;
    expiredRef.current = true;
    onExpire?.(request);
  }, [open, request, deadline, nowMs, onExpire]);

  if (!request) return null;

  const left = remainingMs(deadline, nowMs);
  const fraction = Math.max(0, Math.min(1, left / REQUEST_TIMEOUT_MS));
  const Icon = RIDE_TYPE_ICON[request.rideType] ?? Car;
  const urgent = left <= 5000;

  const markers: MapMarker[] = [
    {
      id: "pickup",
      lat: request.pickup.lat,
      lng: request.pickup.lng,
      kind: "pickup",
      label: "Pickup",
    },
    {
      id: "destination",
      lat: request.destination.lat,
      lng: request.destination.lng,
      kind: "flag",
      label: "Drop-off",
    },
  ];

  return (
    <Sheet open={open} modal>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base tracking-tight">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-fetch-red/70" />
              <span className="relative inline-flex size-2 rounded-full bg-fetch-red" />
            </span>
            New ride request
          </SheetTitle>
          <SheetDescription className="sr-only">
            A passenger nearby is looking for a rider. Accept or decline within
            the countdown.
          </SheetDescription>
        </SheetHeader>

        {/* Countdown. The bar drains while the number counts, so the deadline
            is legible out of the corner of an eye without reading it. */}
        <div className="px-4">
          <div className="mt-1 flex items-center justify-between gap-3">
            <span
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium tracking-tight",
                urgent ? "text-fetch-red" : "text-muted-foreground",
              )}
            >
              <Clock className="size-3.5" />
              {formatCountdown(left)} to accept
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <Icon className="size-3" />
              {request.rideType}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-200 ease-linear",
                urgent ? "bg-fetch-red" : "bg-fetch-gold",
              )}
              style={{ width: `${fraction * 100}%` }}
            />
          </div>
        </div>

        {/* Passenger. The name and number here are the *passenger's* — resolved by
            `nearbyRequests` from the ride itself — so this is who the rider
            meets at the pickup, which is the one fact the card exists to give. */}
        <div className="mt-4 flex items-center gap-3 px-4">
          <PassengerAvatar name={request.name} photoUrl={request.photoUrl} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Passenger
            </p>
            <p className="truncate text-sm font-medium tracking-tight">
              {request.name}
            </p>
            {request.phone ? (
              <a
                href={`tel:${request.phone}`}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {request.phone}
              </a>
            ) : null}
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              {request.rating ? (
                <>
                  <Star className="size-3 fill-fetch-gold text-fetch-gold" />
                  {request.rating.avg.toFixed(1)}
                  <span className="text-muted-foreground/70">
                    · {request.rating.count}{" "}
                    {request.rating.count === 1 ? "rating" : "ratings"}
                  </span>
                </>
              ) : (
                "New passenger"
              )}
            </p>
            {/* Only when it is not the same person, so it cannot be mistaken for
                the passenger's own name. */}
            {request.bookedByName ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Booked by {request.bookedByName}
              </p>
            ) : null}
          </div>
          <p className="shrink-0 text-right text-xl font-bold tracking-tight">
            {formatPeso(request.fare)}
          </p>
        </div>

        {/* Route preview. */}
        <div className="mt-4 px-4">
          <div className="overflow-hidden rounded-2xl border border-border">
            <MapView
              center={{ lat: request.pickup.lat, lng: request.pickup.lng }}
              zoom={13}
              markers={markers}
              route={[[request.pickup, request.destination]]}
              interactive={false}
              className="h-40 w-full"
            />
          </div>
        </div>

        {/* Legs. */}
        <div className="mt-4 space-y-3 px-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary text-[10px] font-semibold text-primary-foreground"
            >
              A
            </span>
            <div className="min-w-0">
              <p className="text-sm tracking-tight">
                {shortAddress(request.pickup.address)}
              </p>
              {request.pickupDistanceKm != null ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDistance(request.pickupDistanceKm)} from you
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
            <div className="min-w-0">
              <p className="text-sm tracking-tight">
                {shortAddress(request.destination.address)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 px-4">
          <Metric
            label="Trip"
            value={formatDistance(request.distanceKm)}
          />
          <Metric
            label="Rider ETA"
            value={
              request.etaMinutes != null ? `${request.etaMinutes} min` : "—"
            }
          />
          <Metric
            label="To pickup"
            value={
              request.pickupDistanceKm != null
                ? formatDistance(request.pickupDistanceKm)
                : "—"
            }
          />
        </div>

        <div className="mt-5 flex gap-2 px-4">
          <Button
            variant="outline"
            className="h-12 flex-1"
            disabled={busy}
            onClick={() => onReject(request)}
          >
            <X className="size-4" />
            Decline
          </Button>
          <Button
            className="h-12 flex-[1.6]"
            disabled={busy}
            onClick={() => onAccept(request)}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Accept ride"
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The passenger's face, or their initial.
 *
 * A monogram rather than a generic silhouette when there is no photo: a
 * photograph is optional, so the fallback has to look deliberate rather than
 * broken, and the first letter of a name is at least about this person.
 */
export function PassengerAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={cn("size-11 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full bg-fetch-red/10 text-base font-semibold text-fetch-red",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
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
