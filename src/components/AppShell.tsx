import { AccountMenu } from "@/components/AccountMenu";
import { BottomTabs } from "@/components/BottomTabs";
import { FetchBrand } from "@/components/FetchBrand";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import { useLocationStreaming } from "@/hooks/use-location-streaming";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import type { BottomTab } from "@/lib/bottomTabs";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Bell } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ProfileNavigationRail } from "@/components/ProfileNavigationRail";
import { NavLink } from "react-router";

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          // min-h-11 keeps every header link a full-size touch target
          // on a phone, where 24px of padding is a mis-tap waiting to
          // happen.
          "flex min-h-11 items-center rounded-full px-3 text-sm tracking-tight transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )
      }
    >
      {children}
    </NavLink>
  );
}

export function AppShell({
  children,
  bottomTabs,
  bottomActiveKey,
}: {
  children: ReactNode;
  /** Overrides the role-based default tabs. */
  bottomTabs?: BottomTab[];
  /** Which override tab is active, when they share a path. */
  bottomActiveKey?: string;
}) {
  const profile = useQuery(api.profiles.getMyProfile);
  // Owner by address, not just by profile role: the nav must not briefly show
  // the commuter links while the owner's profile row is still being written.
  const { isAdmin } = useOwnerAdmin();
  const rider = useQuery(api.riders.getMyRider);
  const activeRides = useQuery(api.rides.listActiveRides);
  const unread = useQuery(api.notifications.unreadCount);
  const notifications = useQuery(api.notifications.listMine);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // The shell owns the position stream, so moving between the booking screen
  // and the ride screen cannot freeze the commuter's live map.
  useLocationStreaming(rider?.isOnline ?? false);

  const t = useT();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="safe-top sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:h-16 sm:gap-4 sm:px-6">
          <div className="flex items-center gap-4 sm:gap-5">
            <NavLink to="/" className="rounded-md" aria-label={t("nav", "home")}>
              <FetchBrand size="md" />
            </NavLink>
            <nav className="hidden items-center gap-1 sm:flex">
              {isAdmin ? (
                <NavItem to="/admin">{t("nav", "console")}</NavItem>
              ) : profile?.role === "rider" ? (
                <NavItem to="/rider">{t("nav", "available")}</NavItem>
              ) : (
                <NavItem to="/app">{t("nav", "home")}</NavItem>
              )}
              <NavItem to="/activity">{t("nav", "activity")}</NavItem>
              <NavItem to="/chats">{t("nav", "chats")}</NavItem>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Notifications"
                  className="relative flex size-11 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Bell className="size-5" />
                  {(unread ?? 0) > 0 && (
                    <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
                      {unread}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <p className="text-sm font-semibold tracking-tight">
                    Notifications
                  </p>
                  {(unread ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => void markAllRead()}
                      className="cursor-pointer text-xs font-medium text-primary hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <Separator />
                <div className="max-h-80 overflow-y-auto">
                  {(notifications ?? []).length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Nothing yet.
                    </p>
                  ) : (
                    (notifications ?? []).map((notification) => (
                      <div
                        key={notification._id}
                        className={cn(
                          "border-b border-border/60 px-4 py-3 last:border-b-0",
                          !notification.read && "bg-secondary/40",
                        )}
                      >
                        <p className="text-sm font-medium tracking-tight">
                          {notification.title}
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                          {notification.body}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground/80">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
            {/* No language switcher in this row. Every screen carries it here,
                and it is a setting a person changes once — so it lives in
                Settings, and the app's busiest row keeps only what is used:
                notifications and the account. */}
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="safe-bottom-offset mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
        {children}
      </main>

      {/* Private workspace navigation, for signed-in accounts that want a
          persistent rail instead of the mobile bottom tabs. It is a sidebar
          because the authenticated app is at home on a desktop monitor, and
          the same routes still live in the top header for everyone else. */}
      {profile && (
        <nav
          className="hidden shrink-0 lg:flex lg:flex-col"
          aria-label="Workspace navigation"
        >
          <ProfileNavigationRail currentPath={typeof window !== "undefined" ? window.location.pathname : "/"} />
        </nav>
      )}

      <BottomTabs
        tabs={bottomTabs}
        role={profile?.role ?? ""}
        hasActiveRide={(activeRides ?? []).length > 0}
        activeKey={bottomActiveKey}
      />
    </div>
  );
}
