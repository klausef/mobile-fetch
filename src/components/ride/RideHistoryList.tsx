import { StatusChip } from "@/components/ride/RideStatus";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { audienceForRole, ridesInGroup, serviceLabel } from "@/lib/booking";
import { formatDistance, formatPeso, shortAddress } from "@/lib/geo";
import { scheduleLabel } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { Loader2, ChevronRight } from "lucide-react";
import { Link } from "react-router";

type Row = {
  ride: Doc<"rides">;
  onSelect?: (ride: Doc<"rides">) => void;
  /** The service name in this viewer's words — "Padala" for a rider. */
  service: string;
};

/**
 * One trip in the list.
 *
 * Rendered as a button when the caller wants to open a detail view in place,
 * and as a link to Activity when it does not — which is what the header drawer
 * wants, since duplicating the whole detail dialog inside a drawer that a
 * phone can barely fit would be worse than one tap to open it.
 */
function RideRow({ ride, onSelect, service, now }: Row & { now: number }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {ride.code}
            {service ? ` · ${service}` : ""}
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
            {format(ride.requestedAt, "d MMM yyyy · HH:mm")}
          </span>
        </div>
        <p className="mt-1 truncate text-sm tracking-tight">
          {shortAddress(ride.pickup.address)} →{" "}
          {shortAddress(ride.destination.address)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistance(ride.distanceKm)}
          {/* A booking made for later is the one thing a commuter checking
              "is my 5pm ride still on" is looking for, so it is on the row
              rather than behind the dialog. */}
          {ride.scheduledFor ? ` · ${scheduleLabel(ride.scheduledFor, now)}` : null}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium tracking-tight">
          {ride.status === "COMPLETED" ? formatPeso(ride.fare) : "—"}
        </p>
        <div className="mt-1.5">
          <StatusChip status={ride.status} />
        </div>
      </div>
      {/* The rows are tappable and nothing else on the line says so. */}
      <ChevronRight
        className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
        aria-hidden
      />
    </>
  );

  if (!onSelect) {
    return (
      <li>
        <Link
          to="/activity"
          className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {body}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(ride)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {body}
      </button>
    </li>
  );
}

/**
 * Every trip this account has taken, newest first.
 *
 * Shared by the full history page and the header drawer so the two can never
 * show different trips or different wording.
 */
export function RideHistoryList({
  onSelect,
  emptyState,
  className,
  only,
}: {
  onSelect?: (ride: Doc<"rides">) => void;
  /**
   * Replaces the default "no trips yet" line. The full history page supplies a
   * richer one that knows the person's role and offers the right next step;
   * the drawer keeps the short line because it is only a glance.
   */
  emptyState?: React.ReactNode;
  className?: string;
  /**
   * Shows one half of the list. Activity renders "Ongoing" and "Past" as
   * separate sections from the same query, so the split lives here rather than
   * in a second component that could word a status differently.
   */
  only?: "ongoing" | "past";
}) {
  const rides = useQuery(api.rides.listMyRides);
  // The viewer's own role decides the wording, read here rather than passed in:
  // this list is rendered from three places (the page, the header drawer, and
  // both roles' history), and a `label` prop would be wrong the first time
  // somebody forgot it.
  const profile = useQuery(api.profiles.getMyProfile);
  // Unknown profile mid-creation: default to the passenger's word, which is
  // what the older, role-unaware wording showed.
  const audience = audienceForRole(profile?.role);

  // Both queries, not just the rides. They are separate subscriptions and
  // resolve independently, so waiting on rides alone let a rider's chip paint
  // "Pasugo" and then flip to "Padala" a frame later. The role decides the
  // word, so the role has to be in hand before the first row is.
  //
  // `null` is a real answer here (signed in, no profile row yet) and still
  // renders; only `undefined` means "still loading".
  if (rides === undefined || profile === undefined) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const visible = only ? ridesInGroup(rides, only) : rides;

  // "Now", read once, so a "Today" pickup time cannot change day between two
  // renders of the same list.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  if (visible.length === 0) {
    return (
      emptyState ?? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No trips yet. Your rides will show up here.
        </p>
      )
    );
  }

  return (
    <ul className={cn("divide-y divide-border", className)}>
      {visible.map((ride) => (
        <RideRow
          key={ride._id}
          ride={ride}
          onSelect={onSelect}
          service={serviceLabel(ride.bookingType, audience)}
          now={now}
        />
      ))}
    </ul>
  );
}
