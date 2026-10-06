import { ProfileView } from "@/components/profile/ProfileView";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useQuery } from "convex/react";
import { useState } from "react";
import { useNavigate } from "react-router";

/** The initials shown on the header avatar. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

/**
 * The account panel: profile, service-area notice and sign-out, reached from
 * the header avatar.
 *
 * It renders the shared profile *view* (`components/profile/ProfileView.tsx`)
 * in place rather than opening a list of rows that each lead elsewhere — every
 * one of those rows was already inside the profile, so the extra step only
 * added a second surface to keep in step.
 */
export function AccountMenu() {
  const { user } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const profile = useQuery(api.profiles.getMyProfile);
  const displayName =
    profile?.name ?? user?.email?.split("@")[0] ?? t("account", "title");

  const leaveTo = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t("account", "openMenu")}
          onClick={() => setOpen(true)}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-border/70 bg-secondary text-sm font-semibold text-foreground transition-colors hover:border-primary/50"
        >
          {initialsFor(displayName)}
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm pt-16">
        <SheetTitle>{t("profile", "title")}</SheetTitle>
        <div className="flex-1 overflow-y-auto px-1 pb-6">
          <ProfileView onNavigate={leaveTo} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
