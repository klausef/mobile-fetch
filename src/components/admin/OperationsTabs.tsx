/**
 * Fare Settings, Analytics, Rides and Settings.
 *
 * ── Why fares are edited per tariff row and not in a free-form box ─────────
 * A fare is `minimum + distance beyond the allowance + the errand floor`. Three
 * numbers that interact, and an admin who types them without seeing the
 * arithmetic changes how much every commuter is charged. So the form shows the
 * worked example beside each field — "a 5 km tricycle ride becomes ₱…" — and
 * the server re-validates every value before it is stored.
 *
 * ── Why the change history is kept rather than the old values ──────────────
 * The tariffs table already versions rows; a fare change adds a row and points
 * `isActive` at it. So "what did the per-km rate used to be" is answerable
 * without a separate history table that could disagree with the tariffs
 * themselves.
 *
 * ── Why Analytics offers day / week / month rather than one chart ──────────
 * They answer different questions. A day catches "Tuesday was quiet"; a month
 * catches "March did not work". One window chosen automatically is always
 * wrong for somebody, so the console asks.
 */

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Radio, Save } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Cell,
  DataTable,
  EmptyState,
  FilterChips,
  Panel,
} from "@/components/admin/primitives";
import { errorMessage } from "@/lib/errors";
import { fareBreakdown, rideTypeSpec } from "@/lib/fare-breakdown";
import { formatPeso } from "@/lib/geo";
import { DEFAULT_TARIFF } from "@/lib/geo";

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
} as const;

/* ── Fare settings ────────────────────────────────────────────────────────── */

