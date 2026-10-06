/**
 * The booking summary and the fare breakdown.
 *
 * ── Why a summary is separate from the fare block ──────────────────────────
 * The fare block answers "what does this cost". The summary answers "what am I
 * about to book" — pickup, drop-off, how far, how long, in which vehicle. Those
 * are the five facts a commuter re-reads the instant before tapping Book,
 * because that is the moment they realise they set the wrong pin. They have to
 * be visible together, above the button, and not scrolled half a screen away.
 *
 * ── Why every line of the breakdown is shown ───────────────────────────────
 * A single peso figure is a number nobody can argue with. A rider who is told
 * ₱147 and who drove three kilometres will dispute it, and the only answer
 * that survives that conversation is a receipt: the floor, the part that scales
 * with the road, the part that is demand right now, and the tax. Each line is
 * independently checkable against the tariff and the route the commuter is
 * looking at, so each line is independently trustworthy.
 *
 * Rows with a zero amount are dropped rather than shown as "₱0.00": an errand
 * with no surge, or a trip inside the included distance, would otherwise get
 * two lines of noise explaining that nothing happened.
 *
 * ── Why the breakdown is a prop, not a calculation ─────────────────────────
 * The page builds the `FareBreakdown` with the same tariff, distance and surge
 * the server will use. This component only formats it, so the total shown here
 * and the total charged are the same number rather than two calculations that
 * happen to agree today.
 */

import { cn } from "@/lib/utils";
import {
  Clock,
  CreditCard,
  Gauge,
  Receipt,
  Route as RouteIcon,
  TrendingUp,
  User,
} from "lucide-react";

import { formatDistance, formatPeso } from "@/lib/geo";
import {
  formatSurge,
  rideTypeSpec,
  type RideType,
} from "@/lib/fare-breakdown";
import { formatAddressLines, formatAddressSubtitle } from "@/lib/search";

/**
 * A place name in the shape a person reads it: the street on its own line,
 * then the town and area under it.
 *
 * The map's own pin label stays short on purpose — it has to fit in a bubble
 * over a pin — but the card underneath it has room, and this is the line a
 * commuter actually reads back to the rider over the phone. Falling back to the
 * raw string keeps a pin whose address has not resolved yet usable.
 */
