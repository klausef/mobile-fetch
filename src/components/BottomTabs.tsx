import { roleTabs, type BottomTab } from "@/lib/bottomTabs";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { NavLink } from "react-router";

/**
 * The bottom navigation.
 *
 * Three places, for both sides of the platform: where you start, the trips you
 * have, and the conversations about them. The list is data (`lib/bottomTabs`)
 * so the rider's extra tabs and the role defaults cannot drift from the routes
 * they point at.
 *
 * `activeKey` overrides the path match for screens that are not themselves a
 * tab — the booking form, for instance, keeps Home lit while it is open.
 */
export function BottomTabs({
  tabs,
  role = "",
  hasActiveRide = false,
  activeKey,
}: {
  /** A screen's own tab list, when it overrides the role default. */
  tabs?: BottomTab[];
  /** The signed-in role, used when no list is passed. */
  role?: string;
  /** Whether the rider is carrying a ride; only riders gain that tab. */
  hasActiveRide?: boolean;
  /** Marks a tab active when the current path does not match its target. */
  activeKey?: string;
}) {
  const t = useT();
  const list = tabs ?? roleTabs(role, hasActiveRide);

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-lg items-stretch justify-around px-1">
        {list.map((tab) => {
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.key}
              to={tab.to}
              end
              className={({ isActive }) =>
                cn(
                  // A full-height cell, so the whole tab is tappable and not
                  // just the glyph.
                  "flex min-w-16 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-medium tracking-tight transition-colors",
                  isActive || tab.key === activeKey
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              <span>{t("nav", tab.labelKey)}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