export function FaresTab() {
  const tariffs = useQuery(api.admin.listTariffs);
  const update = useMutation(api.admin.updateTariff);
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  const active = tariffs?.find((row) => row.isActive) ?? null;
  // Seeded from the active row once, then owned by the form — an admin editing
  // a number must not have the field rewritten under them by a background
  // re-render of the tariff query.
  const values = form ?? {
    minFare: String(active?.minFare ?? DEFAULT_TARIFF.minFare),
    includedDistanceKm: String(
      active?.includedDistanceKm ?? DEFAULT_TARIFF.includedDistanceKm,
    ),
    ratePerKm: String(active?.ratePerKm ?? DEFAULT_TARIFF.ratePerKm),
    longTripThresholdKm: String(active?.longTripThresholdKm ?? ""),
    longTripRatePerKm: String(active?.longTripRatePerKm ?? ""),
    errandMinFare: String(active?.errandMinFare ?? DEFAULT_TARIFF.errandMinFare),
    stopFee: String(active?.stopFee ?? DEFAULT_TARIFF.stopFee),
  };

  const example = useMemo(() => {
    const tariff = {
      minFare: Number(values.minFare) || 0,
      includedDistanceKm: Number(values.includedDistanceKm) || 0,
      ratePerKm: Number(values.ratePerKm) || 0,
      // Blank means "no second band", which is a legitimate tariff — the same
      // behaviour as a row published before long trips were priced.
      longTripThresholdKm: values.longTripThresholdKm
        ? Number(values.longTripThresholdKm)
        : undefined,
      longTripRatePerKm: values.longTripRatePerKm
        ? Number(values.longTripRatePerKm)
        : undefined,
      errandMinFare: Number(values.errandMinFare) || 0,
      stopFee: Number(values.stopFee) || 0,
    };
    // Worked from the numbers actually in the form, so an admin changing a dial
    // sees the fare move before saving rather than after.
    //
    // Always a motorcycle: that is the only vehicle FETCH runs, and the chips
    // that used to let an admin preview a tricycle or a van were offering a
    // choice the booking screen does not have.
    const motorcycle = "motorcycle";
    const at = (km: number) =>
      fareBreakdown({ distanceKm: km, rideType: motorcycle, tariff }).total;
    // Three points chosen to straddle the structure: inside the included
    // distance, inside the first band, and past the long-trip mark.
    const rows = [
      { km: 3, total: at(3) },
      { km: 12, total: at(12) },
      { km: 15, total: at(15) },
    ];
    return {
      rows,
      spec: rideTypeSpec(motorcycle),
      baseFare: Number(values.minFare) || 0,
      included: Number(values.includedDistanceKm) || 0,
      rate: Number(values.ratePerKm) || 0,
      threshold: values.longTripThresholdKm
        ? Number(values.longTripThresholdKm)
        : null,
      longRate: values.longTripRatePerKm
        ? Number(values.longTripRatePerKm)
        : null,
    };
  }, [values]);

  const save = async () => {
    setBusy(true);
    try {
      await update({
        minFare: Number(values.minFare),
        includedDistanceKm: Number(values.includedDistanceKm),
        ratePerKm: Number(values.ratePerKm),
        longTripThresholdKm: values.longTripThresholdKm
          ? Number(values.longTripThresholdKm)
          : undefined,
        longTripRatePerKm: values.longTripRatePerKm
          ? Number(values.longTripRatePerKm)
          : undefined,
        errandMinFare: Number(values.errandMinFare),
        stopFee: Number(values.stopFee),
      });
      toast.success("Fares saved. Commuters are told the new rate.");
      setForm(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const fields: { key: string; label: string; hint: string }[] = [
    { key: "minFare", label: "Base fare", hint: "What every trip starts at." },
    {
      key: "includedDistanceKm",
      label: "Included distance (km)",
      hint: "Distance covered before the per-km rate applies.",
    },
    { key: "ratePerKm", label: "Rate per km", hint: "Applied beyond the included distance." },
    {
      key: "longTripThresholdKm",
      label: "Long trip from (km)",
      hint: "Where the higher rate starts. Leave blank to charge one flat rate.",
    },
    {
      key: "longTripRatePerKm",
      label: "Rate per km after that",
      hint: "Applied to the distance past the long-trip mark.",
    },
    { key: "errandMinFare", label: "Errand minimum", hint: "Floor for pabili and padala." },
    { key: "stopFee", label: "Store stop fee", hint: "Added once per errand." },
  ];

  return (
    <div className="space-y-4">
      <Panel
        title="Current tariff"
        description="Applies to every new booking. Existing trips keep the fare they were quoted."
        action={
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            <Save className="size-4" />
            Save
          </Button>
        }
      >
        {/* No vehicle chips. Every FETCH rider is on a motorcycle, so letting an admin
            preview a tricycle or a van was a choice the booking screen does not
            offer — and the one thing an admin would do with it is save a fare
            for a vehicle nobody drives. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type="number"
                inputMode="decimal"
                value={values[field.key]}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...(prev ?? values),
                    [field.key]: event.target.value,
                  }))
                }
              />
              <p className="text-[10px] leading-4 text-muted-foreground">
                {field.hint}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3">
          <p className="text-[11px] font-medium tracking-tight">
            Worked example · {example.spec.name}
          </p>

          {/* How the fare is built, before any numbers. The old line — "a 3 km
              trip becomes ₱42" — read as breaking the ₱60 minimum, because it
              never said a motorcycle tariff is a share of the base fare. Stating
              the multiplier is what makes the first row legible. */}
          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
            <li>
              The {formatPeso(example.baseFare)} base covers{" "}
              {example.included} km — nothing extra inside that.
            </li>
            <li>
              Up to {example.threshold ?? "—"} km, the rest is charged at{" "}
              {formatPeso(example.rate)}/km.
            </li>
            <li>
              {example.longRate
                ? `Past ${example.threshold} km it is ${formatPeso(example.longRate)}/km.`
                : "No long-trip band is set, so one rate applies all the way."}
            </li>
            <li className="pt-1">
              A {example.spec.name.toLowerCase()} fare is{" "}
              {Math.round((1 - example.spec.fareMultiplier) * 100)}% below the
              base above — that is why a short trip can come out under{" "}
              {formatPeso(Number(values.minFare) || 0)}.
            </li>
          </ul>

          <dl className="mt-2.5 space-y-1 border-t border-border pt-2.5">
            {example.rows.map((row) => (
              <div
                key={row.km}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <dt className="text-muted-foreground">
                  {row.km} km trip
                  {row.km <= example.included
                    ? " — inside the included distance"
                    : example.threshold && row.km > example.threshold
                      ? " — past the long-trip mark"
                      : ""}
                </dt>
                <dd className="font-semibold text-foreground tabular-nums">
                  {formatPeso(row.total)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Panel>

      <Panel title="Change history" description="Every tariff version, newest first.">
        {!tariffs ? (
          <EmptyState title="Loading tariffs…" />
        ) : tariffs.length === 0 ? (
          <EmptyState title="No tariffs yet" hint="The shipped defaults are in force." />
        ) : (
          <DataTable
            head={[
              "From",
              "Base",
              "Included",
              "Per km",
              "Long from",
              "After",
              "Errand",
              "Stop",
              "Active",
            ]}
          >
            {tariffs.map((row) => (
              <tr key={row._id}>
                <Cell label="From">
                  {new Date(row.createdAt).toLocaleDateString("en-PH", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </Cell>
                <Cell label="Base" className="tabular-nums">
                  {formatPeso(row.minFare)}
                </Cell>
                <Cell label="Included" className="tabular-nums">
                  {row.includedDistanceKm} km
                </Cell>
                <Cell label="Per km" className="tabular-nums">
                  {formatPeso(row.ratePerKm)}
                </Cell>
                {/* Both dials or neither, so they are shown together and read as
                    one setting rather than as two unrelated numbers. A dash is a
                    real state — the version has a single flat rate. */}
                <Cell label="Long from" className="tabular-nums">
                  {row.longTripThresholdKm ? `${row.longTripThresholdKm} km` : "—"}
                </Cell>
                <Cell label="After" className="tabular-nums">
                  {row.longTripRatePerKm ? formatPeso(row.longTripRatePerKm) : "—"}
                </Cell>
                <Cell label="Errand" className="tabular-nums">
                  {formatPeso(row.errandMinFare)}
                </Cell>
                <Cell label="Stop" className="tabular-nums">
                  {formatPeso(row.stopFee)}
                </Cell>
                <Cell label="Active">
                  {row.isActive ? (
                    <span className="whitespace-nowrap text-primary">In force</span>
                  ) : (
                    <span className="whitespace-nowrap text-muted-foreground">—</span>
                  )}
                </Cell>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}

/* ── Analytics ────────────────────────────────────────────────────────────── */

type Bucket = "day" | "week" | "month";

export function AnalyticsTab() {
  const [bucket, setBucket] = useState<Bucket>("day");
  const analytics = useQuery(api.admin.getAnalytics, { bucket });

  return (
    <div className="space-y-4">
      <Panel
        title="Revenue"
        description={
          analytics
            ? `${formatPeso(analytics.totalRevenue)} across ${analytics.totalRides} completed trips.`
            : undefined
        }
        action={
          <FilterChips<Bucket>
            ariaLabel="Revenue window"
            value={bucket}
            onChange={setBucket}
            options={[
              { value: "day", label: "Daily" },
              { value: "week", label: "Weekly" },
              { value: "month", label: "Monthly" },
            ]}
          />
        }
        bodyClassName="h-[20rem] pb-2"
      >
        {analytics ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={analytics.series} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={56}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="var(--brand-red)"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
              <Line
                type="monotone"
                dataKey="rides"
                stroke="var(--brand-blue)"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState title="Loading analytics…" />
        )}
      </Panel>

      <Panel title="Top riders" description="By earnings over the scanned window.">
        {!analytics || analytics.topRiders.length === 0 ? (
          <EmptyState title="No completed trips yet" />
        ) : (
          <DataTable head={["Rider", "Trips", "Earned"]}>
            {analytics.topRiders.map((row) => (
              <tr key={row.userId}>
                <Cell label="Rider">{row.name}</Cell>
                <Cell label="Trips" className="tabular-nums">
                  {row.rides}
                </Cell>
                <Cell label="Earned" className="tabular-nums">
                  {formatPeso(row.revenue)}
                </Cell>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
    </div>
  );
}

/* ── Rides ────────────────────────────────────────────────────────────────── */

type RideFilter = "active" | "all";

/**
 * Columns on the live-rides table.
 *
 * Who is driving and how to reach them are in here because a console showing
 * only a trip code cannot answer the two questions that arrive with a support
 * call: which rider accepted this, and what is their number. The passenger's
 * details are here for the same reason from the other end — usually the person
 * who rang is the one who booked it.
 *
 * The rider cell is deliberately not tied to the GPS. A rider who accepted and
 * then lost signal is still the rider on that trip, and a dash there would hide
 * the one row most worth tracing. Identity comes from `listLiveRides`' `rider`;
 * only the console map reads `riderGps`, because only the map needs a position.
 */
const RIDE_HEADERS = [
  "Trip",
  "Requested",
  "Status",
  "Rider",
  "Rider phone",
  "Passenger",
  "Passenger phone",
  "Pickup",
  "Destination",
  "Fare",
];

export function RidesTab() {
  const [filter, setFilter] = useState<RideFilter>("active");
  const live = useQuery(api.admin.listLiveRides);
  const exportCsv = useMutation(api.admin.exportRidesCsv);
  const [busy, setBusy] = useState(false);

  const exportFile = async () => {
    setBusy(true);
    try {
      const { csv, count } = await exportCsv({});
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "fetch-rides.csv";
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${count} trips.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Rides"
      description={
        filter === "active"
          ? "Everything still on the road. Completed trips are in the CSV export."
          : undefined
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <FilterChips<RideFilter>
            ariaLabel="Filter rides"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "active", label: "Active" },
              { value: "all", label: "All" },
            ]}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportFile()}>
            <Download className="size-4" />
            Export CSV
          </Button>
        </div>
      }
    >
      {filter === "all" ? (
        <EmptyState
          icon={Download}
          title="Completed history lives in the export"
          hint="The export is built on the server so its columns are a deliberate choice, not whatever a screen happens to have loaded. Use Analytics for on-screen totals."
        />
      ) : !live ? (
        <EmptyState title="Loading rides…" />
      ) : live.length === 0 ? (
        <EmptyState icon={Radio} title="Nothing on the road" hint="No active bookings right now." />
      ) : (
        <DataTable head={RIDE_HEADERS}>
          {live.map((ride) => (
            <tr key={ride._id}>
              <Cell label="Trip">
                <span className="font-medium">{ride.code}</span>
              </Cell>
              <Cell label="Requested">
                <span className="whitespace-nowrap text-muted-foreground">
                  {new Date(ride.requestedAt).toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </Cell>
              <Cell label="Status">
                <span className="whitespace-nowrap capitalize">
                  {ride.status.replace(/_/g, " ").toLowerCase()}
                </span>
              </Cell>
              <Cell label="Rider">
                <span className="line-clamp-1">
                  {ride.rider?.name ?? (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </span>
              </Cell>
              <Cell label="Rider phone" className="tabular-nums">
                {ride.rider?.phone ? (
                  <a
                    href={`tel:${ride.rider.phone}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {ride.rider.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Cell>
              <Cell label="Passenger">
                <span className="line-clamp-1">
                  {ride.commuter?.name ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </span>
              </Cell>
              <Cell label="Passenger phone" className="tabular-nums">
                {ride.commuter?.phone ? (
                  <a
                    href={`tel:${ride.commuter.phone}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {ride.commuter.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Cell>
              <Cell label="Pickup" className="max-w-[12rem]">
                <span className="line-clamp-1">{ride.pickupLabel}</span>
              </Cell>
              <Cell label="Destination" className="max-w-[12rem]">
                <span className="line-clamp-1">{ride.destinationLabel}</span>
              </Cell>
              <Cell label="Fare" className="tabular-nums">
                {formatPeso(ride.fare)}
              </Cell>
            </tr>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

export function SettingsTab() {
  const overview = useQuery(api.admin.getOverview);
  const limits = useMutation(api.admin.updateBookingLimits);
  const setOpen = useMutation(api.admin.setBookingsOpen);
  const setAutoApprove = useMutation(api.admin.setAutoApproveRiders);
  const broadcast = useMutation(api.admin.postBroadcast);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const current = overview?.limits;
  const [maxConcurrent, setMaxConcurrent] = useState<string | null>(null);
  const [maxDetour, setMaxDetour] = useState<string | null>(null);

  const saveLimits = async () => {
    setBusy(true);
    try {
      await limits({
        maxConcurrentRides: Number(maxConcurrent ?? current?.maxConcurrentRides ?? 2),
        maxSecondRideDetourKm: Number(
          maxDetour ?? current?.maxSecondRideDetourKm ?? 1,
        ),
      });
      toast.success("Limits saved.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const sendBroadcast = async () => {
    if (draft.trim().length === 0) return;
    setBusy(true);
    try {
      await broadcast({
        audience: "all",
        title: "From Fetch",
        body: draft.trim(),
      });
      setDraft("");
      toast.success("Announcement sent.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel title="Bookings" description="Turn the whole platform off in an emergency.">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium tracking-tight">
              {overview?.bookingsOpen ? "Accepting bookings" : "Bookings closed"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Closing hides the app from passengers but leaves active trips running.
            </p>
          </div>
          <Button
            variant={overview?.bookingsOpen ? "outline" : "default"}
            onClick={() => void setOpen({ open: !overview?.bookingsOpen })}
          >
            {overview?.bookingsOpen ? "Close bookings" : "Open bookings"}
          </Button>
        </div>
      </Panel>

      <Panel
        title="Driver approval"
        description="Whether a new driver waits for a Super Admin before they can drive."
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium tracking-tight">
              {overview?.autoApproveRiders
                ? "New drivers are approved automatically"
                : "New drivers wait in the queue"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {overview?.autoApproveRiders
                ? "On for the testing phase. Turn this off before launch so every driver is reviewed before they carry passengers."
                : "Every applicant is reviewed in the Driver Documents tab before they can go online."}
            </p>
          </div>
          <Button
            variant={overview?.autoApproveRiders ? "outline" : "default"}
            disabled={busy}
            onClick={() =>
              void setAutoApprove({ enabled: !overview?.autoApproveRiders })
                .then(() => toast.success("Driver approval updated."))
                .catch((error) => toast.error(errorMessage(error)))
            }
          >
            {overview?.autoApproveRiders ? "Require approval" : "Auto-approve"}
          </Button>
        </div>
      </Panel>

      <Panel
        title="Rider limits"
        description="How much work one rider may hold at once."
        action={
          <Button size="sm" disabled={busy} onClick={() => void saveLimits()}>
            <Save className="size-4" />
            Save
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="max-rides">Concurrent rides per rider</Label>
            <Input
              id="max-rides"
              type="number"
              inputMode="numeric"
              value={
                maxConcurrent ?? String(current?.maxConcurrentRides ?? 2)
              }
              onChange={(event) => setMaxConcurrent(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max-detour">Second-ride detour (km)</Label>
            <Input
              id="max-detour"
              type="number"
              inputMode="decimal"
              step="0.1"
              value={
                maxDetour ?? String(current?.maxSecondRideDetourKm ?? 1)
              }
              onChange={(event) => setMaxDetour(event.target.value)}
            />
          </div>
        </div>
      </Panel>

      <Panel title="Announcement" description="Sent to every user.">
        <div className="space-y-2">
          <Label htmlFor="announcement">Message</Label>
          <Input
            id="announcement"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Service update, holiday hours…"
          />
          <Button
            size="sm"
            disabled={busy || draft.trim().length === 0}
            onClick={() => void sendBroadcast()}
          >
            Send to everyone
          </Button>
        </div>
      </Panel>
    </div>
  );
}