export function AddressText({ label }: { label?: string | null }) {
  const { street } = formatAddressLines(label);
  const subtitle = formatAddressSubtitle(label);
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-medium tracking-tight">
        {street || label || "Dropped pin"}
      </p>
      {subtitle ? (
        <p className="truncate text-[11px] leading-4 text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The peso amounts to display.
 *
 * Structurally a subset of `FareBreakdown`, so a live quote can be passed
 * straight in, and so can the copy stored on the ride row — the confirmation
 * sheet shows the *stored* numbers rather than re-deriving them, which is what
 * makes the confirmation a receipt instead of a second estimate.
 */
export interface FareLines {
  baseFare: number;
  distanceFee: number;
  stopFee: number;
  surgeFee: number;
  tax: number;
  total: number;
  taxRatePct: number;
  riderPayout: number;
}

function Row({
  label,
  value,
  tone = "muted",
  icon,
}: {
  label: string;
  value: string;
  tone?: "muted" | "default" | "strong" | "surge";
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt
        className={cn(
          "flex items-center gap-1.5",
          tone === "strong" ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          tone === "strong" && "font-semibold text-foreground",
          tone === "surge" && "font-medium text-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function BookingSummary({
  pickup,
  destination,
  distanceKm,
  distanceSource,
  rideType,
  etaMinutes,
  fare,
  surgeMultiplier,
  passenger,
  bookerName,
  isBookingForOther = false,
  children,
}: {
  pickup?: string | null;
  destination?: string | null;
  distanceKm: number;
  /** "Road route" or "Straight line" — which geometry the fare was priced on. */
  distanceSource: "road" | "straight";
  rideType: RideType;
  etaMinutes: number;
  fare: FareLines | null;
  surgeMultiplier: number;
  /**
   * Who is riding, and whether that is somebody other than the account holder.
   *
   * Optional because this component is also used for the *receipt* after the
   * fact, where the booking step is long gone. Absent simply prints neither
   * line rather than guessing.
   */
  passenger?: { name?: string | null; phone?: string | null } | null;
  /**
   * The account holder paying for the trip.
   *
   * Printed as its own line even though it is usually the same person as the
   * passenger, because the two are only *usually* the same — and the whole
   * point of the row above is that a rider arriving at a pickup needs to know
   * which of the two names to ask for. Collapsing them into one line would put
   * that answer back where it started.
   */
  bookerName?: string | null;
  isBookingForOther?: boolean;
  /** Errand extras: item budget, shopping list, and so on. */
  children?: React.ReactNode;
}) {
  const spec = rideTypeSpec(rideType);
  const surge = formatSurge(surgeMultiplier);

  return (
    <div className="space-y-4">
      {/* ── What is being booked ─────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Booking summary
        </p>
        <div className="mt-2 space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
          <div className="flex gap-2.5">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-primary ring-4 ring-background"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Pickup
              </p>
              <AddressText label={pickup} />
            </div>
          </div>
          <div className="ml-[3.5px] h-3 border-l border-dashed border-border" aria-hidden />
          <div className="flex gap-2.5">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-muted-foreground ring-4 ring-background"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Destination
              </p>
              <AddressText label={destination} />
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <RouteIcon className="size-3" aria-hidden />
            {formatDistance(distanceKm)}
            {distanceSource === "straight" && distanceKm > 0 ? (
              <span className="opacity-70">· straight line</span>
            ) : null}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {etaMinutes > 0 ? `${etaMinutes} min away` : "—"}
          </span>
          <span className="flex items-center gap-1">
            <Gauge className="size-3" aria-hidden />
            {spec.name}
            {surge ? <span>· {surge} surge</span> : null}
          </span>
        </div>

        {/*
          Who is riding, and who is paying — stated next to the trip they belong
          to, and printed before the fare because it is the part of this summary
          that is not obvious. A ride being confirmed is not the same thing as
          the person paying for it being in the car.

          Both lines are kept even when they are the same person. The commuter
          skimming past the choice should still be able to tell from this screen
          whether somebody else is being picked up, and the rider reading the
          same ride needs one unambiguous line labelled "Passenger".
        */}
        {passenger?.name ? (
          <div className="mt-2.5 space-y-2 border-t border-border pt-2.5">
            <div className="flex items-start gap-2.5">
              <User className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Passenger
                </p>
                <p className="truncate text-sm tracking-tight">{passenger.name}</p>
                {passenger.phone ? (
                  <a
                    href={`tel:${passenger.phone}`}
                    className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {passenger.phone}
                  </a>
                ) : null}
              </div>
            </div>
            {bookerName ? (
              <div className="flex items-start gap-2.5">
                <CreditCard className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Booker
                  </p>
                  <p className="truncate text-sm tracking-tight">{bookerName}</p>
                  {isBookingForOther ? (
                    <p className="text-[11px] text-muted-foreground">
                      Paying for this ride
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── What it costs ─────────────────────────────────────────────────── */}
      {fare ? (
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Total fare
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
                {formatPeso(fare.total)}
              </p>
            </div>
            <p className="text-right text-[10px] leading-4 text-muted-foreground">
              {spec.name}
              <br />
              {distanceKm.toFixed(1)} km
            </p>
          </div>

          <dl className="mt-3 space-y-1.5 text-xs">
            <Row
              icon={<Receipt className="size-3" aria-hidden />}
              label="Base fare"
              value={formatPeso(fare.baseFare)}
            />
            {fare.distanceFee > 0 ? (
              <Row
                label={`Distance · ${distanceKm.toFixed(1)} km`}
                value={formatPeso(fare.distanceFee)}
              />
            ) : null}
            {fare.stopFee > 0 ? (
              <Row label="Store stop" value={formatPeso(fare.stopFee)} />
            ) : null}
            {fare.surgeFee > 0 ? (
              <Row
                icon={<TrendingUp className="size-3" aria-hidden />}
                label={`Surge ${surge ?? ""}`.trim()}
                value={formatPeso(fare.surgeFee)}
                tone="surge"
              />
            ) : null}
            {/* Nothing about tax while the rate is zero. A line reading "Tax (0%)
                ₱0.00" and a note explaining that a zero peso is VAT the
                government is receiving both make a trial fare look like a
                billing system that has something wrong in it. */}
            {fare.tax > 0 ? (
              <Row
                label={`Tax (${fare.taxRatePct}%)`}
                value={formatPeso(fare.tax)}
              />
            ) : null}
            <div className="!mt-2.5 flex items-center justify-between border-t border-border pt-2.5">
              <dt className="text-sm font-semibold tracking-tight">Total</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {formatPeso(fare.total)}
              </dd>
            </div>
          </dl>
          {/* Outside the `<dl>`: a description list may only contain term and
              description elements, and a commuter who cannot read why the
              total splits is exactly the commuter who disputes it. */}
          {fare.tax > 0 ? (
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              The rider takes home {formatPeso(fare.riderPayout)}; the{" "}
              {formatPeso(fare.tax)} is VAT collected for the government, not a
              rider fee.
            </p>
          ) : (
            /* Without tax there is nothing to explain: the fare is the fare.
                Still worth saying the whole thing goes to the rider, because
                during trial runs that is the question people ask. */
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              The rider takes the full {formatPeso(fare.riderPayout)}.
            </p>
          )}
        </div>
      ) : null}

      {children}
    </div>
  );
}
