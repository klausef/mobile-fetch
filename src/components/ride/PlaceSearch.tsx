import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LatLng } from "@/lib/map-service";
import { searchPlaces, type Place } from "@/lib/map-service";
import {
  highlightMatches,
  MIN_QUERY_LENGTH,
  splitPlaceLabel,
} from "@/lib/search";
import { Check, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Re-exported so callers use the same threshold the hook searches with. */
export { MIN_QUERY_LENGTH };

/** Fewer than this many characters is not worth a request. */
const MIN_QUERY = MIN_QUERY_LENGTH;

type SearchStatus = "idle" | "loading" | "error";

/**
 * Debounced place lookup, shared by the plain search box and the field variant
 * so the two can never drift on throttling, minimum length, or error handling.
 */
function usePlaceSearch(near?: LatLng) {
  const [query, setQueryState] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [open, setOpen] = useState(false);

  // `near` is an object that changes identity on every render; depend on its
  // coordinates so a pan does not restart the debounce, and the lint rule stays
  // satisfied without disabling it.
  const nearLat = near?.lat;
  const nearLng = near?.lng;
  useEffect(() => {
    if (query.trim().length < MIN_QUERY) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const places = await searchPlaces(query, {
          lat: nearLat as number,
          lng: nearLng as number,
        });
        if (!cancelled) {
          setResults(places);
          setStatus("idle");
          setOpen(true);
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setStatus("error");
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, nearLat, nearLng]);

  /** Called on every keystroke: keeps the query, results, and status in step. */
  const onQueryChange = (next: string) => {
    setQuery(next);
    setOpen(true);
    if (next.trim().length < MIN_QUERY) {
      setResults([]);
      setStatus("idle");
    } else {
      setStatus("loading");
    }
  };

  /**
   * Replace the text without opening the suggestion panel.
   *
   * For when the address changed because something else moved the pin, not
   * because the user is typing. Opening the panel there would flash a stale
   * result list at someone who never searched.
   */
  const setQuery = (next: string) => {
    setQueryState(next);
    setOpen(false);
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setStatus("idle");
    setOpen(false);
  };

  return {
    query,
    results,
    status,
    open,
    onQueryChange,
    setQuery,
    clear,
    close: () => setOpen(false),
    show: () => setOpen(true),
    /** True when there is enough text to search and the panel should render. */
    shouldShowResults: open && query.trim().length >= MIN_QUERY,
  };
}

/** Closes the suggestion panel when a click lands outside the field. */
function useDismissOnOutsideClick(
  containerRef: React.RefObject<HTMLDivElement | null>,
  close: () => void,
) {
  useEffect(() => {
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [containerRef, close]);
}

interface PlaceSearchProps {
  placeholder?: string;
  near?: LatLng;
  onSelect: (place: Place) => void;
  disabled?: boolean;
  /**
   * Text already associated with this field, shown until the user types. This
   * is what turns the input from "empty box" into a field that reads as the
   * address it currently holds.
   */
  value?: string;
  /**
   * The result list, every time it changes.
   *
   * Lets the screen draw the results on the map alongside the dropdown, so a
   * commuter looking at pins rather than at a list can pick the place where
   * they can actually see it. Called with [] when the search is cleared, which
   * is the caller's cue to take the pins back down.
   *
   * Expected to be stable (a `setState`), since it is an effect dependency.
   */
  onResults?: (places: Place[]) => void;
}

export function PlaceSearch({
  placeholder = "Search for an address",
  near,
  onSelect,
  disabled,
  value = "",
  onResults,
}: PlaceSearchProps) {
  const search = usePlaceSearch(near);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideClick(containerRef, search.close);

  const results = search.results;
  useEffect(() => {
    onResults?.(results);
  }, [results, onResults]);

  // The field displays the address it currently holds, so the text has to follow
// `value` whenever that changes from outside — GPS, a dragged pin, a swap, or a
// clear. Latching the text on mount left it showing a stale address: a commuter
// could read one street while the pin sat on another, on the screen that
// decides where their rider goes.
  const [syncedValue, setSyncedValue] = useState<string | undefined>(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    search.setQuery(value ?? "");
    search.close();
  }

  return (
    <div ref={containerRef} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={search.query}
        onChange={(e) => search.onQueryChange(e.target.value)}
        onFocus={() => search.results.length > 0 && search.show()}
        placeholder={placeholder}
        disabled={disabled}
        className="pl-9 pr-9"
      />
      {search.query ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={search.clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}

      <Results
        open={search.shouldShowResults}
        status={search.status}
        results={search.results}
        query={search.query}
        onPick={(place) => {
          onSelect(place);
          search.onQueryChange(place.label);
          search.close();
        }}
      />
    </div>
  );
}

/**
 * Text with the parts matching the query in bold.
 *
 * Every occurrence, not just the first — see `highlightMatches`. Rendered as
 * spans rather than by injecting markup into the label, so a place name
 * containing an angle bracket cannot become an element.
 */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlightMatches(text, query).map((part, index) => (
        <span
          key={index}
          className={part.match ? "font-bold text-foreground" : undefined}
        >
          {part.text}
        </span>
      ))}
    </>
  );
}

/**
 * One suggestion row: what it is on the left, where it is underneath.
 *
 * Split into "24 Poblacion Road" / "Malaybalay City, Bukidnon" because that is
 * how a place is actually recognised — the street identifies it, the town says
 * whether it is even the right trip. Printed as one blob, a dropdown of
 * Philippine addresses is several indistinguishable lines of comma-separated
 * text and the eye gives up after two rows.
 */
function ResultRow({
  place,
  query,
  onPick,
}: {
  place: Place;
  query: string;
  onPick: (place: Place) => void;
}) {
  const { primary, area, region } = splitPlaceLabel(place.label);
  const secondary = [area, region].filter(Boolean).join(", ");
  return (
    <button
      type="button"
      onClick={() => onPick(place)}
      className="flex w-full items-start gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-secondary"
    >
      <Search aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm leading-5">
          <Highlighted text={primary} query={query} />
        </span>
        {secondary && secondary !== primary ? (
          <span className="block truncate text-[11px] leading-4 text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** The suggestion list, shared by the plain search and the field variant. */
function Results({
  open,
  status,
  results,
  query,
  onPick,
}: {
  open: boolean;
  status: "idle" | "loading" | "error";
  results: Place[];
  query: string;
  onPick: (place: Place) => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-x-0 top-[calc(100%+6px)] z-40 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
      {status === "loading" ? (
        <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Searching…
        </div>
      ) : null}
      {status === "error" ? (
        <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
          Address search is unavailable right now. Tap the map to set your
          destination instead.
        </p>
      ) : null}
      {status === "idle" && results.length === 0 ? (
        <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">
          No matches. Try a landmark, or hold the map to drop a pin.
        </p>
      ) : null}
      {status === "idle"
        ? results.map((place) => (
            <ResultRow
              key={`${place.lat},${place.lng}`}
              place={place}
              query={query}
              onPick={onPick}
            />
          ))
        : null}
    </div>
  );
}

/**
 * A pickup or drop-off field that *is* the search box.
 *
 * The old layout showed a read-only address row with a separate search input
 * underneath, so pinning a place and then changing your mind meant working out
 * which control to use. Here the address and the search are the same control:
 * it displays what is pinned, and typing in it searches.
 *
 * `key` on the caller should change with the field's identity (pickup vs
 * destination) so switching fields re-seeds the text.
 */
export function PlaceField({
  label,
  value,
  placeholder,
  near,
  onSelect,
  onClear,
  onUseLocation,
  locating = false,
  locationHint = "Use my current location",
  disabled,
  step,
  active,
}: {
  /** Small uppercase caption, e.g. "Pickup". */
  label: string;
  /** Address currently pinned to this field. */
  value?: string;
  placeholder?: string;
  near?: LatLng;
  onSelect: (place: Place) => void;
  onClear?: () => void;
  /** Pins the current position — the button a commuter reaches for first. */
  onUseLocation?: () => void;
  locating?: boolean;
  locationHint?: string;
  disabled?: boolean;
  active?: boolean;
  /**
   * Position in the booking flow (1, 2, ...). Shown as a badge that turns into
   * a tick once the field is filled, so it is obvious what comes next.
   */
  step?: number;
}) {
  const search = usePlaceSearch(near);
  const containerRef = useRef<HTMLDivElement>(null);
  useDismissOnOutsideClick(containerRef, search.close);

  // See the note in PlaceSearch: the displayed text tracks the pinned address.
  const [syncedValue, setSyncedValue] = useState<string | undefined>(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    search.setQuery(value ?? "");
    search.close();
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        // py-3 rather than py-2.5: the field is a touch target, not a text row.
        "relative flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors",
        active ? "border-foreground" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          value
            ? "bg-fetch-red/10 text-fetch-red"
            : "bg-secondary text-muted-foreground",
        )}
      >
        {value ? <Check className="size-3.5" /> : (step ?? <LocateIcon />)}
      </span>

      <div className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search.query}
            onChange={(e) => search.onQueryChange(e.target.value)}
            onFocus={() => search.results.length > 0 && search.show()}
            placeholder={placeholder}
            disabled={disabled}
            aria-label={label}
            className="h-6 w-full truncate border-0 bg-transparent p-0 pl-5 text-sm tracking-tight outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      </div>

      {onUseLocation ? (
        <button
          type="button"
          onClick={onUseLocation}
          disabled={disabled || locating}
          title={locationHint}
          aria-label={locationHint}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LocateIcon />
          )}
        </button>
      ) : null}

      {onClear && value ? (
        <button
          type="button"
          onClick={onClear}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      ) : null}

      <Results
        open={search.shouldShowResults}
        status={search.status}
        results={search.results}
        query={search.query}
        onPick={(place) => {
          onSelect(place);
          search.onQueryChange(place.label);
          search.close();
        }}
      />
    </div>
  );
}

/** Crosshair-with-a-dot: reads as "put a pin here" rather than "use GPS". */
function LocateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <circle cx="12" cy="10" r="3" />
      <path d="M12 2v3" />
      <path d="M12 15v3" />
      <path d="M4.2 4.2l2.1 2.1" />
      <path d="M17.7 6.3l2.1-2.1" />
      <path d="M8 22h8l-2-4H10l-2 4z" />
    </svg>
  );
}