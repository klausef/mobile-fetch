import { Check, ClipboardList, MessageCircle, Shield, User } from "lucide-react";
import { useLocation, NavLink } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface RailLink {
  to: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  adminOnly?: boolean;
  badge?: (isAdmin: boolean) => ReactNode;
}

export function ProfileNavigationRail({
  currentPath,
}: {
  currentPath: string;
}) {
  const { user } = useAuth();
  const { isAdmin } = useOwnerAdmin();
  const { t } = useLocale();
  const location = useLocation();

  const links: RailLink[] = [
    {
      to: "/app",
      labelKey: "nav.workspace",
      icon: CircleDot,
      badge: () => null,
    },
    {
      to: "/activity",
      labelKey: "nav.activity",
      icon: ClipboardList,
      badge: () => null,
    },
    {
      to: "/chats",
      labelKey: "nav.chats",
      icon: MessageCircle,
      badge: () => null,
    },
    {
      to: "/profile",
      labelKey: "profile.title",
      icon: User,
      badge: () => null,
    },
  ];

  if (isAdmin) {
    links.push(
      {
        to: "/admin",
        labelKey: "nav.console",
        icon: Shield,
        adminOnly: true,
        badge: () => (
          <span className="ml-auto rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
            Admin
          </span>
        ),
      },
    );
  }

  const displaySelf = user?.email ?? "";

  return (
    <nav className="flex flex-col gap-1" aria-label="Workspace navigation">
      {links.map((link) => {
        const Icon = link.icon;
        const effectiveTo = link.adminOnly && !isAdmin ? "#" : link.to;
        const inAdminOnlyState = link.adminOnly && !isAdmin;
        const isActive =
          !inAdminOnlyState &&
          (location.pathname === link.to ||
            (link.to !== "/app" && location.pathname.startsWith(link.to)));

        return (
          <NavLink
            key={link.to}
            to={effectiveTo}
            className={({ isActive: active }) =>
              cn(
                "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                inAdminOnlyState
                  ? "pointer-events-none opacity-40 cursor-not-allowed text-muted-foreground"
                  : isActive || active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )
            }
            aria-current={isActive ? "page" : undefined}
            onClick={(event) => {
              if (inAdminOnlyState) {
                event.preventDefault();
              }
            }}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t(link.labelKey)}</span>
            {link.badge?.(isAdmin)}
          </NavLink>
        );
      })}
      <div className="mt-auto pt-4 border-t border-border/60">
        {displaySelf ? (
          <div className="flex items-center gap-3 rounded-lg px-3 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
              {displaySelf.split("@")[0][0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {displaySelf.split("@")[0] ?? ""}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {t("account", "email")}
                {displaySelf ? ` — ${displaySelf}` : ""}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}

function CircleDot({ className, "aria-hidden": ariaHidden }: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden ?? true}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
