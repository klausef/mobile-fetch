/**
 * The console's Dashboard: the four numbers, the live map, the latest trips.
 *
 * ── What is on this screen and why ─────────────────────────────────────────
 * An admin opening the console has one of three questions — how is the platform
 * doing, is anything stuck, who just finished. So the KPIs answer the first,
 * the live map answers the second, and the table answers the third, in that
 * order and above the fold.
 *
 * ── Why the KPIs are counts and not a growth percentage ────────────────────
 * "Revenue +12% week on week" is a number that is wrong more often than it is
 * right on a platform this size: one cancelled pabili moves it more than a
 * hundred rides. A raw count with its own window stated next to it ("₱4,820
 * today") can be checked against the ledger and cannot flatter anybody.
 *
 * ── Why the map is the console's own ───────────────────────────────────────
 * The commuter map answers "where am I going". This one answers "is anything
 * stuck" — a trip that has been `SEARCHING` for a long time is visible as a
 * pin sitting still, which is not something a table can show at a glance.
 */

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Banknote,
  Car,
  CheckCircle2,
  MapPin,
  Users,
  type LucideIcon,
} from "lucide-react";

import { MapView, type MapMarker } from "@/components/map/MapView";
import { Cell, DataTable, EmptyState, Panel, StatCard } from "@/components/admin/primitives";
import { formatPeso } from "@/lib/geo";
import { fitPoints } from "@/lib/search";
import { REGION } from "@/lib/region";
import { STATUS_LABEL } from "@/components/ride/RideStatus";

/** How long a trip may sit in SEARCHING before it is worth looking at. */
const STUCK_AFTER_MS = 10 * 60 * 1000;

function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.round(hours / 24)} d ago`;
}

export function OverviewTab() {
  const overview = useQuery(api.admin.getOverview);
  const live = useQuery(api.admin.listLiveRides);
  const analytics = useQuery(api.admin.getAnalytics, { bucket: "day" });
  // Read once per render of this screen rather than on an interval: the whole
  // point is that Convex pushes new rides here, so a clock would only make the
  // "N min ago" column lie between pushes.
  const [now] = useState(() => Date.now());

  const markers = useMemo<MapMarker[]>(() => {
    if (!live) return [];
    return live.flatMap((ride) => {
      const rows: MapMarker[] = [
        {
          id: `pickup-${ride._id}`,
          lat: ride.pickup.lat,
          lng: ride.pickup.lng,
          kind: "pickup",
        },
      ];
      // `riderGps`, not `rider`: who is driving and where the map can place them are
      // separate answers now, so an assigned rider with no signal is named on the
      // trip without being drawn on the map at a stale position.
      if (ride.riderGps) {
        rows.push({
          id: `rider-${ride._id}`,
          lat: ride.riderGps.lat,
          lng: ride.riderGps.lng,
          kind: "rider",
          heading: ride.riderGps.heading,
        });
      }
      return rows;
    });
  }, [live]);

  const frame = useMemo(() => {
    if (!live || live.length === 0) {
      return { center: REGION.center, zoom: 11 };
    }
    return (
      fitPoints([
        ...live.map((ride) => ride.pickup),
        ...live.map((ride) => ride.destination),
      ]) ?? { center: REGION.center, zoom: 11 }
    );
  }, [live]);

  // Above the loading guard, because a hook after an early return is a hook
  // that sometimes does not run.
  const drivers = useMemo(() => analytics?.topRiders.slice(0, 6) ?? [], [analytics]);

  if (!overview || !live || !analytics) {
    return <EmptyState title="Loading the console…" />;
  }

  const stuck = live.filter(
    (ride) =>
      ride.status === "SEARCHING" && now - ride.requestedAt > STUCK_AFTER_MS,
  );

  const kpis: { label: string; value: string; hint: string; icon: LucideIcon }[] = [
    {
      label: "Riders (drivers)",
      value: String(overview.approvedRiders),
      hint: `${overview.pendingRiders} awaiting approval · ${overview.onlineRiders} online`,
      icon: Car,
    },
    {
      label: "Passengers",
      value: String(overview.totalCommuters),
      hint: "Signed-up commuters",
      icon: Users,
    },
    {
      label: "Completed rides",
      value: String(overview.completedToday),
      hint: "Today",
      icon: CheckCircle2,
    },
    {
      label: "Service fees",
      value: formatPeso(overview.serviceFeesToday),
      hint: "Today, fares only",
      icon: Banknote,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            hint={kpi.hint}
            icon={kpi.icon}
          />
        ))}
      </div>

      {stuck.length > 0 ? (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-medium tracking-tight">
            {stuck.length} {stuck.length === 1 ? "trip has" : "trips have"} been
            waiting for a driver for over {STUCK_AFTER_MS / 60000} minutes.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {stuck
              .slice(0, 4)
              .map((ride) => `${ride.code} (${relativeTime(ride.requestedAt, now)})`)
              .join(" · ")}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Live trips"
          description={`${overview.searching} searching · ${overview.inProgress} in progress`}
          bodyClassName="-m-4 sm:-m-5"
        >
          <MapView
            center={frame.center}
            zoom={frame.zoom}
            markers={markers}
            interactive={false}
            className="h-[22rem] w-full"
          />
        </Panel>

        <Panel
          title="Revenue, last 7 days"
          description="Completed trips only — cancelled fares are not revenue."
          bodyClassName="h-[16rem] pb-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.series} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
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
              <Tooltip
                formatter={(value: number) => [formatPeso(value), "Fees"]}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  color: "var(--popover-foreground)",
                }}
              />
              <Bar dataKey="revenue" fill="var(--brand-red)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Live trips list" description="Everything not yet completed or cancelled.">
          {live.length === 0 ? (
            <EmptyState
              icon={MapPin}
              title="Nothing on the road"
              hint="Every request has been completed or cancelled."
            />
          ) : (
            <DataTable head={["Trip", "Status", "Service", "Requested", "Fare"]}>
              {live.map((ride) => (
                <tr key={ride._id}>
                  <Cell label="Trip">
                    <span className="font-medium">{ride.code}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {ride.rider ? ride.rider.name : "No rider yet"}
                    </span>
                  </Cell>
                  <Cell label="Status">
                    <span className="whitespace-nowrap">
                      {STATUS_LABEL[ride.status] ?? ride.status}
                    </span>
                  </Cell>
                  <Cell label="Service">{ride.bookingType}</Cell>
                  <Cell label="Requested">
                    {relativeTime(ride.requestedAt, now)}
                  </Cell>
                  <Cell label="Fare" className="tabular-nums">
                    {formatPeso(ride.fare)}
                  </Cell>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>

        <Panel
          title="Top riders"
          description="By what they earned, not by trip count."
        >
          {drivers.length === 0 ? (
            <EmptyState title="No completed trips yet" hint="The chart fills in as rides finish." />
          ) : (
            <div className="h-[16rem]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={drivers}
                  layout="vertical"
                  margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={96}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatPeso(value), "Earned"]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                    }}
                  />
                  <Bar dataKey="revenue" fill="var(--brand-blue)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}