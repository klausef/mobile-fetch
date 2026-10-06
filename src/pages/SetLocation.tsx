import { api } from "@/convex/_generated/api";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { PlaceSearch } from "@/components/ride/PlaceSearch";
import { Button } from "@/components/ui/button";
import { useCurrentLocationContext } from "@/components/CurrentLocationProvider";
import { useRecentDestinations } from "@/hooks/use-recent-destinations";
import {
  locationStepUrl,
  nextStepUrl,
  readBookingPrefill,
  type LocationStep,
} from "@/lib/booking-url";
import {
  estimateEtaMinutes,
  formatDistance,
  formatEta,
  haversineKm,
  shortAddress,
} from "@/lib/geo";
import {
  canRetry,
  CURRENT_LOCATION_ZOOM,
  distanceToFixMeters,
  formatCoords,
  shouldWarnFixDrift,
} from "@/lib/location";
import { useT } from "@/lib/i18n/LocaleProvider";
import { describePoint, type LatLng, type Place } from "@/lib/map-service";
import { midpoint, zoomToFit } from "@/lib/search";
import { cn } from "@/lib/utils";
import { isInServiceArea, LIVE_CITY_NAMES, liveCityFor, REGION } from "@/lib/region";
import { useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowLeft,
  Bookmark,
  Clock,
  Crosshair,
  History,
  Home as HomeIcon,
  Loader2,
  MapPin,
  Pencil,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

/** The label a point carries before the geocoder has answered. */
const PENDING = "…";

/** Zoom for choosing a gate rather than a town. */
const CHOOSING_ZOOM = 15;

/** Zoom for the whole city, shown before a fix has ever arrived. */
const CITY_ZOOM = 13;

/**
 * A point as a key, at the precision the UI can actually show.
 *
 * About a metre, which is finer than a GPS fix or a fingertip is honest about.
 * Used to answer "is this pin the same as my fix?", which decides whether the
 * address is already known or has to be looked up again.
 */
function coarseKey(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

/**
 * One screen per end of the trip: confirm the pickup, then set the
 * destination.
 *
 * The booking form used to be its own editor — two search fields, a tappable
 * map and a draggable pin, all fighting for the same panel. It works, but it
 * asks the commuter to make three decisions on one screen before they know
 * what a trip costs, and the map is a widget in the corner rather than the
 * thing they are actually looking at.
 *
 * So the picking moved here. Each end gets the whole screen: the map, the
 * address in words, and one decision — take what we found, or Edit and put the
 * pin where it belongs. Pickup opens on the current location because that is
 * right perhaps four times in five; the destination opens on search, because
 * nobody knows their drop-off coordinates and everybody knows the name of the
 * place.
 *
 * The state travels in the URL, like every other hand-off into the booking
 * form, so stepping back and forth between the two screens never loses the
 * service type or the other end. The booking screen is left doing what it is
 * good at: showing both ends, the fare, and the request button.
 *
 * The handlers below are plain functions rather than `useCallback`s on purpose.
 * Nothing in this screen keys on a handler's identity — MapView reads its
 * callbacks through a ref, and every child prop that matters is a state setter,
 * which is already stable — so manual memoization here bought nothing, and the
 * React Compiler (which is enabled) reports each one it cannot faithfully
 * preserve. Letting it own the memoization is both simpler and correct.
 */
export default function SetLocation({ step }: { step: LocationStep }) {
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefill = readBookingPrefill(searchParams);
  const existing = step === "pickup" ? prefill.pickup : prefill.destination;

  // One fix for the whole session, requested as the app opened — see
  // `useCurrentLocation`. Both location screens read it rather than asking the
  // browser again, so the address shown here and the address shown on the
  // booking screen can never disagree about where the commuter is.
  const here = useCurrentLocationContext();
  const savedPlaces = useQuery(api.savedPlaces.listMine);
  const recents = useQuery(api.recentPlaces.listRecent);
  // The on-device list, which records a destination the moment it is picked —
  // including one the commuter then abandons. See the hook for why that is not
  // the same question as "places I have booked".
  const recentLocal = useRecentDestinations();
  /**
   * A pin dropped by holding the map, awaiting confirmation.
   *
   * Kept apart from `point` so it can be *cancelled*. Writing straight to
   * `point` would make the hold irreversible: a mis-dropped pin would have to be
   * undone by picking something else, with no way back to where they were.
   */
  const [heldPin, setHeldPin] = useState<LatLng | null>(null);

  const [point, setPoint] = useState<LatLng | null>(existing);
  const [label, setLabel] = useState<string | null>(existing?.address ?? null);
  const [center, setCenter] = useState<LatLng>(existing ?? REGION.center);
  const [zoom, setZoom] = useState(existing ? CHOOSING_ZOOM : CITY_ZOOM);
  /** Edit pressed: the map is now an editor and a tap moves the pin. */
  const [editing, setEditing] = useState(false);
  /**
   * Where the pin is *while the finger is on it*.
   *
   * Separate from `point` on purpose. `point` is the committed answer, and a
   * change to it starts an address lookup; if the drag wrote to `point` on
   * every frame, the screen would fire a geocoding request per frame — which
   * MapTiler would rate-limit and the commuter would see as a stutter. So the
   * drag is held here, the readout under the pin is answered locally and
   * instantly, and `point` is only written once, on release.
   */
  const [drag, setDrag] = useState<LatLng | null>(null);
  /** Live search results, drawn on the map next to the dropdown. */
  const [results, setResults] = useState<Place[]>([]);
  /**
   * Which point we have an address for, as "lat,lng".
   *
   * State rather than a ref, so "are we still describing?" is a comparison the
   * render can make: while `described` disagrees with the current point the
   * sheet says it is finding the address, and Next waits. A ref would have
   * needed a second piece of state to re-render on, which is how the two drift.
   */
  const [described, setDescribed] = useState<string | null>(
    existing ? `${existing.lat},${existing.lng}` : null,
  );

  const pointKey = point ? `${point.lat},${point.lng}` : null;

  const [seededFix, setSeededFix] = useState<LatLng | null>(existing);

  // Pickup with nothing in the URL: wait for a fix and offer it, rather than
  // dropping the commuter on an empty map and making them find themselves.
  // Seeded during render (React's documented alternative to a sync effect), the
  // same way the booking form seeds its own pickup, so the map and the sheet
  // agree on the first paint instead of briefly showing an empty screen.
  //
  // The zoom comes along with the point. Opening on the whole city is right for
  // browsing and useless for confirming a gate: at CITY_ZOOM a pin "on the right
  // street" is indistinguishable from one three streets over, so the commuter
  // would have to zoom in themselves before they could check anything.
  if (
    step === "pickup" &&
    !existing &&
    here.coords &&
    (seededFix?.lat !== here.coords.lat || seededFix?.lng !== here.coords.lng)
  ) {
    const fix = { lat: here.coords.lat, lng: here.coords.lng };
    setSeededFix(fix);
    setPoint(fix);
    setCenter(fix);
    setZoom(CURRENT_LOCATION_ZOOM);
  }

  /**
   * The fix, as a comparable key.
   *
   * Five decimals — the same precision the address is printed at, about a
   * metre. It is what lets the effect below recognise "this pin *is* my
   * location" and reuse the address the app already resolved for it, instead of
   * asking the geocoder the same question a second time.
   */
  const fixKey = here.coords ? coarseKey(here.coords) : null;
  const pointIsFix = point !== null && fixKey !== null && coarseKey(point) === fixKey;

  /**
   * The address for the current point, derived rather than stored.
   *
   * When the pin *is* the GPS fix, the shared hook already has (or is fetching)
   * the address for it, so it is read straight from there instead of being
   * copied into local state by an effect. That is not a style preference: an
   * effect that writes state while the fix is still resolving would make the
   * sheet show the old street against the new pin for a frame, and the two
   * would disagree in the one place the commuter is looking.
   *
   * `null` here means "we do not have an answer yet", which is what drives the
   * spinner and the disabled Next.
   */
  const fixAddress =
    point !== null && pointIsFix && !here.resolvingAddress
      ? (here.address ?? formatCoords(point))
      : null;

  const describing =
    pointKey !== null && fixAddress === null && described !== pointKey;

  // The address to show and to hand to the next screen. Fix-derived while the
  // pin is the fix, locally resolved otherwise.
  const address = fixAddress ?? label;

  // Turn a point into an address. Skipped when the link already carried one:
  // a shared link's label is what the sender saw, and re-resolving it could
  // quietly change the text under the map. Also skipped for the fix itself,
  // which `fixAddress` handles without a second request.
  //
  // The held pin is described too, and for the same reason: Confirm needs a
  // street name to hand over, and resolving it *before* the confirm means the
  // button can be pressed the instant the pin is dropped rather than after a
  // network round trip the commuter has to wait through. The result is written
  // to `label`/`described` rather than to new state, so confirming it is a plain
  // copy of what is already known.
  const heldLat = heldPin?.lat;
  const heldLng = heldPin?.lng;
  useEffect(() => {
    // Keyed on the coordinates, not the objects: `heldPin` is a fresh object
    // every time a pin is dropped, and depending on its identity would restart
    // the lookup for the same point. This is the same reason `dragPoint` and
    // `followTarget` are destructured before being watched in MapView.
    const target =
      heldLat !== undefined && heldLng !== undefined
        ? { lat: heldLat, lng: heldLng }
        : point;
    if (!target) return;
    const targetKey = `${target.lat},${target.lng}`;
    if (described === targetKey) return;
    if (target === point && pointIsFix) return;
    let cancelled = false;
    void describePoint(target).then((found) => {
      if (cancelled) return;
      // No address is a normal answer, not an error: the pin is still usable
      // and the commuter can Edit it. Saying "unknown" would be worse than
      // showing the coordinates.
      setLabel(found ?? formatCoords(target));
      setDescribed(targetKey);
    });
    return () => {
      cancelled = true;
    };
    }, [point, pointKey, described, pointIsFix, heldLat, heldLng]);

  /**
   * A pin whose address we already know — no round trip, and no re-wording.
   *
   * Deliberately not wrapped in `useCallback`: nothing keys on its identity, so
   * a stable reference buys nothing here, and the React Compiler memoizes what
   * it can on its own.
   */
  const pickKnown = (next: LatLng, known: string) => {
    setPoint(next);
    setCenter(next);
    setLabel(known);
    setDescribed(`${next.lat},${next.lng}`);
    setResults([]);
    setHeldPin(null);
    // A destination the commuter actually chose is a destination they are
    // likely to choose again, including next time before any booking exists.
    if (step === "destination") {
      recentLocal.remember({ label: known, lat: next.lat, lng: next.lng });
    }
    frameBothEnds(next);
  };

  /**
   * A press held on the map: drop a pin there, but do not commit it yet.
   *
   * Held back from `point` on purpose, so the Confirm button is what makes it
   * real. A map that commits on every gesture cannot be explored — you would
   * never be able to pan around a market without changing where the rider is
   * going to.
   */
  const dropHeldPin = (at: LatLng) => {
    setHeldPin(at);
    setResults([]);
  };

  /** The held pin becomes the destination, address and all. */
  const confirmHeldPin = () => {
    if (!heldPin) return;
    setPoint(heldPin);
    setCenter(heldPin);
    setLabel(null);
    setDescribed(null);
    setHeldPin(null);
  };

  /** A pin whose address still has to be found: a map tap or a dragged pin. */
  const choose = (next: LatLng) => {
    setPoint(next);
    setCenter(next);
  };

  /**
   * Put both ends of the trip on screen, at a zoom that fits them.
   *
   * The naive version — centre on the thing just picked — leaves the other end
   * off-screen exactly when it matters most: the commuter is comparing the new
   * destination against where they are being collected from. Framing both is the
   * only view that answers "is this trip worth doing".
   *
   * With no pickup yet there is nothing to frame against, so the camera simply
   * goes to the new point.
   */
  const frameBothEnds = (destination: LatLng) => {
    const from = step === "destination" ? (prefill.pickup ?? point) : null;
    if (!from) {
      setCenter(destination);
      return;
    }
    setCenter(midpoint(from, destination));
    setZoom(zoomToFit(from, destination));
  };

  /**
   * "Use current location": ask the browser again and put the pin here.
   *
   * Not `here.coords ?? refresh()` for the obvious reason — the whole point of a
   * refresh is a *new* reading. Someone who was in a building when the app
   * opened, or who has walked to the gate since, presses this to get the fix
   * that describes where they are now; reusing the cached one would move the
   * pin to where they used to be and re-confirm it, which is worse than doing
   * nothing.
   *
   * The address is not written here. `refresh()` resolves as soon as the
   * coordinates do, and the geocoding for the new point is still in flight —
   * so the effect above picks it up, and the sheet says it is finding the
   * address rather than showing the old street against the new pin.
   */
  const goToCurrentLocation = async () => {
    const fix = await here.refresh();
    if (!fix) return;
    setEditing(false);
    setResults([]);
    setLabel(null);
    setDescribed(null);
    choose({ lat: fix.lat, lng: fix.lng });
    // Re-zoom even if we are already at 15: the commuter asked to be shown
    // where they are, and a map they had panned somewhere else is not that.
    setZoom(CURRENT_LOCATION_ZOOM);
  };

  const savePlace = useMutation(api.savedPlaces.savePlace);

  /** The pin under the finger, reported every frame; see the `drag` state note. */
  const handleDragChange = (next: LatLng) => setDrag(next);

  /** The drag is over: commit the point, so the address lookup runs exactly once. */
  const handleDragEnd = (next: LatLng) => {
    setDrag(null);
    choose(next);
  };

  /** The point the sheet is describing: the live drag while one is happening. */
  const shownPoint = drag ?? point;
  const dragging = drag !== null;

  /** The one line at the top of the sheet: the answer to "where is this?" */
  const headline = (): string => {
    if (drag) {
      // Answered locally, so it keeps up with the finger. The precise address
      // arrives on release, when `point` is written and the lookup runs.
      return liveCityFor(drag)?.name ?? formatCoords(drag);
    }
    if (!point) return "";
    if (describing || !address || address === PENDING) {
      return t("setLocation", "findingAddress");
    }
    // Inside a live city, the city is the answer people recognise; the street
    // address is the line underneath. Outside one, the place name is the best
    // thing we have.
    return liveCityFor(point)?.name ?? shortAddress(address);
  };

  const canContinue = point !== null && !describing && !dragging;

  const goNext = () => {
    if (!point || !canContinue) return;
    navigate(
      nextStepUrl(step, searchParams, {
        lat: point.lat,
        lng: point.lng,
        // A point with no resolved address still has to carry something the
        // booking screen can show, and the coordinates are the truth.
        label: address ?? formatCoords(point),
      }),
    );
  };

  const markers: MapMarker[] = [];
  if (step === "pickup") {
    // Two different things, drawn as two different pins.
    //
    // The blue dot is *where the commuter is* — the raw fix, unmoved. The red
    // pickup pin is *where they want the rider to come*, which they may have
    // dragged to the gate, or searched for, or nudged across the road. Folding
    // both into one dot hid the whole point of the screen: you cannot tell
    // whether the pin moved or you moved.
    //
    // They are drawn as one pin when they are the same place (within about a
    // metre), because two dots on top of each other at zoom 15 read as a
    // rendering glitch rather than as a coincidence.
    //
    // While editing, the draggable teardrop is the pickup pin, so the red pin
    // stands down — but the blue dot stays, because that is the thing the
    // commuter is dragging *away from* and it needs to stay on screen.
    const fix = here.coords;
    if (fix) {
      markers.push({
        id: "here",
        lat: fix.lat,
        lng: fix.lng,
        kind: "current",
      });
    }
    if (point && !editing && !pointIsFix) {
      markers.push({
        id: "pickup",
        lat: point.lat,
        lng: point.lng,
        kind: "pickup",
      });
    }
  } else {
    if (prefill.pickup) {
      markers.push({
        id: "from",
        lat: prefill.pickup.lat,
        lng: prefill.pickup.lng,
        kind: "pickup",
      });
    }
    if (point) {
      markers.push({ id: "to", lat: point.lat, lng: point.lng, kind: "destination" });
    }
    // The pin a long press dropped, drawn but not yet committed. Labelled so it
    // is obvious *why* there are two destination pins on screen.
    if (heldPin) {
      markers.push({
        id: "held",
        lat: heldPin.lat,
        lng: heldPin.lng,
        kind: "pickup",
        label: t("setLocation", "heldPinLabel"),
      });
    }
    // The search results, numbered to match the dropdown so the list and the
    // map are obviously the same set. Tapping one picks it (see onMarkerClick).
    if (!editing) {
      results.forEach((place, index) => {
        markers.push({
          id: `result-${index}`,
          lat: place.lat,
          lng: place.lng,
          kind: "destination",
          label: String(index + 1),
        });
      });
    }
  }

  const outside = shownPoint !== null && !isInServiceArea(shownPoint);

  /**
   * The trip so far, derived rather than stored.
   *
   * Shown on the destination screen because that is where the question is
   * actually asked: having found somewhere to go, what is it going to cost and
   * how long is it? Answering it here means the commuter never has to go back a
   * screen to find out whether the place they picked was worth it.
   */
  const tripKm =
    step === "destination" && prefill.pickup && point
      ? haversineKm(prefill.pickup, point)
      : null;

  /**
   * Whether the held pin is still being named.
   *
   * Confirm is held back until it is, because confirming a pin whose address has
   * not arrived would send the rider to "8.15504, 125.13057" — the coordinates
   * are the truth, but the street name is what a rider can actually use.
   */
  const heldPinDescribing =
    heldPin !== null && described !== `${heldPin.lat},${heldPin.lng}`;

  /**
   * How far the pin the rider will come to is from where the commuter actually
   * is.
   *
   * Only on the pickup screen: on the destination screen there is no reason for
   * the drop-off to be anywhere near the commuter, and a warning about it would
   * be noise.
   */
  const driftMeters =
    step === "pickup" && !editing
      ? distanceToFixMeters(shownPoint, here.coords)
      : null;
  const drifting = shouldWarnFixDrift(driftMeters);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="relative flex-1">
        {/* `followTarget` is deliberately `point`, not the live drag position:
            following the pin while a finger is on it would glide the map under
            that same finger, so the pin would barely move across the map and
            the drag would fight itself. `point` changes only when the drag is
            released or the map is tapped — exactly when the map should move. */}
        <MapView
          center={center}
          zoom={zoom}
          markers={markers}
          onViewChange={(next, nextZoom) => {
            setCenter(next);
            setZoom(nextZoom);
          }}
          onPick={editing ? choose : undefined}
          onLongPress={step === "destination" && !editing ? dropHeldPin : undefined}
          // The line between the ends, so the destination screen answers "how
          // far is this" without a second screen. Only when both ends exist —
          // a route from a single point is a dot, not a journey.
          route={
            step === "destination" && prefill.pickup && point
              ? [[prefill.pickup, point]]
              : null
          }
          dragPoint={editing ? shownPoint : null}
          onDragPointChange={editing ? handleDragChange : undefined}
          onDragPointEnd={editing ? handleDragEnd : undefined}
          onMarkerClick={
            step === "destination" && !editing && results.length > 0
              ? (marker) => {
                  const index = Number(marker.id.slice("result-".length));
                  const place = results[index];
                  if (place) pickKnown(place, place.label);
                }
              : undefined
          }
          followTarget={editing ? point : null}
          className="h-full w-full"
        />

        {/* Back out to the booking form, and out of Edit back to the address we
            already had. Two different gestures, two different arrows. */}
        <button
          type="button"
          onClick={() =>
            editing ? setEditing(false) : navigate(-1)
          }
          aria-label={editing ? t("setLocation", "cancelEdit") : t("common", "back")}
          className="absolute left-4 top-4 z-10 flex size-11 items-center justify-center rounded-full bg-card text-foreground shadow-md ring-1 ring-border transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-5" />
        </button>

        {/*
            The refresh control, as a labelled pill rather than a bare icon.

            A crosshair alone says "there is a location feature somewhere"; the
            words say what pressing it will *do*, which is the difference between
            a control a commuter uses and one they work out. The spinner swaps
            in on the same button — disabled, not hidden — so the control never
            moves out from under the thumb mid-press, and so "nothing is
            happening" is visibly the app's answer rather than a broken button.
        */}
        <button
          type="button"
          onClick={() => void goToCurrentLocation()}
          disabled={here.detecting}
          aria-label={t("setLocation", "useMyLocation")}
          aria-busy={here.detecting}
          className="absolute right-4 top-4 z-10 inline-flex min-h-11 items-center gap-2 rounded-full bg-card pl-3 pr-4 text-xs font-bold tracking-tight text-foreground shadow-md ring-1 ring-border transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-progress disabled:opacity-70"
        >
          {here.detecting ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Crosshair aria-hidden className="size-4" />
          )}
          {here.detecting
            ? t("setLocation", "locatingCurrent")
            : t("setLocation", "useCurrentLocation")}
        </button>

        {editing ? (
          <p className="absolute inset-x-0 top-16 z-10 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-xs font-medium tracking-tight text-background shadow-md">
            {t("setLocation", "dragHint")}
          </p>
        ) : step === "destination" && results.length > 0 ? (
          <p className="absolute inset-x-0 top-4 z-10 mx-auto w-fit rounded-full bg-foreground px-4 py-2 text-xs font-medium tracking-tight text-background shadow-md">
            {t("setLocation", "nearbyResults")}
          </p>
        ) : null}
      </div>

      <div className="safe-bottom relative z-10 rounded-t-3xl bg-background px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-[0_-10px_30px_-14px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-tight text-fetch-red">
              {step === "pickup"
                ? t("setLocation", "pickupEyebrow")
                : t("setLocation", "destinationTitle")}
            </p>
            <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight">
              {headline()}
            </h1>
            {dragging && drag ? (
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                {t("setLocation", "draggingAddress")}{" "}
                {drag.lat.toFixed(5)}, {drag.lng.toFixed(5)}
              </p>
            ) : address && !describing && address !== headline() ? (
              <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                {shortAddress(address)}
              </p>
            ) : null}
          </div>
          {point ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing((prev) => !prev)}
              className="shrink-0 rounded-full"
            >
              {editing ? (
                <X aria-hidden className="size-4" />
              ) : (
                <Pencil aria-hidden className="size-4" />
              )}
              {editing ? t("setLocation", "done") : t("setLocation", "edit")}
            </Button>
          ) : null}
        </div>

        {/*
            Everything the commuter needs to know about *where we are on this
            answer*, in priority order: still working, worked and it disagrees
            with the pin, or did not work at all.

            Shown on the pickup screen only. A destination has no relationship to
            where the commuter is standing, so "your GPS is blocked" there would
            be a message about a screen that does not need GPS.
        */}
        {step === "pickup" && !point && here.detecting ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t("setLocation", "findingYou")}
          </p>
        ) : null}

        {step === "pickup" && point && describing ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {t("setLocation", "findingAddress")}
          </p>
        ) : null}

        {/* The pin the rider will come to is not where the commuter says they
            are. Said plainly, with the distance, because "check your pin" with
            no number is a thing people nod at and ignore. */}
        {drifting && driftMeters !== null ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-fetch-gold bg-fetch-gold/20 px-3 py-2.5 text-xs leading-5">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fetch-ink" />
            {t("setLocation", "fixDriftWarning", { m: String(driftMeters) })}
          </p>
        ) : null}

        {step === "pickup" && here.needsFallback ? (
          <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-3.5">
            <div className="flex gap-2.5">
              <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium tracking-tight">
                  {t("setLocation", "fallbackTitle")}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  {here.notice ?? t("setLocation", "fallbackHint")}
                </p>
                {here.blockedByEnvironment ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {here.blockedByEnvironment}
                  </p>
                ) : null}
              </div>
            </div>

            {/* A permission that was *blocked* cannot be re-asked by the page:
                the browser will not show a prompt for an origin the person has
                refused. Offering a retry there is a button that visibly does
                nothing, so it is hidden and the message says where the real fix
                is instead. */}
            {canRetry(here.status) ? (
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-full"
                onClick={() => void here.refresh()}
              >
                {here.detecting ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  <Crosshair aria-hidden className="size-4" />
                )}
                {t("setLocation", "retryLocation")}
              </Button>
            ) : null}

            {/* The way forward that always works, whatever the phone decided:
                type it. Deliberately the same PlaceSearch the destination step
                uses, so there is one search control in the app rather than a
                second, plainer one that appears only in the failure case. */}
            <div>
              <p className="mb-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("setLocation", "fallbackTitle")}
              </p>
              <PlaceSearch
                placeholder={t("setLocation", "fallbackSearchPlaceholder")}
                near={center}
                onSelect={(place) => {
                  pickKnown({ lat: place.lat, lng: place.lng }, place.label);
                }}
                onResults={setResults}
              />
            </div>
          </div>
        ) : null}

        {/* The held pin's confirm/discard pair. It sits above the search box because
            holding the map is the newest thing that happened, and a control the
            commuter has to go looking for is a control they will not find. */}
        {heldPin ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-3.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("setLocation", "heldPinTitle")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {formatCoords(heldPin)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                className="flex-1 rounded-full"
                disabled={heldPinDescribing}
                onClick={confirmHeldPin}
              >
                {heldPinDescribing ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : null}
                {t("setLocation", "confirmHeldPin")}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => setHeldPin(null)}
              >
                {t("setLocation", "discardHeldPin")}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Search belongs to the destination. Nobody searches for where they
            are standing, and a search box on the pickup screen invites picking
            the wrong end twice. */}
        {step === "destination" && !editing ? (
          <div className="mt-4 space-y-3">
            <PlaceSearch
              placeholder={t("setLocation", "searchPlaceholder")}
              near={prefill.pickup ?? center}
              value={point ? (address ?? "") : ""}
              onSelect={(place) => {
                // The label already came from the search, so there is nothing to
                // re-resolve — and re-resolving could quietly reword the place
                // the commuter just tapped.
                pickKnown({ lat: place.lat, lng: place.lng }, place.label);
              }}
              onResults={setResults}
            />

            {/* The on-device list first. It is the one that is on screen immediately —
                reading storage is synchronous, so these chips are in the same
                paint as the search box, which is what makes the search feel
                instant rather than like a form that loads. */}
            {recentLocal.rows.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                    {t("setLocation", "recentHereTitle")}
                  </p>
                  <button
                    type="button"
                    onClick={recentLocal.clear}
                    className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {t("setLocation", "clearRecents")}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recentLocal.rows.map((place) => (
                    <button
                      key={`${place.lat},${place.lng}`}
                      type="button"
                      onClick={() =>
                        pickKnown(
                          { lat: place.lat, lng: place.lng },
                          place.label,
                        )
                      }
                      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium tracking-tight transition-colors hover:bg-secondary"
                    >
                      <History aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{shortAddress(place.label)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Where this commuter actually goes, before they type anything.
                Retyping the same address for the same weekly trip is the
                friction this list exists to remove. */}
            {recents && recents.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {t("setLocation", "recentTitle")}
                </p>
                <div className="flex flex-wrap gap-2">
                  {recents.map((place) => (
                    <button
                      key={place._id}
                      type="button"
                      onClick={() =>
                        pickKnown(
                          { lat: place.lat, lng: place.lng },
                          place.address,
                        )
                      }
                      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium tracking-tight transition-colors hover:bg-secondary"
                    >
                      <History aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{shortAddress(place.address)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {point ? (
              <>
                <div className="flex flex-wrap gap-2">
                  {(savedPlaces ?? []).map((place) => (
                    <button
                      key={place._id}
                      type="button"
                      onClick={() =>
                        pickKnown(
                          { lat: place.lat, lng: place.lng },
                          place.address ?? place.label,
                        )
                      }
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium tracking-tight transition-colors hover:bg-secondary"
                    >
                      <Bookmark aria-hidden className="size-3.5" />
                      {place.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["Home", "Work"] as const).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() =>
                        void savePlace({
                          label: name,
                          lat: point.lat,
                          lng: point.lng,
                          address: address ?? undefined,
                        })
                      }
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs font-medium tracking-tight text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <HomeIcon aria-hidden className="size-3.5" />
                      {t("setLocation", "saveAs", { name })}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {/* How far, and how long. The whole point of finding a destination is being
            able to judge it, so the answer belongs next to the choice rather
            than two screens later. */}
            {tripKm !== null ? (
              <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3">
                <span className="flex items-center gap-2 text-sm tracking-tight">
                  <MapPin aria-hidden className="size-4 text-fetch-red" />
                  {formatDistance(tripKm)}
                </span>
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Clock aria-hidden className="size-3.5" />
                  {formatEta(estimateEtaMinutes(tripKm))}
                </span>
              </div>
          ) : null}

        {editing && step === "destination" ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {t("setLocation", "editingHint")}
          </p>
        ) : null}

        {outside ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl border border-fetch-gold bg-fetch-gold/20 px-3 py-2.5 text-xs leading-5">
            <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0 text-fetch-ink" />
            {t("setLocation", "outsideArea", {
              cities: LIVE_CITY_NAMES.join(" and "),
            })}
          </p>
        ) : null}

        <Button
          type="button"
          onClick={goNext}
          disabled={!canContinue}
          className={cn("mt-4 h-12 w-full rounded-full text-base font-bold")}
        >
          {step === "pickup"
            ? t("setLocation", "nextDestination")
            : t("setLocation", "nextReview")}
        </Button>

        {step === "pickup" && point ? (
          <button
            type="button"
            onClick={() => navigate(locationStepUrl("destination", searchParams))}
            className="mt-2 w-full py-2 text-xs font-medium tracking-tight text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("setLocation", "skipToDestination")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
