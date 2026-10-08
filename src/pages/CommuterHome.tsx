
import { AppShell } from "@/components/AppShell";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { BookingSummary, AddressText } from "@/components/ride/BookingSummary";
import { PlaceSearch } from "@/components/ride/PlaceSearch";
import { RideChat } from "@/components/ride/RideChat";
import { RideTimeline, STATUS_LABEL } from "@/components/ride/RideStatus";
import { RideSafetyActions } from "@/components/ride/RideSafetyActions";
import { RideRating } from "@/components/ride/RideRating";
import {
  validatePassenger,
  WhoIsRiding,
  type WhoIsRidingValue,
} from "@/components/ride/WhoIsRiding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentLocationContext } from "@/components/CurrentLocationProvider";
import { useAutoDetectOnBooking } from "@/hooks/use-current-location";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { useRecentDestinations } from "@/hooks/use-recent-destinations";
import { useReverseGeocode } from "@/hooks/use-reverse-geocode";
import { useRoadDistance } from "@/hooks/use-road-distance";
import { COMMUTER_TABS } from "@/lib/bottomTabs";
import {
  BOOKING_TYPES,
  resolveBookingType,
  serviceLabel,
  type BookingType,
} from "@/lib/booking";
import { locationStepUrl, readBookingPrefill } from "@/lib/booking-url";
import { initials } from "@/lib/account";
import { normalizeScheduledFor, scheduleLabel } from "@/lib/schedule";
import { errorMessage } from "@/lib/errors";
import {
  AVERAGE_SPEED_KMH,
  DEFAULT_TARIFF,
  formatDistance,
  formatEta,
  formatPeso,
  haversineKm,
  NEAR_STORE_KM,
  shortAddress,
} from "@/lib/geo";
import {
  fareBreakdown,
  formatSurge,
  isSurgeActive,
  rideTypeSpec,
  type RideType,
} from "@/lib/fare-breakdown";
import {
  canRetry,
  CURRENT_LOCATION_ZOOM,
  isSamePlace,
} from "@/lib/location";
import { type LatLng } from "@/lib/map-service";
import {
  isInRegion,
  isInServiceArea,
  LIVE_CITY_NAMES,
  nearestLiveCity,
  REGION,
} from "@/lib/region";
import { fitPoints } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowUpDown,
  Briefcase,
  CalendarClock,
  Check,
  Clock,
  Crosshair,
  Home,
  Loader2,
  LocateFixed,
  MapPin,
  MapPinned,
  ChevronRight,
  Navigation,
  Phone,
  Star,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";

type Point = { lat: number; lng: number; address?: string };
type Target = "pickup" | "destination";

/** Before a GPS fix, FETCH opens on the province it serves. */
const FALLBACK_CENTER: LatLng = REGION.center;

/**
 * The address a GPS-seeded pickup carries until the geocoder answers.
 *
 * A named constant rather than a bare string because it is a *marker*, not a
 * label: it is the only address the app is allowed to overwrite with a
 * reverse-geocoded one, so a typo here would quietly make every real address
 * look like something that could be replaced.
 */
const PENDING_ADDRESS = "Current location";

/**
 * The value a `datetime-local` input wants: local time, no seconds, no zone.
 *
 * An input rejects a value it cannot parse and silently shows empty, so this is
 * the one place that format is written down.
 */
