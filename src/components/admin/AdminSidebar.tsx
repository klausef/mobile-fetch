/**
 * The admin console's shell: a sidebar of sections, and one panel at a time.
 *
 * ── Why a sidebar rather than one long scrolling page ───────────────────────
 * The console grew by accretion — a KPI row, then the approval queue, then the
 * tariff editor, then broadcasts, all on one page. Every visit meant scrolling
 * past four things you did not come for to reach the fifth, and on a laptop
 * that is most of the screen. Sections make "where do I change the per-km rate"
 * a question with one answer.
 *
 * ── Why the sidebar is a bar on a phone ────────────────────────────────────
 * Below `lg` the same list renders as a horizontal scroller pinned under the
 * header. A collapsible drawer was the other option and it was worse: the
 * sections an admin moves between (approvals and the log, mostly) are the ones
 * you want reachable in one tap, and a drawer puts two taps in front of every
 * switch. The scroller keeps one tap, and `snap-start` so a half-scrolled row
 * never reads as a different section.
 *
 * ── Why the active section is not in the URL ───────────────────────────────
 * The console is not linkable by design: an admin URL is a thing that ends up
 * in a screenshot, and the sections here change someone's account or their
 * money. It is one deliberate, boring page behind the account check.
 */

import { cn } from "@/lib/utils";
import {
  BarChart3,
  FileText,
  LifeBuoy,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminSection =
  | "overview"
  | "users"
  | "rides"
  | "documents"
  | "fares"
  | "tickets"
  | "analytics"
  | "logs"
  | "settings";

export const ADMIN_SECTIONS: {
  key: AdminSection;
  label: string;
  icon: LucideIcon;
  /** Shown beside the label; lets a queue announce itself without being opened. */
  badge?: (counts: AdminCounts) => number;
}[] = [
  { key: "overview", label: "Dashboard", icon: LayoutDashboard },
  { key: "users", label: "Users", icon: Users },
  { key: "rides", label: "Rides", icon: Receipt },
  { key: "documents", label: "Driver Documents", icon: FileText, badge: (c) => c.pendingRiders },
  { key: "fares", label: "Fare Settings", icon: SlidersHorizontal },
  { key: "tickets", label: "Support Tickets", icon: LifeBuoy, badge: (c) => c.openTickets },
  { key: "analytics", label: "Analytics & Reports", icon: BarChart3 },
  { key: "logs", label: "Admin Logs", icon: ScrollText },
  { key: "settings", label: "Settings", icon: Settings },
];

export interface AdminCounts {
  pendingRiders: number;
  openTickets: number;
}

export function AdminSidebar({
  section,
  onSelect,
  counts,
  className,
}: {
  section: AdminSection;
  onSelect: (next: AdminSection) => void;
  counts: AdminCounts;
  className?: string;
}) {
  return (
    <nav
      aria-label="Console sections"
      className={cn(
        // A phone gets a pinned, scrolling row; `lg` turns it into the column
        // beside the panel. Same list, same order, one component.
        "flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0",
        className,
      )}
    >
      {ADMIN_SECTIONS.map((item) => {
        const Icon = item.icon;
        const active = item.key === section;
        const count = item.badge?.(counts) ?? 0;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 snap-start items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium tracking-tight transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "lg:w-full",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{item.label}</span>
            {count > 0 ? (
              // The queue announces itself from the sidebar: an admin who has
              // to open "Driver Documents" to find out there are three waiting
              // has already lost the thing the badge is for.
              <span
                className={cn(
                  "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  active ? "bg-background/20 text-background" : "bg-primary text-primary-foreground",
                )}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}