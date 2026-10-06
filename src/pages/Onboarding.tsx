import { api } from "@/convex/_generated/api";
import { FetchBrand } from "@/components/FetchBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { errorMessage } from "@/lib/errors";
import { useMutation, useQuery } from "convex/react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { toast } from "sonner";

export default function Onboarding() {
  const { signOut } = useAuth();
  const t = useT();
  const profile = useQuery(api.profiles.getMyProfile);
  // The reserved owner address never picks a riding role: the console is where
  // they belong, so the admin profile is granted for them and sent there.
  const { isAdmin, resolved } = useOwnerAdmin();
  const createProfile = useMutation(api.profiles.createProfile);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  if (profile === undefined || !resolved) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (isAdmin) return <Navigate to="/admin" replace />;

  if (profile) {
    return (
      <Navigate
        to={profile.role === "rider" ? "/rider" : "/app"}
        replace
      />
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      // Always the passenger role. Registering to drive is a different act with
      // its own screen (`/rider/register`), and letting somebody pick "I drive"
      // here produced a rider row with no vehicle — the placeholder "—" plate —
      // which is exactly the unactionable queue entry the driver form exists to
      // prevent. The role is fixed rather than chosen so this form cannot
      // become a second door into the rider path.
      await createProfile({ role: "commuter", name, phone });
      navigate("/app", { replace: true });
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    // pb is an explicit calc rather than `safe-bottom` + `py-10`: the safe-area
    // helpers set padding outright, so pairing them with a padding shorthand
    // means one of the two silently loses.
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:pb-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between gap-3">
          <FetchBrand size="md" />
          <div className="flex items-center gap-1">
            {/* The language pill lives here as well as in the app header,
                because onboarding is the first signed-in screen and somebody
                arriving from a Bisaya speaker's share link should not have to
                make an account before they can switch. */}
            <LocaleSwitcher />
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex min-h-11 items-center rounded-full px-3 text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("onboarding", "signOut")}
            </button>
          </div>
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {t("onboarding", "step")}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("onboarding", "title")}
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          {t("onboarding", "subtitle")}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5">
          {/* What this account is for, stated rather than chosen. The driver
              path is `/rider/register`, and it asks for a vehicle before it
              sends an application; a role picker here could only ever produce a
              rider with no vehicle. */}
          <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-4">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-medium tracking-tight">
                {t("onboarding", "commuter")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("onboarding", "commuterHint")}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">{t("onboarding", "name")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("onboarding", "namePlaceholder")}
              autoComplete="name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">{t("onboarding", "phone")}</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("onboarding", "phonePlaceholder")}
              inputMode="tel"
              autoComplete="tel"
              required
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("onboarding", "phoneHint")}
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              t("onboarding", "submit")
            )}
          </Button>
        </form>

        {/* The way to drive is still offered, just not as a second role on this
            form. Removing the card must not remove the door: somebody who
            arrived meaning to drive and landed here is exactly the person who
            would otherwise have no route to `/rider/register`. */}
        <Link
          to="/rider/register"
          className="mt-6 block rounded-xl border border-border p-4 transition-colors hover:border-foreground/40"
        >
          <p className="text-sm font-medium tracking-tight">
            {t("onboarding", "driveWithUs")}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t("onboarding", "driveWithUsHint")}
          </p>
        </Link>
      </div>
    </main>
  );
}
