/**
 * The desktop rail: the same destinations the bottom bar carries, kept visible
 * on a wide screen.
 *
 * ── Why it exists ──────────────────────────────────────────────────────────
 * `BottomTabs` is a phone instrument. On a monitor the app has width nobody is
 * using, and the nav it already has is either in the header (where it competes
 * with the brand, the bell and the account) or pinned to the bottom of the
 * window. A rail puts the same routes in a column that stays put.
 *
 * ── Why it is one component and not two ────────────────────────────────────
 * The destinations differ by role — a rider's work screens, the owner's
 * console, a commuter's booking home — but the *list* is the same list in one
 * order, and duplicating it per role is how the header and the rail drift
 * apart. The role only decides which entries are offered, never how they are
 * drawn.
 *
 * ── Why it takes the role as a prop ────────────────────────────────────────
 * `AppShell` has already read the profile; a second query here would be the
 * same read twice and a second place for the two to disagree while one of them
 * is still loading.
 */

import { Car, ClipboardList, LayoutDashboard, MessageCircle, ShieldCheck, ShoppingBag } from "lucide-react";
import { NavLink } from "react-router";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface RailItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** `/app` is a prefix of nothing else, but `/rider` is — see `end`. */
  end?: boolean;
}

export function ProfileNavigationRail({
  role,
  isAdmin,
}: {
  /** The signed-in account's FETCH role. */
  role?: string;
  /** Owner by address or by profile; decides the console entry. */
  isAdmin: boolean;
}) {
  const t = useT();

  const items: RailItem[] = [];

  if (isAdmin) {
    items.push({ to: "/admin", label: t("nav", "console"), icon: ShieldCheck });
  }
  if (role === "rider") {
    // A rider's rail is their work first: the bookings to take, then the
    // shift report. Same order the bottom bar uses.
    items.push({ to: "/rider", label: t("nav", "available"), icon: Car });
    items.push({
      to: "/rider/dashboard",
      label: t("nav", "dashboard"),
      icon: LayoutDashboard,
    });
  } else if (!isAdmin) {
    // A commuter books; the owner's rail is the console and nothing else it
    // would still lead back into the passenger app from.
    items.push({ to: "/app", label: t("nav", "home"), icon: ShoppingBag, end: true });
  }

  items.push({ to: "/activity", label: t("nav", "activity"), icon: ClipboardList });
  items.push({ to: "/chats", label: t("nav", "chats"), icon: MessageCircle });

  return (
    <nav aria-label="Sections" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium tracking-tight transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
