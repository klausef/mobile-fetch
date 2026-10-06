/**
 * The super admin console.
 *
 * ── What this file is ──────────────────────────────────────────────────────
 * A shell and nothing else: a sidebar of sections, the one panel the admin has
 * chosen, and the account checks that decide whether they get to see it. Every
 * section's contents live in `src/components/admin`, so this file stays small
 * enough to read in one go — which matters more than usual here, because it is
 * the one screen where a mistake reaches somebody else's account.
 *
 * ── Why the section is component state rather than a route ─────────────────
 * See `AdminSidebar`. A console URL is a thing that ends up in screenshots.
 *
 * ── Why the admin check runs before anything renders ───────────────────────
 * `RequireAuth` only proves there is a session. Super admin is a narrower
 * claim — an owner by email address *or* an admin profile — and both are
 * checked here so a stale riding profile cannot pull the owner into the
 * passenger app while their console is open.
 */

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router";

import { AppShell } from "@/components/AppShell";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { AdminSidebar, type AdminSection } from "@/components/admin/AdminSidebar";
import { OverviewTab } from "@/components/admin/OverviewTab";
import { UsersTab } from "@/components/admin/UsersTab";
import { DocumentsTab } from "@/components/admin/DocumentsTab";
import { LogsTab, TicketsTab } from "@/components/admin/SupportTabs";
import {
  AnalyticsTab,
  FaresTab,
  RidesTab,
  SettingsTab,
} from "@/components/admin/OperationsTabs";

const SECTION_TITLES: Record<AdminSection, string> = {
  overview: "Dashboard",
  users: "Users",
  rides: "Rides",
  documents: "Driver Documents",
  fares: "Fare Settings",
  tickets: "Support Tickets",
  analytics: "Analytics & Reports",
  logs: "Admin Logs",
  settings: "Settings",
};

export default function AdminDashboard() {
  const profile = useQuery(api.profiles.getMyProfile);
  const { isAdmin: isOwnerAdmin } = useOwnerAdmin();
  // Read for the sidebar badges only. It is the same query the Dashboard uses,
  // and Convex deduplicates identical reads, so having both does not mean two
  // round trips.
  const overview = useQuery(
    api.admin.getOverview,
    isOwnerAdmin || profile?.role === "admin" ? {} : "skip",
  );
  const tickets = useQuery(
    api.admin.listTickets,
    isOwnerAdmin || profile?.role === "admin" ? {} : "skip",
  );
  const [section, setSection] = useState<AdminSection>("overview");

  const counts = useMemo(
    () => ({
      pendingRiders: overview?.pendingRiders ?? 0,
      openTickets: tickets?.filter((ticket) => ticket.status !== "RESOLVED").length ?? 0,
    }),
    [overview, tickets],
  );

  if (profile === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // Not an admin: send them where they actually belong rather than showing an
  // empty console, which reads as "no data yet" rather than "not for you".
  if (!isOwnerAdmin && profile?.role !== "admin") {
    return (
      <Navigate
        to={profile?.role === "rider" ? "/rider" : "/app"}
        replace
      />
    );
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Fetch console</h1>
            <p className="text-xs text-muted-foreground">
              {SECTION_TITLES[section]}
            </p>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <AdminSidebar
              section={section}
              onSelect={setSection}
              counts={counts}
            />
          </aside>

          <main className="min-w-0">
            {section === "overview" ? <OverviewTab /> : null}
            {section === "users" ? <UsersTab /> : null}
            {section === "rides" ? <RidesTab /> : null}
            {section === "documents" ? <DocumentsTab /> : null}
            {section === "fares" ? <FaresTab /> : null}
            {section === "tickets" ? <TicketsTab /> : null}
            {section === "analytics" ? <AnalyticsTab /> : null}
            {section === "logs" ? <LogsTab /> : null}
            {section === "settings" ? <SettingsTab /> : null}
          </main>
        </div>
      </div>
    </AppShell>
  );
}