import { AppShell } from "@/components/AppShell";
import { PlaceSearch } from "@/components/ride/PlaceSearch";
import { STATUS_LABEL } from "@/components/ride/RideStatus";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { roleLabel } from "@/lib/account";
import { isOngoingStatus, resolveBookingType, type BookingType } from "@/lib/booking";
import { bookUrl, type PickedPlace } from "@/lib/booking-url";
import { DEFAULT_TARIFF, formatPeso, shortAddress } from "@/lib/geo";
import { ServiceAreaSheet } from "@/components/ServiceAreaSheet";
import { LIVE_CITY_NAMES, REGION } from "@/lib/region";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import {
  ArrowRight,
  Briefcase,
  CornerUpLeft,
  Crosshair,
  MapPin,
  MapPinned,
  Package,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";

/** The three services, as the wide cards the design leads with. */
const SERVICES: { type: BookingType; label: string; hint: string; icon: LucideIcon; tile: string }[] = [
  {
    type: "ride",
    label: "Ride",
    hint: "Across town",
    icon: MapPin,
    tile: "bg-primary text-white",
  },
  {
    type: "pabili",
    label: "Pabili",
    hint: "Buy & deliver",
    icon: ShoppingBasket,
    // Gold is the one tile a white glyph would vanish into, so it takes the
    // ink from the crest's black rim instead.
    tile: "bg-fetch-gold text-foreground",
  },
  {
    type: "padala",
    label: "Pasugo",
    hint: "Send a parcel",
    icon: Package,
    tile: "bg-fetch-royal text-white",
  },
];

/** Icon per saved place, so Home and Work read at a glance. */
function savedPlaceIcon(label: string) {
  const key = label.trim().toLowerCase();
  if (key === "home") return <MapPin className="size-4" />;
  if (key === "work" || key === "school") return <Briefcase className="size-4" />;
  return <MapPinned className="size-4" />;
}

/** "Good morning" and friends. Cheap, and it makes the first screen a greeting. */
function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The commuter's home.
 *
 * A hub, not a form: who you are, where you want to go, and the three services
 * that can take you there. The trip list lives in Activity and the
 * conversations in Chats, so this screen stays the one thing you open when you
 * are about to book.
 */
export default function Home() {
  const profile = useQuery(api.profiles.getMyProfile);
  const active = useQuery(api.rides.getActiveRide);
  const rides = useQuery(api.rides.listMyRides);
  const savedPlaces = useQuery(api.savedPlaces.listMine);
  const tariff = useQuery(api.tariffs.getActiveTariff);
  const liveRide = active?.ride ?? null;
  const liveTariff = tariff ?? { id: null, ...DEFAULT_TARIFF };

  // Set once from the search box or a saved place, and then reused by every
  // service card: pick the drop-off once, choose the service second.
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  // The pickup is optional and only set when the commuter asks for it — a
  // repeated trip is the case where it comes for free.
  const [pickup, setPickup] = useState<PickedPlace | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);

  // `/app?type=pabili` was how the service tabs used to address the booking
  // form, and those links are still out in the world — a tab saved on someone's
  // home screen, or in an old message. Send them to the form rather than
  // dropping them on the hub, which has no idea what was asked for.
  const [params] = useSearchParams();
  const legacyType = params.get("type");

  if (legacyType) {
    return <Navigate to={bookUrl(resolveBookingType(legacyType))} replace />;
  }
  if (profile === null) return <Navigate to="/onboarding" replace />;
  // A rider on the passenger's home screen would see services they cannot
  // book, so send them to the dashboard they came from.
  if (profile?.role === "rider") return <Navigate to="/rider" replace />;

  // "Again" only means something once there is a trip to repeat: the most
  // recent finished one, which is the drop-off someone is most likely to want.
  // Both ends come with it — a home-to-campus run repeated from the campus is
  // the whole point, and half a repeat is a trip that starts in the wrong place.
  const lastFinished = (rides ?? []).find((ride) => !isOngoingStatus(ride.status));
  const againLink = lastFinished
    ? bookUrl(
        (lastFinished.bookingType ?? "ride") as BookingType,
        {
          lat: lastFinished.destination.lat,
          lng: lastFinished.destination.lng,
          label: shortAddress(lastFinished.destination.address),
        },
        {
          lat: lastFinished.pickup.lat,
          lng: lastFinished.pickup.lng,
          label: shortAddress(lastFinished.pickup.address),
        },
      )
    : null;

  const name = profile?.name?.trim();
  const firstName = name ? name.split(/\s+/)[0] : null;

  return (
    <AppShell bottomActiveKey="home">
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6 sm:py-5">
        {/* Who you are, first. The account itself — photo, details, sign out —
            is the avatar in the header, so this is a greeting and nothing more.
            It used to be a button that opened the account sheet, which put the
            same account in two places on one screen. */}
        <div>
          <p className="truncate text-lg font-bold tracking-tight">
            {greeting(new Date())}
            {firstName ? `, ${firstName}` : ""}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {roleLabel(profile?.role)} · {REGION.name}
          </p>
        </div>

        {/* The drop-off is the one thing people open the app to decide. */}
        <div className="mt-4">
          <PlaceSearch
            placeholder="Where to?"
            value={picked?.label ?? ""}
            onSelect={(place) =>
              setPicked({ lat: place.lat, lng: place.lng, label: place.label })
            }
          />
        </div>

        {picked ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Going to{" "}
            <span className="font-medium text-foreground">{picked.label}</span>
            {pickup ? (
              <>
                {" · from "}
                <span className="font-medium text-foreground">
                  {pickup.label}
                </span>
              </>
            ) : null}
          </p>
        ) : null}

        {/* Services. Above the hero, because this is the question the screen
            answers: which of the three things do you want. The promo below is
            reassurance about where Fetch runs, which matters once you have
            picked something — not before. */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {SERVICES.map((service) => (
            <Link
              key={service.type}
              to={bookUrl(service.type, picked, pickup)}
              className="rounded-2xl border border-border p-3 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl",
                  service.tile,
                )}
              >
                <service.icon className="size-5" aria-hidden />
              </span>
              <p className="mt-2.5 text-sm font-semibold tracking-tight">
                {service.label}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {service.hint}
              </p>
            </Link>
          ))}
        </div>

        {/* Hero. A live trip outranks the promo, so it takes the slot the design
            gives to it. */}
        {liveRide ? (
          <Link
            to="/book"
            className="mt-4 block rounded-3xl bg-fetch-ink p-5 text-white"
          >
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/70">
              Trip in progress · {liveRide.code}
            </p>
            <p className="mt-3 text-lg font-bold tracking-tight">
              {STATUS_LABEL[liveRide.status] ?? liveRide.status}
            </p>
            <p className="mt-1 truncate text-sm text-white/80">
              {shortAddress(liveRide.pickup.address)} →{" "}
              {shortAddress(liveRide.destination.address)}
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold">
              Open trip <ArrowRight className="size-4" />
            </span>
          </Link>
        ) : (
          <div className="mt-4 rounded-3xl bg-gradient-to-br from-fetch-red to-fetch-red-deep p-5 text-white">
            <h2 className="text-2xl font-bold tracking-tight">
              Serving {REGION.name}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/85">
              Rides, pasugo and pabili in {LIVE_CITY_NAMES.join(" and ")} —
              and the fare is shown before you ever request.
            </p>
            <Button
              asChild
              className="mt-4 h-11 w-full rounded-full bg-white text-sm font-bold text-fetch-red hover:bg-white/90"
            >
              <Link to={bookUrl("ride", picked, pickup)}>Book a ride</Link>
            </Button>
          </div>
        )}

        {/* Fares, from the live tariff rather than the shipped defaults. */}
        <div className="mt-3 rounded-2xl bg-secondary px-4 py-3 text-center">
          <p className="text-sm font-semibold tracking-tight">
            From {formatPeso(liveTariff.minFare)} ·{" "}
            {formatPeso(liveTariff.ratePerKm)} per extra km
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Locked to your trip the moment you request it.
          </p>
        </div>

        {/* Everything that is not a service. No Account tile: that is the
            header's avatar now, and a second way into the same place is a
            worse answer than one obvious one. */}
        <div
          className={cn(
            "mt-4 grid gap-3",
            againLink ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          {againLink ? (
            <Tile label="Again" icon={CornerUpLeft} to={againLink} />
          ) : null}
          <Tile
            label="Saved"
            icon={MapPinned}
            onClick={() => setSavedOpen(true)}
          />
          <Tile
            label="Coverage"
            icon={MapPin}
            onClick={() => setCoverageOpen(true)}
          />
        </div>
      </div>

      {/* Saved places */}
      <Sheet open={savedOpen} onOpenChange={setSavedOpen}>
        <SheetContent
          side="bottom"
          className="px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader>
            <SheetTitle className="text-base tracking-tight">
              Saved places
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Tap a place to go there, or Start to set it as your pickup.
            </p>
          </SheetHeader>
          {(savedPlaces ?? []).length === 0 ? (
            <p className="pt-2 text-sm leading-6 text-muted-foreground">
              Nothing saved yet. Pin a spot on the booking map and save it, and
              it will be waiting here.
            </p>
          ) : (
            <ul className="space-y-2 pt-2">
              {(savedPlaces ?? []).map((place) => {
                const point: PickedPlace = {
                  lat: place.lat,
                  lng: place.lng,
                  label: place.address ?? place.label,
                };
                return (
                  <li
                    key={place._id}
                    className="flex items-stretch gap-1 rounded-xl border border-border"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(point);
                        setSavedOpen(false);
                      }}
                      className="flex min-h-11 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-muted-foreground">
                        {savedPlaceIcon(place.label)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium tracking-tight">
                          {place.label}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {shortAddress(place.address)}
                        </span>
                      </span>
                    </button>
                    {/* A saved place is as often where the trip starts as where
                        it ends — "pick me up at home" is a one-tap request, and
                        the booking form will use the GPS point as the default
                        when this is left unset. */}
                    <button
                      type="button"
                      onClick={() => {
                        setPickup(point);
                        setSavedOpen(false);
                      }}
                      className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold tracking-tight text-primary transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Crosshair className="size-4" aria-hidden />
                      Start
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SheetContent>
      </Sheet>

      {/* Where Fetch runs. One sheet, shared with the account panel and the
          profile page, so the service area is stated the same way everywhere
          somebody might check it. */}
      <ServiceAreaSheet open={coverageOpen} onOpenChange={setCoverageOpen} />
    </AppShell>
  );
}

/** One round icon button with a label, the way the design's tiles read. */
function Tile({
  label,
  icon: Icon,
  to,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  to?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary text-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-center text-[11px] leading-4 tracking-tight">
        {label}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex flex-col items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </button>
    );
  }
  return (
    <Link
      to={to ?? "/"}
      className="flex flex-col items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}
