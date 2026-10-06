/**
 * The rider's numbers, as their own tab.
 *
 * ── Why this is not the booking screen ────────────────────────────────────
 * The booking screen is a work surface: a map, a go-online switch and the offers
 * arriving. A rider opens it between trips to see whether they are visible and
 * to take the next job. The earnings panel, the rating and the vehicle record
 * answer a different question — "did today pay, and how am I doing" — which gets
 * asked at the end of a shift, not while waiting for an offer.
 *
 * They shared one screen, and the cost was that the earnings panel sat directly
 * under the fold on the screen whose entire job is the next request. Worse, the
 * numbers competed with the map for the same thumb: a rider going online did not
 * need to be shown their average rating first.
 *
 * ── Why the vehicle record lives here ─────────────────────────────────────
 * Editing a vehicle is not a between-trips action, and the form is long. It also
 * still has to be reachable from the booking screen, because "go online" is
 * disabled without a vehicle — so the booking screen keeps a link here rather
 * than a second copy of the form.
 *
 * The queries are the same ones the booking screen already runs. Convex
 * subscriptions are per-component, so this tab costs a second read of a small
 * set of rows when a rider is on it, and nothing while they are not.
 */

import { api } from "@/convex/_generated/api";
import { AppShell } from "@/components/AppShell";
import {
  ApprovalGate,
  canShowRiderSurfaces,
} from "@/components/ride/ApprovalGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { errorMessage } from "@/lib/errors";
import { formatDuration } from "@/lib/driver";
import { formatPeso } from "@/lib/geo";
import { useMutation, useQuery } from "convex/react";
import { Clock, Star, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";

export default function RiderOverview() {
  const profile = useQuery(api.profiles.getMyProfile);
  const { isAdmin } = useOwnerAdmin();
  const rider = useQuery(api.riders.getMyRider);
  const isGuest = useQuery(api.profiles.isGuest);
  const stats = useQuery(api.riders.getDriverStats);
  const earnings = useQuery(api.rides.riderEarnings);
  const allRides = useQuery(api.rides.listMyRides);
  // `listMyRides` takes no arguments and returns the last 50, newest first.
  // Narrowed here rather than by widening the query's contract for one caller.
  const recent = (allRides ?? []).slice(0, 5);
  const saveVehicle = useMutation(api.riders.saveVehicle);
  const [saving, setSaving] = useState(false);

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
      <main className="flex min-h-dvh items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </main>
    );
  }

  // The same two rules the booking screen applies, so a rider cannot reach this
  // tab in a state the rest of the app would not let them be in.
  if (profile === null) return <Navigate to="/onboarding" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (profile.role !== "rider") return <Navigate to="/app" replace />;

  // A rider profile with no rider row is a real state — the row is written when
  // the application completes, and a suspension can leave one missing. Handled
  // as its own screen rather than dereferenced, because every number on this
  // page is read off that row.
  if (!rider) {
    return (
      <AppShell bottomActiveKey="dashboard">
        <div className="mx-auto max-w-md px-6 py-16 text-center">
          <p className="text-sm font-medium tracking-tight">
            Rider profile unavailable
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            We could not load the rider record for this account.
          </p>
        </div>
      </AppShell>
    );
  }

  // Everything below is money and standing, so it is behind the same approval
  // wall as the booking screen. This tab used to be reachable by a rider the
  // console had declined or suspended: their earnings were on it, and so was the
  // vehicle editor a passenger would have been told about. Hiding the screen is
  // the friendly half — `riderEarnings` and `getDriverStats` refuse to return a
  // number for an unapproved rider even if this markup is fetched directly.
  if (!canShowRiderSurfaces(rider.approval, isGuest)) {
    return <ApprovalGate approval={rider.approval} bottomActiveKey="dashboard" />;
  }

  const hasVehicle = rider.vehicle.make !== "—";

  const handleSaveVehicle = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await saveVehicle({
        make: String(data.get("make") ?? ""),
        model: String(data.get("model") ?? ""),
        plate: String(data.get("plate") ?? ""),
        color: String(data.get("color") ?? ""),
      });
      toast.success("Vehicle saved");
    } catch (err) {
      toast.error(errorMessage(err, "Could not save your vehicle."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell bottomActiveKey="dashboard">
      <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-5 sm:py-5">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your earnings, your rating, and the vehicle passengers see.
        </p>

        {/* Earnings. Dark, and first: this is the number the rider opened the
            tab for. */}
        <section className="mt-4 rounded-2xl border border-border/70 bg-fetch-ink p-4 text-white sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/60">
              Earnings today
            </p>
            <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-white/60">
              <Clock className="size-3" />
              {formatDuration(stats?.onlineMsToday ?? 0)} online
            </p>
          </div>
          <p className="mt-2 text-4xl font-bold tracking-tight">
            {formatPeso(earnings?.today ?? 0)}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-3.5">
            <Stat
              label="Trips today"
              value={String(earnings?.todayCount ?? 0)}
            />
            <Stat label="This week" value={formatPeso(earnings?.week ?? 0)} />
            <Stat
              label="Your rating"
              value={stats?.rating ? stats.rating.avg.toFixed(1) : "—"}
            />
          </div>
        </section>

        {/* Rating and lifetime trips. Split out of the earnings card because
            they do not move within a day, and a rider comparing themselves
            across trips reads them, not today's pesos. */}
        <section className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <Star className="size-3 fill-fetch-gold text-fetch-gold" />
              Rating
            </div>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
              {stats?.rating ? stats.rating.avg.toFixed(1) : "—"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {stats?.rating
                ? `${stats.rating.count} ${
                    stats.rating.count === 1 ? "rating" : "ratings"
                  }`
                : "No ratings yet"}
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <TrendingUp className="size-3 text-muted-foreground" />
              Trips done
            </div>
            <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
              {stats?.completedCount ?? 0}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              All time
            </p>
          </div>
        </section>

        {/* The vehicle. Editing lives here rather than on the booking screen,
            but the booking screen links to it, because going online is disabled
            without a vehicle and that screen is where somebody discovers it. */}
        <section className="mt-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                Vehicle
              </p>
              <p className="mt-0.5 truncate text-sm tracking-tight">
                {hasVehicle
                  ? `${rider.vehicle.color} ${rider.vehicle.make} ${rider.vehicle.model}`
                  : "Not added yet"}
              </p>
            </div>
            {hasVehicle ? (
              <span className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1 text-sm font-semibold tracking-wide">
                {rider.vehicle.plate}
              </span>
            ) : null}
          </div>

          {!hasVehicle ? (
            <form onSubmit={handleSaveVehicle} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ov-make">Make</Label>
                  <Input id="ov-make" name="make" required maxLength={40} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ov-model">Model</Label>
                  <Input id="ov-model" name="model" required maxLength={40} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ov-color">Colour</Label>
                  <Input id="ov-color" name="color" required maxLength={30} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ov-plate">Plate number</Label>
                  <Input
                    id="ov-plate"
                    name="plate"
                    required
                    maxLength={20}
                    className="uppercase"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Saving…" : "Save vehicle"}
              </Button>
            </form>
          ) : null}
        </section>

        {/* Recent trips. A short list, not the full history: the Trips tab is
            one tap away and is where somebody goes looking for a receipt. */}
        <section className="mt-4 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Recent trips
          </p>            {(recent ?? []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No trips yet. Your completed rides will show up here.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border/60">
              {recent.map((ride) => (
                <li
                  key={ride._id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm tracking-tight">
                      {ride.code}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {ride.destination.address}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tracking-tight tabular-nums">
                      {formatPeso(ride.fare)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {ride.status === "COMPLETED" ? "Paid" : ride.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* The vehicle form above is the copy of this screen that matters for a
            rider who cannot get online; the booking screen links here rather
            than carrying its own. */}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/50">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium tracking-tight">
        {value}
      </p>
    </div>
  );
}
