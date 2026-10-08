import { useAuth } from "@/hooks/use-auth";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { AppShell } from "@/components/AppShell";
import { ProfileNavigationRail } from "@/components/ProfileNavigationRail";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Navigate } from "react-router";

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const { isAdmin } = useOwnerAdmin();
  const { t } = useLocale();
  const [now] = useState(() => Date.now());

  const profile = useQuery(api.profiles.getMyProfile);
  const unread = useQuery(api.notifications.unreadCount);

  if (profile === null) {
    return <Navigate to="/onboarding" replace />;
  }

  const unreadCount = unread !== null ? unread : undefined;

  return (
    <AppShell>
      <div className="mx-auto w-full flex flex-1 flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {isAdmin ? t("nav", "consoleWorkspace") : t("nav", "workspace")}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {user?.name ?? t("account", "title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.email ?? ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {unreadCount !== undefined && unreadCount > 0
                ? `${unreadCount} unread`
                : t("profile", "noNotifications", { email: user?.email ?? "" })}
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
              <h2 className="text-sm font-medium tracking-tight text-muted-foreground">
                {t("nav", "workspace")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-foreground">
                This is your private workspace. The same routes are available
                from the header and from the desktop sidebar.
              </p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                If you are signed in as the owner account, the console
                navigation appears in the sidebar and the header.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
                <h3 className="text-sm font-medium tracking-tight text-muted-foreground">
                  {t("profile", "trips")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDistanceToNow(new Date(now), { addSuffix: true })}
                </p>
              </div>

              <div className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
                <h3 className="text-sm font-medium tracking-tight text-muted-foreground">
                  {t("nav", "chats")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {unreadCount !== undefined && unreadCount > 0
                    ? `${unreadCount} active`
                    : t("profile", "noChats", { name: user?.name ?? "" })}
                </p>
              </div>
            </div>
          </div>

          <aside className="hidden lg:block">
            <ProfileNavigationRail currentPath={typeof window !== "undefined" ? window.location.pathname : "/"} />
          </aside>
        </section>
      </div>
    </AppShell>
  );
}