function toInputValue(at: number): string {
  const date = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** An hour from now, rounded up to the next half hour. */
function soonValue(): string {
  const at = new Date(Date.now() + 60 * 60 * 1000);
  at.setMinutes(at.getMinutes() > 30 ? 60 : 30, 0, 0);
  return toInputValue(at.getTime());
}

/**
 * The next few half-hour slots, as one-tap choices.
 *
 * "Book for later" on its own means typing a date into a phone keyboard while
 * standing on a roadside. These are the times people actually book, so they are
 * offered first; anything else is still reachable through the input above.
 */
function quickSlots(): string[] {
  const slots: string[] = [];
  for (const hours of [2, 4, 24]) {
    const at = new Date(Date.now() + hours * 60 * 60 * 1000);
    at.setMinutes(0, 0, 0);
    slots.push(toInputValue(at.getTime()));
  }
  return slots;
}

/** Field labels and the request button change with the booking type. */
const TYPE_COPY: Record<
  BookingType,
  { pickup: string; destination: string; cta: string; hint: string; list: string }
> = {
  ride: {
    pickup: "Pickup",
    destination: "Destination",
    cta: "Request Fetch",
    hint: "A rider takes you from pickup to destination.",
    list: "",
  },
  pabili: {
    pickup: "Buy from",
    destination: "Deliver to",
    cta: "Request pabili",
    hint: "A rider buys your list at the store and brings it to you.",
    list: "What to buy",
  },
  padala: {
    pickup: "Pick up from",
    destination: "Deliver to",
    cta: "Request padala",
    hint: "A rider picks up your item and delivers it to someone else.",
    list: "What to pick up",
  },
};

const TYPE_LABEL: Record<BookingType, string> = {
  ride: "Ride",
  pabili: "Pabili",
  // From the shared helper rather than a second literal: this is the word a
  // commuter uses for the service, and the history chip and the rider screens
  // read the same one.
  padala: serviceLabel("padala", "commuter"),
};

/** Heading for the booking form, so it names the service being asked for. */
const TYPE_TITLE: Record<BookingType, string> = {
  ride: "Book a ride",
  pabili: "Order pabili",
  padala: "Send a pasugo",
};

/** Suggested names when saving a place — "Home" is the common one. */
const QUICK_LABELS = ["Home", "Work", "Market", "School"];

/** Icon per saved place, so Home and Work read at a glance. */
/**
 * One choice on the booking screen: a row you tap to go and change.
 *
 * A summary, not an input. It used to be a search field with the address in it,
 * which meant the booking screen offered three ways to do one job — type, tap
 * the map, drag the pin — and all three were fiddly on a phone. Now the row
 * says where each end is and the whole screen opens to change it, which is the
 * flow a commuter can describe in one sentence: set the pickup, set the
 * destination, check the fare.
 *
 * Led by an icon rather than a number. The steps were decoration: nobody
 * arrives at "destination" without having set a pickup, and a circled 2 next to
 * a second row made a two-choice screen look like the middle of a wizard. What
 * each row actually needs to be told apart by is which *kind* of place it is —
 * where the rider meets you, versus where they drop you off — and that is what
 * the icons and the two tones carry.
 */
function EndRow({
  icon,
  label,
  value,
  onClick,
  tone = "default",
  busy,
}: {
  icon: React.ReactNode;
  label: string;
  /** Omitted for a row that does not report a value, like "use my location". */
  value?: string;
  onClick: () => void;
  /**
   * `accent` for the pickup — the end the app can fill in for you — so the two
   * ends read as different at a glance rather than as two identical rows.
   */
  tone?: "default" | "accent";
  /** Spins the icon and blocks a second press while the GPS is working. */
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-2xl border bg-card px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "accent"
          ? "border-fetch-red/25 bg-fetch-red/[0.04]"
          : "border-border hover:bg-secondary/40",
        busy && "cursor-progress opacity-70",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          tone === "accent"
            ? "bg-fetch-red/10 text-fetch-red"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight tracking-tight">
          {label}
        </span>
        {value === undefined ? null : (
          <span
            className={cn(
              "mt-0.5 block truncate text-[13px] leading-tight",
              !value && "text-muted-foreground",
            )}
          >
            {value ?? "Tap to set"}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function savedPlaceIcon(label: string) {
  const key = label.trim().toLowerCase();
  if (key === "home") return <Home className="size-3.5" />;
  if (key === "work" || key === "school") return <Briefcase className="size-3.5" />;
  return <MapPinned className="size-3.5" />;
}



export default function CommuterHome() {
  const profile = useQuery(api.profiles.getMyProfile);
  const { isAdmin: isOwnerAdmin } = useOwnerAdmin();
  const tariff = useQuery(api.tariffs.getActiveTariff);
  const savedPlaces = useQuery(api.savedPlaces.listMine);
  const savePlace = useMutation(api.savedPlaces.savePlace);
  const removePlace = useMutation(api.savedPlaces.removePlace);
  const active = useQuery(api.rides.getActiveRide);
  const requestRide = useMutation(api.rides.requestRide);
  const cancelRide = useMutation(api.rides.cancelRide);
  /**
   * Live demand pricing.
   *
   * Read from the server rather than guessed on the client: the same ratio of
   * open requests to online riders is what `requestRide` will apply, so the
   * surge line on the breakdown is a number the commuter has actually been
   * shown before it was charged, not an estimate that may have moved. While it
   * is still loading the multiplier is 1 — quoting a surge we cannot prove
   * would be worse than quoting none, and the server's own value wins anyway.
   */
  const surge = useQuery(api.rides.getSurge);

  // One fix for the session — see `useCurrentLocation`. This screen used to run
  // its own geolocation request, which meant the pickup here and the pickup on
  // the location screens were two separate readings of the same person and
  // could disagree by more than a street.
  //
  // The browser is asked here rather than at app load: opening the booking is
  // the moment the answer is needed, and a prompt tied to that gesture is one
  // the commuter can answer instead of dismissing it against a page that has
  // not asked for anything yet.
  const here = useCurrentLocationContext();
  useAutoDetectOnBooking(here);
  const navigate = useNavigate();
  // The service and both ends of the trip live in the URL, so this has to be
  // read before the point state below: the home hub hands a destination over
  // here (a search result, a saved place, or a repeated trip that carries its
  // pickup too), and the form should open with them already pinned instead of
  // making the commuter hunt for them a second time. The parsing rules live in
  // `readBookingPrefill` so the writer and this reader cannot drift apart.
  const [searchParams, setSearchParams] = useSearchParams();
  const prefill = readBookingPrefill(searchParams);
  const [pickup, setPickup] = useState<Point | null>(prefill.pickup);
  const [destination, setDestination] = useState<Point | null>(
    prefill.destination,
  );
  // Start on the drop-off when it was handed to us, otherwise on the pickup so
  // the first map tap still works without a GPS fix.
  const [target, setTarget] = useState<Target>(
    prefill.destination ? "destination" : "pickup",
  );
  // Open on the trip the commuter was sent here for, not on Bukidnon's middle.
  const [center, setCenter] = useState<LatLng>(
    prefill.destination ?? prefill.pickup ?? FALLBACK_CENTER,
  );

  /**
   * Where the camera should look, given a point it wants to centre on.
   *
   * A GPS fix can land anywhere — someone opening FETCH in Davao City, a cached
   * fix from last month's trip. Centring there flies the map off the province
   * and shows a stretch of road where no rider will ever come, which is the
   * least useful thing this screen could do with a location.
   *
   * So: inside the province, centre on it. Outside it, centre on the nearest
   * city we actually cover — which is what the commuter needs to see, because
   * that is where the riders are and where they are about to be redirected. The
   * pickup itself is left where the GPS put it, untouched; the card below the
   * map already explains that no rider serves that pickup yet.
   */
  const focusCamera = (point: LatLng): number => {
    if (isInRegion(point)) {
      setCenter(point);
      return CURRENT_LOCATION_ZOOM;
    }
    const nearest = nearestLiveCity(point);
    setCenter(nearest ? { lat: nearest.lat, lng: nearest.lng } : FALLBACK_CENTER);
    // Wider than the "here is my gate" zoom the in-region case uses: a city
    // seen from a distance is meant to be read as a whole, not as a street.
    return 11;
  };
  /**
   * Map zoom, as state rather than a literal.
   *
   * It was hardcoded at 14, which is a good "here is the city" zoom and a
   * useless "here is my gate" zoom. A GPS-seeded pickup now opens at 15 so the
   * commuter can see the pin against the road they are standing on without
   * having to pinch first; everything else keeps the wider default.
   */
  const [zoom, setZoom] = useState(14);
  const [busy, setBusy] = useState(false);
  // The service is in the URL, not in state: every service card on the home hub
  // links here, and a URL is the only thing that survives a refresh, a shared
  // link, or the back button. An unrecognised or absent value falls back to a
  // plain ride rather than showing an empty form.
  const requestedType = searchParams.get("type");
  const bookingType = resolveBookingType(requestedType);
  const setBookingType = (type: BookingType) => {
    // Changing service invalidates a confirmed pin: "this pin is right" was
    // said about the store, not about the drop-off. Doing it here rather than
    // in a per-tab callback keeps the tab list a plain constant.
    if (type !== bookingType) setStorePinConfirmed(false);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("type", type);
        return next;
      },
      { replace: true },
    );
  };
  const [items, setItems] = useState<{ name: string; qty: number }[]>([]);  const [itemDraft, setItemDraft] = useState({ name: "", qty: "1" });
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  // "Book for later". Empty is off; "soon" is the one-hour default, and
  // anything else is a datetime-local value straight from the input.
  const [scheduleFor, setScheduleFor] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  /**
   * Who is riding. Defaults to "self" because that is what every booking has
   * meant until now, so an unchanged screen books exactly what it used to.
   *
   * Held as one object rather than three separate pieces of state so "self" and
   * "other" cannot drift apart — switching back to "self" keeps the typed
   * passenger on the side rather than discarding it.
   */
  const [whoIsRiding, setWhoIsRiding] = useState<WhoIsRidingValue>({
    passengerType: "self",
    passengerName: "",
    passengerPhone: "",
  });
  /**
   * Set once the commuter acknowledges that a pasugo pin sits almost on top of
   * the drop-off. Any change to either point clears it again.
   */
  const [storePinConfirmed, setStorePinConfirmed] = useState(false);
  /**
   * The vehicle class the commuter picked.
   *
   * State, not a URL parameter, because it survives a fare recalculation but
   * not a navigation — and a passenger who chose a van for a barkada trip to
   * Valencia is choosing it for that trip, not as a standing preference the
   * app should silently apply to a pabili run to the market next week.
   */
  /**
 * The vehicle this screen books.
 *
 * There is only one: every FETCH rider is on a motorcycle. It is stated here
 * rather than read from a picker because removing the picker without this
 * would have quietly fallen back to `DEFAULT_RIDE_TYPE`, which is a *tricycle* —
 * so a screen with no vehicle choice would still have priced every ride as one.
 * The fare, the ETA and the request all read this, so they cannot disagree.
 */
const BOOKING_RIDE_TYPE: RideType = "motorcycle";
  const [receiptId, setReceiptId] = useState<Id<"rides"> | null>(null);
  /**
   * The ride just created, for the confirmation sheet.
   *
   * A separate id from `receiptId` on purpose: the receipt is a *past* trip's
   * breakdown shown after completion, and overwriting it with the ride that was
   * just requested would swap a finished receipt for a live one the moment a
   * commuter opened their history.
   */
  const [bookedRideId, setBookedRideId] = useState<Id<"rides"> | null>(null);
  /**
   * Which geometry priced the ride that was just booked.
   *
   * Recorded at the moment of booking rather than recomputed afterwards: once
   * the destination is cleared there is nothing left to recompute it from, and
   * the confirmation would otherwise have to guess whether the distance it is
   * showing came from the road or from the fallback.
   */
  const [bookedSource, setBookedSource] = useState<"road" | "straight">("straight");
  /**
   * Which pin's address card is open over the map, or null.
   *
   * A tap on a pin should tell the commuter where that pin is before it sends
   * them somewhere else. `target` already decides which end the drag pin
   * represents; this is the read-only version of the same fact, so tapping a
   * pin both selects it *and* opens its card.
   */
  const [popupEnd, setPopupEnd] = useState<Target | null>(null);
  /**
   * The ride whose three points have already been framed on the map.
   *
   * Declared here with the rest of the state because the route guards below
   * return early, and a hook after an early return is a hook that sometimes does
   * not run. The framing itself happens further down, during render — see the
   * note there for why.
   */
  const [framedRideId, setFramedRideId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const previousRideId = useRef<string | null>(null);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  const receipt = useQuery(
    api.rides.getRide,
    receiptId ? { rideId: receiptId } : "skip",
  );

  const booked = useQuery(
    api.rides.getRide,
    bookedRideId ? { rideId: bookedRideId } : "skip",
  );

  // GPS: seed pickup and the map center from the first fix of the session, so
  // an ordinary booking never has to touch the map to begin. Adjusting state
  // during render (React's documented alternative to a sync effect) keeps this
  // in lockstep with the fix without an extra commit.
  //
  // The address is left as a placeholder here and swapped for the real one on
  // the render below, the moment the shared fix has resolved it — so the common
  // case shows a street immediately rather than "Current location" flashing and
  // then being replaced.
  const [seededFix, setSeededFix] = useState<LatLng | null>(null);
  if (
    here.coords &&
    (seededFix?.lat !== here.coords.lat || seededFix?.lng !== here.coords.lng)
  ) {
    const { lat, lng } = here.coords;
    setSeededFix({ lat, lng });
    setZoom(focusCamera({ lat, lng }));
    if (!pickup) {
      // The placeholder is deliberate: the address for this point is already
      // being resolved by the shared fix, and the swap below reads it the
      // moment it lands. Resolving it here instead would mean asking the
      // geocoder a second time for coordinates already described once.
      setPickup({ lat, lng, address: PENDING_ADDRESS });
      // First fix of the session: pickup is filled, so move on to the drop-off.
      setTarget("destination");
    }
  }

  /**
   * The pickup as the rest of the screen should see it.
   *
   * The placeholder is swapped for the real address during render, the same way
   * the fix itself seeds the pickup just above — React's documented alternative
   * to a sync effect. Not for style: an effect that wrote state back would show
   * "Current location" in the row for a frame after the map had already moved,
   * and the write-back would be exactly the cascading-render pattern the
   * compiler rule exists to prevent.
   *
   * Only the placeholder is ever replaced. A label the commuter chose — a search
   * result, a saved place, a dragged pin — is never second-guessed by a
   * geocoder, and `isSamePlace` stops a label resolved for an *older* fix being
   * applied to a newer one.
   */
  if (
    pickup !== null &&
    pickup.address === PENDING_ADDRESS &&
    here.address !== null &&
    isSamePlace(pickup, here.coords)
  ) {
    setPickup({ ...pickup, address: here.address });
  }

  /**
   * "Use current location": ask the browser again and set the pickup to it.
   *
   * A *new* reading, not the cached one. The whole reason to press this is that
   * you have moved since the app opened — you stepped out of the building, you
   * walked to the gate — so reusing the old fix would re-confirm where you
   * used to be.
   *
   * The address is left as the placeholder so the swap above fills it once the
   * geocoder answers; writing the address here would mean either showing the
   * previous street against the new pin, or blocking the button on a network
   * round trip.
   */
  const handleUseCurrentLocation = async () => {
    const fix = await here.refresh();
    if (!fix) return;
    setZoom(focusCamera({ lat: fix.lat, lng: fix.lng }));
    setStorePinConfirmed(false);
    setPickup({
      lat: fix.lat,
      lng: fix.lng,
      address: PENDING_ADDRESS,
    });
  };

  // When the live ride ends, keep the finished ride around as a receipt.
  useEffect(() => {
    if (active === undefined) return;
    if (active === null) {
      if (previousRideId.current) {
        setReceiptId(previousRideId.current as Id<"rides">);
        previousRideId.current = null;
      }
      return;
    }
    previousRideId.current = active.ride._id as string;
    setReceiptId(null);
  }, [active]);

  /** Every way of setting a place goes through here: a pin dropped on the map,
   *  a search result, or a quick town. */
  const applyPlace = useCallback(
    (which: Target, point: LatLng, address: string) => {
      setCenter({ lat: point.lat, lng: point.lng });
      setStorePinConfirmed(false);
      if (which === "pickup") {
        setPickup({ ...point, address });
        setTarget("destination");
      } else {
        setDestination({ ...point, address });
      }
    },
    [],
  );

  /** Swap the two ends. Return trips are the usual reason for this. */
  const swapEnds = useCallback(() => {
    setPickup(destination);
    setDestination(pickup);
    setStorePinConfirmed(false);
  }, [destination, pickup]);

  /**
   * Destinations this device has been to before.
   *
   * Kept on the device rather than in Convex on purpose: it is a keyboard
   * shortcut for *this* commuter on *this* phone, not a record about a person
   * that their rider or the console has any business seeing, and it is useful
   * before there is a session to sync it to.
   */
  const recents = useRecentDestinations();

  /**
   * Show what just changed after an explicit pick.
   *
   * On a phone the map sits above the form and a pick is made from inside the
   * form, so the pin the commuter just chose is off-screen. Rather than let the
   * fare appearing push the column around and leave the route invisible, ease a
   * phone up to the map. From sm up the map is already beside or above the pick
   * in the same viewport, so nothing needs to move. `nearest` scrolls as little
   * as possible — this nudges, it does not yank.
   */
  const scrollMapIntoViewOnMobile = useCallback(() => {
    if (typeof window === "undefined" || window.innerWidth >= 640) return;
    setTimeout(
      () =>
        mapWrapRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      80,
    );
  }, []);

  /**
   * A destination chosen by typing or tapping a recent.
   *
   * Both go through `applyPlace`, so a search result and a dragged pin end up
   * in exactly the same state — there is no second way for a destination to be
   * set that the fare, the route and the booking request have not heard of.
   */
  const chooseDestination = useCallback(
    (point: LatLng, label: string) => {
      applyPlace("destination", point, label);
      recents.remember({ label, lat: point.lat, lng: point.lng });
      scrollMapIntoViewOnMobile();
    },
    [applyPlace, recents, scrollMapIntoViewOnMobile],
  );

/**
   * Hand the trip over to the screen that owns this end.
   *
   * Tapping a field or the map used to edit the place in place. It does not
   * any more: picking a location is its own screen now (see SetLocation), with
   * the map full-bleed behind a sheet that says the address in words. What is
   * left on this screen is the review — both ends, the fare, the request.
   *
   * The whole booking travels in the query string, so the trip type and the
   * other end are still there when Next comes back.
   */
  const openStep = useCallback(
    (which: Target) => navigate(locationStepUrl(which, searchParams)),
    [navigate, searchParams],
  );

  /** A tap on the map is a request to change the active end, not a pin drop. */
  const handlePick = useCallback(() => {
    if (active?.ride) return;
    openStep(target);
  }, [active?.ride, target, openStep]);

  /* ── Interactive pinning ───────────────────────────────────────────────────
     The active end is a draggable pin right here on the booking map, rather
     than something that can only be moved on another screen. A commuter who
     can see the pin is two metres off their gate should be able to move it two
     metres, not be told to go and re-pick the whole address. */

  /**
   * The end the drag pin represents — the one the commuter last chose to edit.
   *
   * Null while a ride is live: the ends of a booked ride are facts, not
   * suggestions, so dragging them would be a request to change a trip that
   * another person is already driving.
   */
  const dragPoint: Point | null = active?.ride
    ? null
    : target === "pickup"
      ? pickup
      : destination;

  /**
   * Write a resolved address back onto whichever end it belongs to.
   *
   * Matching on the coordinates rather than on `target` is what makes this
   * safe: the geocode lands some time after the pin was released, and by then
   * the commuter may have switched to the other end. A label is only written
   * onto the point that actually produced it.
   */
  const handleGeocoded = useCallback((at: LatLng, address: string) => {
    setStorePinConfirmed(false);
    setPickup((prev) =>
      prev && prev.lat === at.lat && prev.lng === at.lng
        ? { ...prev, address }
        : prev,
    );
    setDestination((prev) =>
      prev && prev.lat === at.lat && prev.lng === at.lng
        ? { ...prev, address }
        : prev,
    );
  }, []);

  /**
   * Move the active pin, live, as the finger moves.
   *
   * The existing address is carried across so the label does not blank on the
   * first frame of a drag; `useReverseGeocode` replaces it with the resolved
   * one once the pin settles. Nothing here is server-side: until the ride is
   * booked, a pin is a suggestion and a suggestion is free to change.
   */
  const handleDragPoint = useCallback(
    (which: Target, point: LatLng) => {
      setStorePinConfirmed(false);
      setPopupEnd(which);
      const move = (prev: Point | null) =>
        prev ? { ...point, address: prev.address } : { ...point };
      if (which === "pickup") setPickup(move);
      else setDestination(move);
    },
    [],
  );

  const handleDragPointChange = useCallback(
    (point: LatLng) => handleDragPoint(target, point),
    [handleDragPoint, target],
  );
  const handleDragPointEnd = useCallback(
    (point: LatLng) => handleDragPoint(target, point),
    [handleDragPoint, target],
  );

  /**
   * The drag pin's address, looked up once it settles.
   *
   * Debounced and distance-gated inside the hook: a drag emits a coordinate
   * per pointer frame, and reverse geocoding each of those would spend the
   * commuter's quota in one gesture. `resolving` is what the map shows while
   * the lookup is in flight.
   */
  const geocoded = useReverseGeocode(dragPoint, handleGeocoded);

  /**
   * A tap on a pin selects that end and opens its address card.
   *
   * Selecting matters as much as the card: after this the pin becomes the
   * draggable one, so tapping the pin you want to move and then moving it is
   * one gesture rather than two.
   */
  const handleMarkerClick = (marker: MapMarker) => {
    if (marker.id !== "pickup" && marker.id !== "destination") return;
    const end = marker.id as Target;
    setTarget(end);
    setPopupEnd(end);
  };

  // Saved places ("Home", "Work") — the point a repeat booking reuses. The
  // active field decides what gets saved; pickup is the fallback so a rider
  // can save their location right after GPS fills it in.
  const saveablePoint =
    (target === "pickup" ? pickup : destination) ?? pickup;

  const openSaveSheet = () => {
    const hasHome = savedPlaces?.some(
      (place) => place.label.toLowerCase() === "home",
    );
    setSaveLabel(target === "pickup" && !hasHome ? "Home" : "");
    setSaveOpen(true);
  };

  const handleSavePlace = async () => {
    const label = saveLabel.trim();
    if (!saveablePoint || !label) return;
    setSaveBusy(true);
    try {
      await savePlace({
        label,
        lat: saveablePoint.lat,
        lng: saveablePoint.lng,
        address: saveablePoint.address,
      });
      setSaveOpen(false);
      setSaveLabel("");
      toast.success(`${label} saved`, {
        description: "Tap it next time to set that point instantly.",
      });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaveBusy(false);
    }
  };

  const handleRemovePlace = async (placeId: string) => {
    try {
      await removePlace({ placeId: placeId as Id<"savedPlaces"> });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  const liveTariff = tariff ?? { id: null, ...DEFAULT_TARIFF };
  /**
   * The distance the fare is priced on.
   *
   * The road route the map drew, when there is one: a Malaybalay → Valencia
   * trip on the highway is about a third longer than the line between the two
   * pins, and a fare quoted on the straight line underpays the rider for the
   * fuel they burn. The straight line is only the fallback for "no route yet"
   * — while the first fetch is in flight, or with no routing provider
   * configured — and the UI says which one it is showing, because a commuter
   * told "3.2 km" deserves to know whether that is a road or a guess.
   */
  const road = useRoadDistance(pickup, destination);
  const hasRoute = Boolean(pickup && destination);
  const distanceKm = road.roadKm ?? road.straightKm;
  const distanceSource: "road" | "straight" =
    road.roadKm != null ? "road" : "straight";
  const isErrandType = bookingType !== "ride";
  // Surge the client can quote. 1 while the query is in flight — see the note
  // on `surge` above.
  const surgeMultiplier = surge?.multiplier ?? 1;

  /**
   * One breakdown per ride type, on the same tariff, distance and surge.
   *
   * `fareBreakdown` is the *same* pure function `requestRide` calls, so each
   * figure on a card is what the server will charge for that vehicle, and the
   * selected card's total and the total in the breakdown below cannot disagree.
   * Null until both ends are pinned, because a minimum fare for a trip that
   * does not exist yet is a quote for nothing.
   */
  const breakdown = hasRoute
    ? fareBreakdown({
        distanceKm,
        rideType: BOOKING_RIDE_TYPE,
        tariff: liveTariff,
        surgeMultiplier,
        isErrand: isErrandType,
      })
    : null;
  // Shown next to the fare, derived from the same distance and the same
  // vehicle the fare is priced on, so the two can never tell different stories
  // about the same trip. A van is slower than a motorcycle: the ETA is the
  // selected vehicle's ETA, not a fleet-wide average.
  const etaMinutes = breakdown?.etaMinutes ?? 0;
  const estimatedFare = breakdown?.total ?? null;

  /**
   * What is wrong with the passenger details, if anything.
   *
   * Empty for "self" by construction — there is nothing to get wrong when the
   * passenger is the authenticated commuter and the server reads their details
   * out of their own profile.
   */
  const passengerErrors = validatePassenger(whoIsRiding);

  /**
   * The line the booker is told when a rider takes the job.
   *
   * Derived from the ride rather than from the form, so it is the passenger the
   * server actually stored. "Your ride is confirmed." answers the wrong
   * question when the person waiting at the pickup is somebody else, so the
   * passenger is named.
   */

  /**
   * A pasugo pin this close to the drop-off is almost always the nearest
   * landmark rather than the shop, so it needs an explicit confirmation before
   * the request goes through. The server enforces the same threshold.
   */
  const storePinLooksNear =
    isErrandType && distanceKm > 0 && distanceKm < NEAR_STORE_KM;

  const isErrand = bookingType !== "ride";
  const copy = TYPE_COPY[bookingType];
  const budgetNum = Number.parseFloat(budget);
  const hasBudget = Number.isFinite(budgetNum) && budgetNum > 0;
  const totalToPrepare = (estimatedFare ?? 0) + (hasBudget ? budgetNum : 0);

  // "Now", read once for the whole screen. The schedule labels are "Today 5:30
  // PM" strings: a clock read afresh on every render would mean the same dialog
  // could show two different days, which is a bug rather than a live clock.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // The chosen pickup time, or null for "now". A datetime-local string parses
  // in the browser's own zone, which is the zone the commuter meant.
  const scheduledAt = scheduleFor
    ? normalizeScheduledFor(
        scheduleFor === "soon" ? soonValue() : scheduleFor,
        now,
      )
    : null;

  const addItem = () => {
    const name = itemDraft.name.trim();
    if (!name) return;
    const qty = Math.max(1, Math.min(99, Math.floor(Number(itemDraft.qty) || 1)));
    setItems((prev) =>
      prev.length >= 20 ? prev : [...prev, { name: name.slice(0, 80), qty }],
    );
    setItemDraft({ name: "", qty: "1" });
  };

  const handleRequest = async () => {
    if (!pickup || !destination) return;
    if (Object.keys(passengerErrors).length > 0) return;
    setBusy(true);
    try {
      const rideId = await requestRide({
        pickup: { lat: pickup.lat, lng: pickup.lng, address: pickup.address },
        destination: {
          lat: destination.lat,
          lng: destination.lng,
          address: destination.address,
        },
        bookingType,
        items: bookingType === "padala" ? items : undefined,
        itemBudget: isErrand && hasBudget ? budgetNum : undefined,
        notes: isErrand ? notes.trim() || undefined : undefined,
        recipientName:
          isErrand && recipientName.trim() ? recipientName.trim() : undefined,
        recipientPhone:
          isErrand && recipientPhone.trim() ? recipientPhone.trim() : undefined,
        storePinConfirmed: isErrand ? storePinConfirmed : undefined,
        // The vehicle, which is the only one there is. Priced by the
        // same `fareBreakdown` that drew the fare below it, so the
        // quote and the request cannot describe different vehicles.
        rideType: BOOKING_RIDE_TYPE,
        // The road distance they were shown, so the rider is paid for the road
        // actually driven. It is a *claim*: the server re-derives the straight
        // line from the two pins and accepts this only inside a band the
        // geometry proves, so a tampered body cannot buy a cheaper fare.
        routeDistanceKm: road.roadKm ?? undefined,
        // A time we cannot honour is dropped to "now" here and again on the
        // server, so the toast below never promises a pickup that will not
        // happen.
        scheduledFor: scheduledAt ?? undefined,
        // Who is riding. Only the two fields are sent, and only for "other":
        // for "self" the server reads the passenger out of the authenticated
        // profile and ignores anything a client sends here, so a tampered body
        // cannot put somebody else's number on the rider's screen.
        passengerType: whoIsRiding.passengerType,
        passengerName:
          whoIsRiding.passengerType === "other"
            ? whoIsRiding.passengerName.trim()
            : undefined,
        passengerPhone:
          whoIsRiding.passengerType === "other"
            ? whoIsRiding.passengerPhone.trim()
            : undefined,
      });
      setDestination(null);
      setTarget("destination");
      setItems([]);
      setItemDraft({ name: "", qty: "1" });
      setBudget("");
      setNotes("");
      setRecipientName("");
      setRecipientPhone("");
      setStorePinConfirmed(false);
      setScheduleFor("");
      // Back to "self" for the next booking: the passenger who rode this ride
      // is not the passenger on the next one, and a leftover name on a screen
      // that defaults to "myself" would be a booking nobody asked for.
      setWhoIsRiding({ passengerType: "self", passengerName: "", passengerPhone: "" });
      // Read back from the server rather than echoed from local state: the
      // confirmation has to show the fare that was actually stored, including
      // any surge that moved between the quote and the tap.
      setBookedSource(distanceSource);
      setBookedRideId(rideId);
      toast.success(
        isErrand
          ? `${TYPE_LABEL[bookingType]} request sent`
          : "Ride requested",
        {
          description: scheduledAt
            ? `Looking for a rider around ${scheduleLabel(scheduledAt, now)}.`
            : isErrand
              ? "Looking for a rider to run your errand."
              : "Looking for an available rider near you.",
        },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (rideId: string) => {
    try {
      await cancelRide({ rideId: rideId as Id<"rides">, reason: "Changed plans" });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  // ---- route guards -------------------------------------------------------
  if (profile === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (profile === null) return <Navigate to="/onboarding" replace />;
  // Owner by address, not just by profile role: a stale riding profile must not
  // be able to pull the owner out of the console.
  if (isOwnerAdmin || profile.role !== "commuter") {
    return (
      <Navigate
        to={
          isOwnerAdmin || profile.role === "admin"
            ? "/admin"
            : "/rider"
        }
        replace
      />
    );
  }

  // ---- map state ----------------------------------------------------------
  const liveRide = active?.ride ?? null;

  /**
   * The line the booker is told about the trip they just made.
   *
   * Derived from the stored ride rather than from the form, so it names the
   * passenger the server actually recorded — not whatever was typed a moment
   * ago. "Your ride is confirmed." answers the wrong question when the person
   * waiting at the pickup is somebody else, so the passenger is named.
   */
  const acceptanceCopy = !active?.passenger
    ? null
    : active.passenger.isBooker
      ? "Your ride is confirmed."
      : `Your ride is booked for ${active.passenger.name}.`;
  const riderLocation = active?.riderLocation ?? null;
  const markers: MapMarker[] = [];

  if (liveRide) {
    markers.push({
      id: "pickup",
      lat: liveRide.pickup.lat,
      lng: liveRide.pickup.lng,
      kind: "pickup",
      label: "Pickup",
    });
    markers.push({
      id: "destination",
      lat: liveRide.destination.lat,
      lng: liveRide.destination.lng,
      kind: "destination",
      label: "Destination",
    });
    if (riderLocation) {
      markers.push({
        id: "rider",
        lat: riderLocation.lat,
        lng: riderLocation.lng,
        kind: "rider",
        label: active?.counterparty?.name ?? "Rider",
        // The car points where the rider is pointing. Absent when the device
        // has no compass, and then the marker simply does not rotate.
        heading: riderLocation.heading,
      });
    }
  } else {
    // Where the commuter is, as the blue dot — drawn whenever a fix exists,
    // including under the pickup pin.
    //
    // It used to stand down whenever the pin sat on the fix ("two dots on one
    // point"), which meant the ordinary case — pickup seeded from GPS — never
    // showed it at all, and a commuter had no way to tell "the map found me"
    // from "the map is parked on the city default". The pin answers "where will
    // the rider be picked up"; the dot answers "where am I", and those are
    // different questions even when the answers are the same place. Pushed
    // first, so the pin renders on top and the halo reads around it.
    if (here.coords) {
      markers.push({
        id: "here",
        lat: here.coords.lat,
        lng: here.coords.lng,
        kind: "current",
      });
    }
    // The end currently being edited is drawn as the draggable teardrop pin
    // instead, so it is skipped here — otherwise both render on top of each
    // other and it looks like a rendering glitch.
    if (pickup && target !== "pickup") {
      markers.push({
        id: "pickup",
        lat: pickup.lat,
        lng: pickup.lng,
        kind: "pickup",
        label: "Pickup",
      });
    }
    if (destination && target !== "destination") {
      markers.push({
        id: "destination",
        lat: destination.lat,
        lng: destination.lng,
        kind: "destination",
        label: "Destination",
      });
    }
  }

  const route: [LatLng, LatLng][] = liveRide
    ? riderLocation
      ? // Two legs, drawn as two roads: the rider's approach to the pickup, and
        // the trip itself. Routing them as one line would run the road straight
        // from the car to the destination and ignore the pickup entirely.
        [
          [
            { lat: riderLocation.lat, lng: riderLocation.lng },
            { lat: liveRide.pickup.lat, lng: liveRide.pickup.lng },
          ],
          [
            { lat: liveRide.pickup.lat, lng: liveRide.pickup.lng },
            { lat: liveRide.destination.lat, lng: liveRide.destination.lng },
          ],
        ]
      : [
          [
            { lat: liveRide.pickup.lat, lng: liveRide.pickup.lng },
            { lat: liveRide.destination.lat, lng: liveRide.destination.lng },
          ],
        ]
    : pickup && destination
      ? [
          [
            { lat: pickup.lat, lng: pickup.lng },
            { lat: destination.lat, lng: destination.lng },
          ],
        ]
      : [];

  /**
   * The camera frames the rider, the pickup and the drop-off together, once.
   *
   * Set during render rather than in an effect, which is React's documented way
   * to adjust state from a value derived during render: the camera has to move
   * in the same commit that first has all three points to frame, and an effect
   * would show one frame of the old camera. It is keyed on the ride, so the
   * camera frames each new ride once and is then the commuter's to move — a
   * camera that re-framed itself every time the rider moved would be
   * impossible to pan.
   */
  if (
    liveRide &&
    riderLocation &&
    active?.counterparty &&
    framedRideId !== liveRide._id
  ) {
    const frame = fitPoints([
      riderLocation,
      liveRide.pickup,
      liveRide.destination,
    ]);
    if (frame) {
      setFramedRideId(liveRide._id);
      setCenter(frame.center);
      setZoom(frame.zoom);
    }
  }

  /**
   * How long until the rider reaches the pickup.
   *
   * Recomputed from the live position on every fix, which is the whole point:
   * an ETA that is only correct when the ride was booked tells the commuter
   * nothing while they stand on the street waiting. Straight-line and a fleet
   * average speed, so it is an estimate and is labelled as minutes rather than
   * a clock time it cannot promise.
   */
  const riderApproachingMinutes =
    liveRide && riderLocation && liveRide.status !== "SEARCHING"
      ? Math.max(
          1,
          Math.ceil(
            (haversineKm(riderLocation, liveRide.pickup) /
              AVERAGE_SPEED_KMH) *
              60,
          ),
        )
      : 0;

  const showReceipt =
    !liveRide &&
    receipt &&
    (receipt.ride.status === "COMPLETED" || receipt.ride.status === "CANCELLED");

  return (
    <AppShell bottomTabs={COMMUTER_TABS} bottomActiveKey="home">
      <div className="mx-auto grid w-full max-w-7xl gap-3 px-4 py-4 sm:gap-5 sm:px-5 sm:py-5 lg:grid-cols-[minmax(0,390px)_minmax(0,1fr)] lg:gap-6 lg:py-6">
        {/* Panel */}
        {/* On a phone the panel is a sheet that rides up over the map, the way a
            native booking app does it; from sm up it is a plain column again. */}
        <div className="order-2 relative z-10 -mt-4 rounded-t-3xl bg-background px-4 pb-2 pt-4 shadow-[0_-10px_30px_-14px_rgba(0,0,0,0.3)] sm:mt-0 sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none lg:order-1">
          {/*
            GPS could not do its job. Says what happened and, more importantly,
            what to do instead — the booking below still works with a typed or
            tapped pickup, and refusing the screen here would be worse than an
            approximate answer.

            The refresh button lives inside this card rather than on the map,
            because this is the state where a person is actually worried about
            their location; buried under a crosshair it would go unread.
        */}              {here.notice ? (
            <div className="mb-3 rounded-lg border border-border bg-card px-3.5 py-3">
              <div className="flex gap-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-2">
                  <p className="text-xs leading-5 text-muted-foreground">
                    {here.notice}
                  </p>
                  {canRetry(here.status) ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      disabled={here.detecting}
                      onClick={() => void here.refresh()}
                    >
                      {here.detecting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
<Crosshair className="size-3.5" />
                      )}
                      Try again
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Honest about the two cities without blocking the request. A
              commuter outside them is usually somebody whose barangay is a
              twenty-minute ride past the edge of a radius, and refusing the
              request would be worse than telling them the truth and letting
              them decide. */}
          {pickup && !isInServiceArea(pickup) ? (
            <div className="mb-3 flex gap-3 rounded-lg border border-fetch-gold bg-fetch-gold/25 px-3.5 py-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-fetch-ink" />
              <p className="text-xs leading-5 text-foreground">
                This pickup is outside our service area. Riders are on the road
                in {LIVE_CITY_NAMES.join(" and ")} right now — you can still
                request, but it may take longer to find one.
              </p>
            </div>
          ) : null}

          {liveRide ? (
            <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {liveRide.code}
                </p>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
                  {STATUS_LABEL[liveRide.status]}
                </span>
              </div>

              {liveRide.status === "SEARCHING" ? (
                <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-border px-3.5 py-3.5">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium tracking-tight">
                      Finding your rider
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Nearby riders are being notified.
                    </p>
                  </div>
                </div>
              ) : active?.counterparty ? (
                <div className="mt-4 rounded-xl bg-muted/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    {/* The rider's own photo from their profile, so the person at
                        the kerb can be recognised before they are near enough to
                        call out to. Falls back to a tinted monogram rather than a
                        broken image: a rider with no photo is normal, and an
                        empty frame would look like a bug. */}
                    {active.counterparty.photoUrl ? (
                      <img
                        src={active.counterparty.photoUrl}
                        alt=""
                        className="size-11 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {initials(active.counterparty.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium tracking-tight">
                        {active.counterparty.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {"vehicle" in active.counterparty &&
                        active.counterparty.vehicle
                          ? `${active.counterparty.vehicle.color} ${active.counterparty.vehicle.make} ${active.counterparty.vehicle.model} · ${active.counterparty.vehicle.plate}`
                          : "Assigned rider"}
                      </p>
                      {"rating" in active.counterparty &&
                      active.counterparty.rating ? (
                        <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Star
                            className="size-3 fill-fetch-gold text-fetch-gold"
                            aria-hidden
                          />
                          <span className="font-medium text-foreground tabular-nums">
                            {active.counterparty.rating.avg.toFixed(1)}
                          </span>
                          <span>
                            ({active.counterparty.rating.count}{" "}
                            {active.counterparty.rating.count === 1
                              ? "trip"
                              : "trips"}
                            )
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Navigation className="size-4" />
                    </div>
                  </div>

                  {/* The live approach estimate, recomputed from every GPS fix.
                      It is the number a commuter standing on the kerb actually
                      wants, and it counts down rather than sitting at the value
                      it had when the ride was booked. */}
                  {riderApproachingMinutes > 0 ? (
                    <div className="mt-3 flex items-center gap-2 rounded-lg bg-background/70 px-3 py-2">
                      <Navigation className="size-3.5 shrink-0 text-primary" />
                      <p className="text-xs tracking-tight">
                        Driver is{" "}
                        <span className="font-semibold tabular-nums">
                          {riderApproachingMinutes} min
                        </span>{" "}
                        away
                        <span className="text-muted-foreground">
                          {" · "}
                          {formatDistance(
                            haversineKm(riderLocation!, liveRide.pickup),
                          )}
                        </span>
                      </p>
                    </div>
                  ) : null}
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Contact rider</span>
                    <a
                      href={`tel:${active.counterparty.phone}`}
                      className="inline-flex items-center gap-1.5 text-foreground transition-colors hover:text-muted-foreground"
                    >
                      <Phone className="size-3.5" />
                      {active.counterparty.phone}
                    </a>
                  </div>
                  <div className="mt-4">
                    <RideChat
                      rideId={liveRide._id}
                      counterpartyName={active.counterparty?.name}
                    />
                  </div>
                </div>
              ) : null}

              {/* Safety, directly under the rider card rather than below the
                  timeline and the fare list. Somebody whose ride feels wrong is
                  not scrolling a breakdown to find the button that helps. */}
              <RideSafetyActions
                trip={{
                  code: liveRide.code,
                  service: TYPE_LABEL[liveRide.bookingType ?? "ride"],
                  status: STATUS_LABEL[liveRide.status] ?? liveRide.status,
                  // `shortAddress` rather than the raw field: an address is
                  // optional on the schema, and it already answers "Dropped
                  // pin" — which is the honest thing to tell somebody deciding
                  // whether to share where they are.
                  pickupAddress: shortAddress(liveRide.pickup.address),
                  destinationAddress: shortAddress(
                    liveRide.destination.address,
                  ),
                  fare: liveRide.fare,
                  scheduledFor: liveRide.scheduledFor,
                  plate:
                    active?.counterparty && "vehicle" in active.counterparty
                      ? active.counterparty.vehicle?.plate ?? null
                      : null,
                  riderName: active?.counterparty?.name ?? null,
                }}
                riderPhone={active?.counterparty?.phone ?? null}
                emergencyName={profile?.emergencyName ?? null}
                emergencyPhone={profile?.emergencyPhone ?? null}
              />

              {/*
                 Who this ride is for, stated once the ride exists.

                 The booker's own receipt of what they just paid for, and the
                 answer to "is this trip actually for me" when they booked for
                 somebody else. Derived from the stored ride, so it cannot
                 disagree with what the rider is about to see.
               */}
              {liveRide && liveRide.passengerType === "other" ? (
                <div className="mt-4 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <User className="size-3.5 text-muted-foreground" />
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Riding
                    </p>
                  </div>
                  <p className="mt-2 text-sm tracking-tight">
                    {acceptanceCopy}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your rider will meet {liveRide.passengerName} at the
                    pickup point.
                  </p>
                </div>
              ) : null}

              {liveRide.bookingType && liveRide.bookingType !== "ride" ? (
                <div className="mt-4 rounded-xl bg-muted/60 p-4">
                  <div className="flex items-center gap-2">
                    <ShoppingBasket className="size-3.5 text-muted-foreground" />
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {liveRide.bookingType === "pabili" ? "Pabili list" : "Pasugo"}
                    </p>
                  </div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {(liveRide.items ?? []).map((item, index) => (
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
                  {liveRide.notes ? (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {liveRide.notes}
                    </p>
                  ) : null}
                  {liveRide.recipientName ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Recipient: {liveRide.recipientName}
                      {liveRide.recipientPhone
                        ? ` · ${liveRide.recipientPhone}`
                        : ""}
                    </p>
                  ) : null}
                  {liveRide.itemBudget != null ? (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Budget you set: {formatPeso(liveRide.itemBudget)}
                    </p>
                  ) : null}
                  {liveRide.itemCostActual != null ? (
                    <p className="mt-3 text-sm font-medium tracking-tight">
                      Rider spent {formatPeso(liveRide.itemCostActual)} — prepare
                      this in cash.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <Separator className="my-4" />
              <RideTimeline status={liveRide.status} />

              <Separator className="my-4" />
              <dl className="space-y-2 text-sm">
                {/* The vehicle the commuter asked for, so a rider arriving in a
                    tricycle when a van was booked is caught before the trip
                    starts rather than argued about in the street. */}
                {liveRide.rideType ? (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Ride type</dt>
                    <dd className="tracking-tight">
                      {rideTypeSpec(liveRide.rideType).name}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Distance</dt>
                  <dd className="tracking-tight">
                    {formatDistance(liveRide.distanceKm)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">
                    {liveRide.bookingType && liveRide.bookingType !== "ride"
                      ? "Service fee"
                      : "Fare"}
                  </dt>
                  <dd className="font-medium tracking-tight">
                    {formatPeso(liveRide.fare)}
                  </dd>
                </div>
              </dl>

              {liveRide.storeConfirmedAt != null ? (
                <p className="mt-3 flex gap-2 text-[11px] leading-4 text-muted-foreground">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  Your rider corrected the store to{" "}
                  {shortAddress(liveRide.pickup.address)}
                  {liveRide.quotedFare != null &&
                  liveRide.quotedFare !== liveRide.fare
                    ? ` — the service fee moved from ${formatPeso(liveRide.quotedFare)} to ${formatPeso(liveRide.fare)}.`
                    : ". Your service fee is unchanged."}
                </p>
              ) : null}

              {liveRide.status !== "IN_PROGRESS" ? (
                <Button
                  variant="outline"
                  className="mt-5 w-full"
                  onClick={() => handleCancel(liveRide._id)}
                >
                  Cancel ride
                </Button>
              ) : (
                <p className="mt-5 text-xs leading-5 text-muted-foreground">
                  A ride in progress cannot be cancelled.
                </p>
              )}
            </section>
          ) : showReceipt && receipt ? (
            <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {receipt.ride.code}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                {receipt.ride.status === "COMPLETED"
                  ? "Ride completed"
                  : "Ride cancelled"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {receipt.ride.status === "COMPLETED"
                  ? "Thanks for riding with Fetch."
                  : "This ride was cancelled and you were not charged."}
              </p>

              <div className="mt-5 rounded-xl bg-muted/60 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {receipt.ride.status !== "COMPLETED"
                      ? "Fare"
                      : receipt.ride.bookingType &&
                          receipt.ride.bookingType !== "ride"
                        ? "Service fee"
                        : "Final fare"}
                  </span>
                  <span className="text-3xl font-semibold tracking-tight">
                    {receipt.ride.status === "COMPLETED"
                      ? formatPeso(receipt.ride.fare)
                      : "—"}
                  </span>
                </div>
                <Separator className="my-4" />
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Distance</dt>
                    <dd className="tracking-tight">
                      {formatDistance(receipt.ride.distanceKm)}
                    </dd>
                  </div>
                  {receipt.ride.itemCostActual != null ? (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Purchase</dt>
                      <dd className="tracking-tight">
                        {formatPeso(receipt.ride.itemCostActual)}
                      </dd>
                    </div>
                  ) : null}
                  {receipt.ride.itemCostActual != null ? (
                    <div className="flex justify-between font-medium">
                      <dt>Total paid</dt>
                      <dd className="tracking-tight">
                        {formatPeso(
                          receipt.ride.fare + receipt.ride.itemCostActual,
                        )}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">From</dt>
                    <dd className="max-w-[60%] truncate text-right tracking-tight">
                      {shortAddress(receipt.ride.pickup.address)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">To</dt>
                    <dd className="max-w-[60%] truncate text-right tracking-tight">
                      {shortAddress(receipt.ride.destination.address)}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* The stars, here as well as in History. They were only ever in
                  History, which meant rating a trip meant opening a list of past
                  trips and finding the right one — at the exact moment the rider
                  is still fresh in your mind and the fare is on screen. A
                  finished ride is the only place a rating belongs. */}
              {receipt.ride.status === "COMPLETED" &&
              receipt.ride.riderId ? (
                <div className="mt-4 rounded-xl bg-muted/60 p-4">
                  <p className="text-sm font-medium tracking-tight">
                    How was your ride?
                  </p>
                  <RideRating rideId={receipt.ride._id} className="mt-3" />
                </div>
              ) : null}

              <Button
                className="mt-5 w-full"
                onClick={() => {
                  setReceiptId(null);
                  setDestination(null);
                }}
              >
                Book another ride
              </Button>
            </section>
          ) : (
            <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
              <h2 className="text-lg font-semibold tracking-tight">
                {TYPE_TITLE[bookingType]}
              </h2>

              {/* Below lg the bottom bar is the service picker, so repeating it
                  here would put the same three choices on screen twice. From
                  lg up the bar is gone and this is the only way to switch. */}
              <div className="hidden lg:block">
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Riding somewhere, or sending a rider to buy or fetch
                  something? Pick a type below.
                </p>
                <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg border border-border p-1">
                  {BOOKING_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBookingType(type)}
                      className={cn(
                        // min-h-11: this is the first thing a commuter touches
                        // after the header, and at py-1.5 it was ~26px tall —
                        // half the 44px minimum, which on a phone means
                        // mistapping the service you are about to order.
                        "min-h-11 rounded-md px-2 text-sm font-medium tracking-tight transition-colors",
                        bookingType === type
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {TYPE_LABEL[type]}
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                {copy.hint}
              </p>

              <div className="mt-4 space-y-2.5">
                {/* Both ends are summaries now, not editors. Each one opens the
                    screen that owns picking a place, which is the whole point of
                    the flow: the map is the primary surface there, so the fare
                    and the request can be the primary surface here. */}
                <EndRow
                  tone="accent"
                  icon={<Navigation aria-hidden className="size-4" />}
                  label={copy.pickup}
                  // While the address for the fix is still being resolved, the
                  // row says so rather than showing the word "Current location",
                  // which reads as a real address a rider would be sent to.
                  value={
                    pickup?.address === PENDING_ADDRESS
                      ? "Finding your address…"
                      : pickup?.address
                  }
                  onClick={() => openStep("pickup")}
                />

                {/* GPS is a row of its own, not a crosshair tucked into the
                    pickup row. It used to be a 44px circle sitting beside the
                    first row, which read as a decoration on that field rather
                    than as the third way to fill it in — and the busiest thing
                    on the screen was the one a commuter in a unfamiliar street
                    most needs. Its own row states what it does, and it spins
                    while asking so the press is visibly working. */}
                <EndRow
                  icon={
                    here.detecting ? (
                      <Loader2 aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <LocateFixed aria-hidden className="size-4" />
                    )
                  }
                  label="Use my current location"
                  busy={here.detecting}
                  onClick={() => void handleUseCurrentLocation()}
                />

                {/* Swap is a small quiet control rather than a row of its own:
                    reversing a trip is a correction, not a decision, and it is
                    only meaningful once both ends exist. */}
                {pickup && destination ? (
                  <button
                    type="button"
                    onClick={swapEnds}
                    className="mx-auto flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ArrowUpDown className="size-3" />
                    Swap
                  </button>
                ) : null}

                {/* ── Search, without leaving the screen ─────────────────────
                    Three ways to name a destination, and none of them should
                    cost a screen transition: type it, pick it from the list
                    below, or drag the pin. Opening another screen to type an
                    address you could have typed here is the friction that makes
                    a booking app feel slow. */}
                <div className="space-y-2">
                  {/* The label sits above the field rather than being a row of
                      its own. There used to be both — a "Destination" row
                      showing the address, and this search box showing the same
                      address a few lines below it — so the dropoff was on screen
                      twice, and the two of them disagreed about whether tapping
                      it typed or navigated. One labelled field, one job. */}
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {copy.destination}
                  </p>
                  <PlaceSearch
                    placeholder="Where are you going?"
                    near={
                      pickup
                        ? { lat: pickup.lat, lng: pickup.lng }
                        : (here.coords ?? undefined)
                    }
                    value={destination?.address ?? ""}
                    onSelect={(place) =>
                      chooseDestination(
                        { lat: place.lat, lng: place.lng },
                        place.label,
                      )
                    }
                  />

                  {/* Recent places, but only while they are useful: once a
                      destination is chosen the search box is full of text and a
                      list of five other addresses underneath it is noise. */}
                  {recents.rows.length > 0 && !destination ? (
                    <div className="rounded-lg border border-border">
                      <div className="flex items-center justify-between border-b border-border px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                          Recent
                        </p>
                        <button
                          type="button"
                          onClick={recents.clear}
                          className="text-[11px] text-muted-foreground underline-offset-2 transition hover:text-foreground hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                      <ul>
                        {recents.rows.map((row) => (
                          <li key={`${row.lat},${row.lng},${row.label}`}>
                            <button
                              type="button"
                              onClick={() =>
                                chooseDestination(
                                  { lat: row.lat, lng: row.lng },
                                  row.label,
                                )
                              }
                              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary/60"
                            >
                              <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate text-sm tracking-tight">
                                {row.label}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                {/* Both ends are set, so the map is the thing worth offering next. It is
                    already on this screen — this does not open one, it takes you
                    to it. On a phone the booking sheet rides over the bottom of
                    the map and the pin you want to move is often just above the
                    fold, so a button that says so beats leaving a commuter to
                    decide whether to scroll. */}
                <div className="space-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      mapWrapRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      })
                    }
                    className="w-full rounded-2xl"
                  >
                    <MapPinned aria-hidden className="size-4" />
                    {/* Literal, like the rest of this screen's copy: the page is not on the
                      dictionary yet, and a lone `t()` in a file of ~100 plain
                      strings would read as a half-finished migration. Wording
                      matches en.booking.chooseOnMap, so it can be swapped over
                      without changing what it says. */}
                    Choose on map
                  </Button>

                  <p className="flex items-start gap-2 px-1 text-[11px] leading-4 text-muted-foreground">
                    <LocateFixed aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fetch-red" />
                    Tap either end to set it on the map — GPS is usually a few
                    metres out, so check the pin lands on your gate.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Saved places
                    </p>
                    {saveablePoint ? (
                      <button
                        type="button"
                        onClick={openSaveSheet}
                        className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Save current
                      </button>
                    ) : null}
                  </div>

                  {savedPlaces && savedPlaces.length > 0 ? (
                    <ul className="space-y-1.5">
                      {savedPlaces.map((place) => (
                        <li
                          key={place._id}
                          className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              applyPlace(
                                target,
                                place,
                                place.address ?? place.label,
                              );
                              scrollMapIntoViewOnMobile();
                            }}
                            className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          >
                            <span className="text-muted-foreground">
                              {savedPlaceIcon(place.label)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm tracking-tight">
                                {place.label}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {shortAddress(place.address)}
                              </span>
                            </span>
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${place.label}`}
                            onClick={() => handleRemovePlace(place._id)}
                            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      Set your pickup once, then save it as Home so the next
                      booking is one tap.
                    </p>
                  )}
                </div>

                {isErrand ? (
                  <div className="space-y-3 rounded-xl bg-muted/60 p-3.5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {copy.list}
                    </p>

                    {bookingType === "pabili" ? (
                      <div className="space-y-1.5">
                        <Textarea
                          id="buyList"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          maxLength={600}
                          rows={4}
                          placeholder="Bugas 5kg, 2 dozen eggs, 3 sachets of Milo. Any brand for the eggs."
                          className="resize-none"
                        />
                        <p className="text-[11px] leading-4 text-muted-foreground">
                          Write your list in your own words. Add sizes, brands,
                          or anything else your rider should know — they shop it
                          and report what they actually spent.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <Input
                            value={itemDraft.name}
                            onChange={(e) =>
                              setItemDraft((d) => ({ ...d, name: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addItem();
                              }
                            }}
                            placeholder="e.g. Bugas 5kg"
                            className="h-11 sm:h-9"
                          />
                          <Input
                            value={itemDraft.qty}
                            onChange={(e) =>
                              setItemDraft((d) => ({ ...d, qty: e.target.value }))
                            }
                            inputMode="numeric"
                            aria-label="Quantity"
                            className="h-11 w-20 shrink-0 sm:h-9 sm:w-16"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={addItem}
                            aria-label="Add item"
                            className="size-11 shrink-0 p-0 sm:size-9"
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>

                        {items.length > 0 ? (
                          <ul className="space-y-1.5 pt-1">
                            {items.map((item, index) => (
                              <li
                                key={`${item.name}-${index}`}
                                className="flex items-center justify-between gap-3 text-sm"
                              >
                                <span className="min-w-0 truncate">
                                  <span className="text-muted-foreground">
                                    {item.qty}×{" "}
                                  </span>
                                  {item.name}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Remove ${item.name}`}
                                  onClick={() =>
                                    setItems((prev) =>
                                      prev.filter((_, i) => i !== index),
                                    )
                                  }
                                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[11px] leading-4 text-muted-foreground">
                            Add at least one item so your rider knows what to get.
                          </p>
                        )}

                        <div className="space-y-1.5">
                          <Label htmlFor="notes" className="text-xs">
                            Instructions
                          </Label>
                          <Textarea
                            id="notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            maxLength={600}
                            rows={2}
                            placeholder="Where exactly the item is, or who to look for."
                            className="resize-none"
                          />
                        </div>
                      </>
                    )}

                    <Separator />

                    <div className="space-y-1.5">
                      <Label htmlFor="budget" className="text-xs">
                        Item budget
                      </Label>
                      <Input
                        id="budget"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        inputMode="decimal"
                        placeholder="200"
                      />
                      <p className="text-[11px] leading-4 text-muted-foreground">
                        Cash your rider spends at the store. You hand it over on
                        delivery — Fetch only charges the service fee.
                      </p>
                    </div>

                    {bookingType === "padala" ? (
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="Recipient name"
                        />
                        <Input
                          value={recipientPhone}
                          onChange={(e) => setRecipientPhone(e.target.value)}
                          inputMode="tel"
                          placeholder="Recipient mobile"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* When the pickup happens. Off by default because most trips are
                  "now", and a control that is on but unused is noise on the one
                  screen a commuter uses most. */}
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setScheduleFor((prev) => (prev ? "" : "soon"))}
                  aria-pressed={Boolean(scheduleFor)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>
                    <span className="block text-sm font-medium tracking-tight">
                      Book for later
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {scheduleFor
                        ? scheduleLabel(
                            normalizeScheduledFor(
                              scheduleFor === "soon" ? soonValue() : scheduleFor,
                              now,
                            ),
                            now,
                          )
                        : "Pickup as soon as a rider is free"}
                    </span>
                  </span>
                  <CalendarClock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </button>
                {scheduleFor ? (
                  <div className="space-y-2">
                    <Input
                      type="datetime-local"
                      value={scheduleFor === "soon" ? soonValue() : scheduleFor}
                      min={soonValue()}
                      onChange={(e) => setScheduleFor(e.target.value)}
                      aria-label="Pickup date and time"
                    />
                    <div className="flex flex-wrap gap-2">
                      {["soon", ...quickSlots()].map((slot) => (
                        <button
                          key={String(slot)}
                          type="button"
                          onClick={() =>
                            setScheduleFor(slot === "soon" ? "soon" : slot)
                          }
                          className="min-h-9 rounded-full border border-border px-3 text-xs font-medium tracking-tight transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {slot === "soon" ? "In 1 hour" : String(slot).replace("T", " · ")}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] leading-4 text-muted-foreground">
                      Your request goes to riders an hour before pickup. Up to
                      a week ahead.
                    </p>
                  </div>
                ) : null}
              </div>

              <Separator className="my-4" />

              {pickup && destination ? (
                <>
                  {/* The vehicle choice is gone. Every FETCH rider is on a
                      motorcycle, so a four-card selector was a decision nobody
                      had: it cost a swipe, and it implied cars and vans that
                      do not exist. The vehicle is stated once, in the summary
                      below, and priced as what it is. */}
                  {/* Who is riding. Placed after both ends are known and before
                      the summary, so the summary below can state who the trip
                      is for — which is the thing the summary was previously
                      unable to say. */}
                  <WhoIsRiding
                    value={whoIsRiding}
                    onChange={setWhoIsRiding}
                    profile={profile ?? null}
                  />

                  <BookingSummary
                    pickup={pickup.address}
                    destination={destination.address}
                    distanceKm={distanceKm}
                    distanceSource={distanceSource}
                    rideType={BOOKING_RIDE_TYPE}
                    etaMinutes={etaMinutes}
                    fare={breakdown}
                    surgeMultiplier={surgeMultiplier}
                    passenger={
                      whoIsRiding.passengerType === "other"
                        ? {
                            name: whoIsRiding.passengerName.trim(),
                            phone: whoIsRiding.passengerPhone.trim(),
                          }
                        : { name: profile?.name ?? "", phone: profile?.phone ?? "" }
                    }
                    isBookingForOther={whoIsRiding.passengerType === "other"}
                    bookerName={profile?.name ?? null}
                  >
                    {/* The tariff behind the numbers above. Kept underneath the
                        breakdown rather than replacing it: the breakdown says
                        what this trip costs, the tariff says why, and a commuter
                        who disagrees needs both. */}
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        Current tariff
                      </p>
                      <dl className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <dt>Minimum fare</dt>
                          <dd>{formatPeso(liveTariff.minFare)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Included distance</dt>
                          <dd>{liveTariff.includedDistanceKm} km</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>Additional rate</dt>
                          <dd>{formatPeso(liveTariff.ratePerKm)} / km</dd>
                        </div>
                        {isErrand ? (
                          <>
                            <div className="flex justify-between">
                              <dt>Errand minimum</dt>
                              <dd>{formatPeso(liveTariff.errandMinFare)}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt>Store stop fee</dt>
                              <dd>{formatPeso(liveTariff.stopFee)}</dd>
                            </div>
                          </>
                        ) : null}
                      </dl>
                      {isErrand ? (
                        <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                          A pasugo is never priced as a bare{" "}
                          {formatDistance(distanceKm)} trip. Your rider still
                          drives to the store, parks, queues, and carries the
                          goods back — so the errand minimum and store stop fee
                          always apply.
                        </p>
                      ) : null}
                    </div>
                  </BookingSummary>

                  {isErrand ? (
                    <>
                      <Separator className="my-4" />
                      <dl className="space-y-1.5 text-xs">
                        <div className="flex justify-between text-muted-foreground">
                          <dt>
                            {bookingType === "pabili"
                              ? "Shopping list"
                              : "Items on the list"}
                          </dt>
                          <dd className="max-w-[55%] truncate text-right">
                            {bookingType === "pabili"
                              ? notes.trim() || "—"
                              : items.length}
                          </dd>
                        </div>
                        {hasBudget ? (
                          <div className="flex justify-between text-muted-foreground">
                            <dt>Item budget</dt>
                            <dd>{formatPeso(budgetNum)}</dd>
                          </div>
                        ) : null}
                        <div className="flex justify-between font-medium text-foreground">
                          <dt>Total to prepare</dt>
                          <dd>{formatPeso(totalToPrepare)}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-[11px] leading-4 text-muted-foreground">
                        The service fee is what Fetch collects. The item budget is
                        cash you hand your rider, and they report the actual
                        amount spent before hand-over.
                      </p>
                    </>
                  ) : null}

                  {storePinLooksNear ? (
                    <div className="mt-4 rounded-lg border border-foreground/20 bg-secondary/60 p-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 size-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium tracking-tight">
                            Check that {copy.pickup.toLowerCase()} pin
                          </p>
                          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                            It sits {Math.round(distanceKm * 1000)} m from your
                            drop-off, which usually means it landed on the
                            nearest landmark rather than the real place. Your
                            rider still has to get there, so pin the actual
                            store — the errand minimum covers the trip either
                            way.
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setTarget("pickup")}
                        >
                          <MapPin className="size-3.5" />
                          Fix the pin
                        </Button>
                        {storePinConfirmed ? (
                          <span className="self-center text-[11px] text-muted-foreground">
                            Confirmed — send it as pinned.
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setStorePinConfirmed(true)}
                          >
                            This pin is right
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <p className="mt-4 text-[10px] leading-4 text-muted-foreground">
                    {isErrand
                      ? "The service fee is confirmed by Fetch when you request. If your rider has to correct the store, the fee can only rise by a capped amount, and you are told before it does."
                      : "The fare is confirmed by Fetch when your ride is created."}
                  </p>

                  {/* Pinned to the bottom of the panel: on a phone the form is
                      long and the map sits above it, so a CTA at the end of the
                      document was a scroll away from the last thing you set. */}
                  <div className="above-tabs sticky z-20 -mx-4 mt-4 border-t border-border bg-background/95 px-4 py-2.5 backdrop-blur sm:-mx-5 sm:px-5">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {isErrand ? "Service fee" : "Total fare"}
                        </p>
                        <p className="text-xl font-semibold tracking-tight tabular-nums">
                          {formatPeso(estimatedFare ?? 0)}
                        </p>
                        {pickup && destination ? (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {/* The distance and the arrival time on one line: what
                                the commuter is about to commit to, without
                                scrolling back up to re-read it. The vehicle
                                used to lead it, but there is only one now, so
                                naming it was a word for no information. */}
                            {formatDistance(distanceKm)} · {formatEta(etaMinutes)}
                            {isSurgeActive(surgeMultiplier)
                              ? ` · ${formatSurge(surgeMultiplier)} surge`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                      <Button
                        size="lg"
                        className="shrink-0"
                        disabled={
                          busy ||
                          (storePinLooksNear && !storePinConfirmed) ||
                          (bookingType === "padala" && items.length === 0) ||
                          (bookingType === "pabili" && !notes.trim()) ||
                          // An incomplete passenger cannot be booked. Blocked
                          // here as well as on the server: the server is the
                          // rule, this is so the button explains itself
                          // instead of failing after a round trip.
                          Object.keys(passengerErrors).length > 0
                        }
                        onClick={handleRequest}
                      >
                        {busy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          copy.cta
                        )}
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center">
                  <Search className="mx-auto size-4 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium tracking-tight">
                    {isErrand ? "Where should your rider go?" : "Where are you going?"}
                  </p>
                  <p className="mx-auto mt-1 max-w-[18rem] text-xs leading-5 text-muted-foreground">
                    {target === "pickup"
                      ? "Use your GPS, type an address above, or tap the map — then save it as Home."
                      : "Type an address above, tap a saved place, or drop a pin on the map."}
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Map */}
        <div className="order-1 lg:order-2" ref={mapWrapRef}>
          {/* Edge-to-edge on a phone, boxed from sm up: a map inset in page
              padding reads as a web widget, not as the app's main surface. */}
          <div className="relative -mx-4 overflow-hidden border-b border-border sm:mx-0 sm:rounded-2xl sm:border lg:border">
            <MapView
              center={center}
              zoom={zoom}
              markers={markers}
              route={route}
              onPick={handlePick}
              followTarget={riderLocation}
              // Recentre returns to the commuter's own GPS fix, not to whatever
              // the map happens to be following — on a booking map the two are
              // different questions.
              recenterTarget={here.coords}
              // The end being edited is a real draggable pin, so the commuter
              // can nudge it a couple of metres instead of re-picking an
              // address on another screen.
              dragPoint={dragPoint}
              onDragPointChange={handleDragPointChange}
              onDragPointEnd={handleDragPointEnd}
              onMarkerClick={handleMarkerClick}
              // dvh, not vh: on a phone the URL bar collapses while you scroll,
              // and a vh-sized map then overflows the space it was given.
              //
              // min-h dropped from 300px to 240px for the same reason it is
              // dvh: on a 568px-tall phone the old floor won, so the map took
              // more than half the viewport before the form began — you had to
              // scroll a phone-height of map to reach the pickup row. 240px is
              // still a usable map for nudging a pin.
              className="h-[42dvh] min-h-[240px] w-full sm:h-[42vh] lg:h-[calc(100vh-8rem)]"
            />
            {!liveRide ? (
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
                <Crosshair className="size-3" />
                {dragPoint
                  ? "Drag the pin to adjust"
                  : target === "pickup"
                    ? "Tap map to set pickup"
                    : "Tap map to set destination"}
              </div>
            ) : null}
            {liveRide && !riderLocation && liveRide.status !== "SEARCHING" ? (
              <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
                Waiting for rider GPS…
              </div>
            ) : null}

            {/* ── Route chip ──────────────────────────────────────────────────
                The distance and the ETA of whatever is currently drawn, so a
                commuter who drags the pin watches the trip change rather than
                having to scroll down to a fare block they already half-believe.
                It reads the same numbers the fare is priced on, so the map and
                the quote cannot disagree. */}
            {pickup && destination && !liveRide ? (
              <div className="pointer-events-none absolute bottom-9 left-3 z-10 flex items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 text-[11px] tracking-tight shadow-sm backdrop-blur">
                <Navigation className="size-3" aria-hidden />
                <span className="font-medium tabular-nums">
                  {formatDistance(distanceKm)}
                </span>
                <span className="text-muted-foreground">·</span>
                <Clock className="size-3" aria-hidden />
                <span className="tabular-nums">
                  {etaMinutes > 0 ? `${etaMinutes} min` : "—"}
                </span>
                {/* The route is being re-measured. The numbers above stay on
                    screen rather than flashing to a spinner: the straight-line
                    distance is always a real answer, and blinking it away on
                    every frame of a drag makes the map look broken. */}
                {road.loading ? (
                  <Loader2 className="size-3 animate-spin opacity-60" />
                ) : null}
              </div>
            ) : null}

            {/* ── Search ──────────────────────────────────────────────────────
                A pin moves you a few metres; a search moves you across town.
                The two are different tools and both have to be one tap away. */}
            <button
              type="button"
              onClick={() => {
                setTarget("destination");
                openStep("destination");
              }}
              aria-label="Search for a destination"
              className="absolute bottom-9 right-3 z-10 flex size-11 items-center justify-center rounded-full border border-border bg-background/95 text-foreground shadow-sm backdrop-blur transition active:bg-secondary sm:size-10"
            >
              <Search className="size-5 sm:size-4" />
            </button>

            {/* ── Pin card ────────────────────────────────────────────────────
                Opens on a tap of a pin, and closes on a tap of anywhere else:
                the same gesture that used to move the pin now dismisses the
                card, which is what a commuter expects after reading it. */}
            {popupEnd && !liveRide
              ? (() => {
                  const end = popupEnd;
                  const point = end === "pickup" ? pickup : destination;
                  if (!point) return null;
                  // The geocoder only ever describes the pin being dragged.
                  // Falling back to its label for the *other* end would show one
                  // pin's address on another pin's card, so a pin that has no
                  // label of its own says so rather than borrowing one.
                  const isActive = end === target;
                  const address = point.address ?? (isActive ? geocoded.address : null);
                  return (
                    <div className="absolute inset-x-3 bottom-20 z-20 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {end === "pickup" ? "Pickup" : "Destination"}
                          </p>
                          {isActive && geocoded.resolving ? (
                            <p className="mt-1 flex items-center gap-1.5 text-sm tracking-tight text-muted-foreground">
                              <Loader2 className="size-3.5 animate-spin" />
                              Finding address…
                            </p>
                          ) : (
                            <AddressText label={address} />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPopupEnd(null)}
                          aria-label="Dismiss"
                          className="-mr-1 -mt-1 rounded-full p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="mt-2.5 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-10 text-xs sm:h-8"
                          onClick={() => {
                            setPopupEnd(null);
                            openStep(end);
                          }}
                        >
                          <Search className="size-3.5" />
                          Search instead
                        </Button>
                      </div>
                    </div>
                  );
                })()
              : null}
          </div>
        </div>
      </div>

      {/* ── Booking confirmation ──────────────────────────────────────────────
          Opened by the ride that was just written, and read back from the
          server rather than echoed from the form: the fare shown here is the
          fare stored on the ride, surge included, so the two cannot drift
          between the quote and the charge. */}
      <Sheet
        open={bookedRideId !== null}
        onOpenChange={(open) => {
          if (!open) setBookedRideId(null);
        }}
      >
        <SheetContent side="bottom" className="px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle className="text-base tracking-tight">
              {booked?.ride ? "Ride booked" : "Booking…"}
            </SheetTitle>
          </SheetHeader>
          {booked?.ride ? (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-3">
                <Check className="size-5 shrink-0 text-primary" aria-hidden />
                <p className="text-xs leading-5">
                  Ride{" "}
                  <span className="font-semibold tracking-tight">
                    {booked.ride.code}
                  </span>{" "}
                  is searching for a nearby rider. We will notify you the moment
                  one accepts.
                </p>
              </div>

              <BookingSummary
                pickup={booked.ride.pickup.address}
                destination={booked.ride.destination.address}
                distanceKm={booked.ride.distanceKm}
                distanceSource={bookedSource}
                rideType={booked.ride.rideType ?? BOOKING_RIDE_TYPE}
                etaMinutes={booked.ride.etaMinutes ?? 0}
                fare={
                  booked.ride.fareBreakdown
                    ? { ...booked.ride.fareBreakdown, riderPayout: booked.ride.fare }
                    : null
                }
                surgeMultiplier={booked.ride.surgeMultiplier ?? 1}
              />

              <Button
                className="w-full"
                onClick={() => {
                  setBookedRideId(null);
                  navigate("/activity");
                }}
              >
                View my trips
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={saveOpen} onOpenChange={setSaveOpen}>
        <SheetContent side="bottom" className="px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle className="text-base tracking-tight">
              Save this place
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs leading-5 text-muted-foreground">
              {saveablePoint
                ? `Saving: ${shortAddress(saveablePoint.address)}`
                : "Pick a location first — use GPS, search, or tap the map."}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {QUICK_LABELS.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSaveLabel(label)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm tracking-tight transition-colors",
                    saveLabel === label
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <Input
              value={saveLabel}
              onChange={(e) => setSaveLabel(e.target.value)}
              maxLength={24}
              placeholder="e.g. Home, Work, mother's house"
            />

            <Button
              className="w-full"
              disabled={!saveablePoint || !saveLabel.trim() || saveBusy}
              onClick={handleSavePlace}
            >
              {saveBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Save place"
              )}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
