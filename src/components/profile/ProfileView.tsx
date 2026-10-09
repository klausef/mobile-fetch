import { api } from "@/convex/_generated/api";
import { PhotoPicker } from "@/components/PhotoPicker";
import { ServiceAreaSheet } from "@/components/ServiceAreaSheet";
import { SettingGroup, SettingRow } from "@/components/SettingRows";
import { SettingsSheet } from "@/components/SettingsSheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { roleLabel } from "@/lib/account";
import { errorMessage } from "@/lib/errors";
import { LOCALE_NAMES, useLocale, useT } from "@/lib/i18n/LocaleProvider";
import { legalFor } from "@/lib/legal";
import { useMutation, useQuery } from "convex/react";
import {
  CircleHelp,
  FileText,
  LifeBuoy,
  Loader2,
  Lock,
  LogOut,
  MapPinned,
  MessageCircle,
  Pencil,
  Scale,
  Ticket,
  UserRound,
} from "lucide-react";
import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
/**
 * The account, as content rather than a page.
 *
 * Extracted from the profile *page* so the same content can appear in the
 * account panel without being a second copy of it. That was the problem this
 * fixes: the header's account sheet offered "Profile", which navigated to a
 * full page — so a rider who tapped Profile inside the panel they had just
 * opened got a different surface, with its own gold bar and its own back
 * button, layered over the panel underneath. Two account surfaces, one of them
 * unreachable without going back out.
 *
 * So the sheet now *replaces* its own contents with this, rather than opening a
 * route behind it. Rows that lead somewhere real — Activity, Chats — still
 * navigate; they are destinations, not settings.
 *
 * Everything with a form (name and number, password, emergency contact, legal)
 * stays in dialogs, because a dialog over a panel behaves the same as a dialog
 * over a page. That is what makes this safe to embed: nothing here depends on
 * being the whole screen.
 */


export function ProfileView({
  /** Called by rows that leave the account entirely. */
  onNavigate,
  /** Called when a settings sheet opens so the host panel can close first. */
  onSettingsOpen,
}: {
  onNavigate?: (to: string) => void;
  onSettingsOpen?: () => void;
}) {
  const { signOut, user, signIn } = useAuth();
  const t = useT();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const profile = useQuery(api.profiles.getMyProfile);
  // Owner by address as well as by role, so a stray trip link from the owner
  // does not drop them on the commuter's home page.
  const { isAdmin } = useOwnerAdmin();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState<"terms" | "privacy" | null>(null);

  // Name and number.
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState({ name: "", phone: "" });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const saveDetails = useMutation(api.profiles.updateMyProfile);

  // Password. Convex Auth's Password provider has no direct changePassword
  // flow, so this is the reset flow: a code is emailed to the account, then
  // the code plus the new password are submitted together.
  const [pwOpen, setPwOpen] = useState(false);
  const [pwStep, setPwStep] = useState<"request" | "verify">("request");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  // Guards against a double submit: the reset code is single-use, and two
  // in-flight requests would burn it and strand the account.
  const pwInFlight = useRef(false);

  // Emergency contact.
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [emergencyBusy, setEmergencyBusy] = useState(false);
  const [emergencyError, setEmergencyError] = useState<string | null>(null);
  const [emergencyDraft, setEmergencyDraft] = useState({ name: "", phone: "" });
  const saveEmergency = useMutation(api.profiles.setEmergencyContact);

  const email = user?.email ?? null;
  const name = profile?.name ?? null;
  const role = isAdmin ? "admin" : (profile?.role ?? null);
  const displayName = name ?? email?.split("@")[0] ?? t("account", "title");

  const openEdit = () => {
    setEditDraft({ name: profile?.name ?? "", phone: profile?.phone ?? "" });
    setEditError(null);
    setEditOpen(true);
  };

  const submitDetails = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (editBusy) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await saveDetails({ name: editDraft.name, phone: editDraft.phone });
      setEditOpen(false);
      toast.success(t("profile", "detailsSaved"));
    } catch (err) {
      setEditError(errorMessage(err, t("profile", "detailsFailed")));
    } finally {
      setEditBusy(false);
    }
  };

  const requestResetCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || pwInFlight.current) return;
    pwInFlight.current = true;
    setPwBusy(true);
    setPwError(null);
    try {
      await signIn("password", { email, flow: "reset" });
      setPwStep("verify");
    } catch (err) {
      setPwError(errorMessage(err, t("account", "codeFailed")));
    } finally {
      setPwBusy(false);
      pwInFlight.current = false;
    }
  };

  const confirmReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email || pwInFlight.current) return;
    pwInFlight.current = true;
    setPwBusy(true);
    setPwError(null);
    const form = new FormData(event.currentTarget);
    try {
      await signIn("password", {
        email,
        code: String(form.get("code") ?? ""),
        newPassword: String(form.get("newPassword") ?? ""),
        flow: "reset-verification",
      });
      setPwOpen(false);
      setPwStep("request");
      toast.success(t("account", "passwordChanged"), {
        description: t("account", "passwordChangedHint"),
      });
    } catch (err) {
      setPwError(errorMessage(err, t("account", "codeRejected")));
    } finally {
      setPwBusy(false);
      pwInFlight.current = false;
    }
  };

  const openEmergency = () => {
    setEmergencyDraft({
      name: profile?.emergencyName ?? "",
      phone: profile?.emergencyPhone ?? "",
    });
    setEmergencyError(null);
    setEmergencyOpen(true);
  };

  const submitEmergency = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (emergencyBusy) return;
    setEmergencyBusy(true);
    setEmergencyError(null);
    try {
      await saveEmergency({
        name: emergencyDraft.name,
        phone: emergencyDraft.phone,
      });
      setEmergencyOpen(false);
      toast.success(t("account", "emergencySaved"));
    } catch (err) {
      setEmergencyError(
        errorMessage(err, t("account", "emergencyFailed")),
      );
    } finally {
      setEmergencyBusy(false);
    }
  };

  const handleSignOut = async () => {
    // A server call, and one of only two ways out of the account in the app.
    // Failing quietly here would close the page and leave the person still
    // signed in on a phone they are trying to hand back.
    try {
      await signOut();
      navigate("/");
    } catch (err) {
      toast.error(errorMessage(err, t("account", "signOutFailed")));
    }
  };

  const emergencyLabel =
    profile?.emergencyName && profile?.emergencyPhone
      ? `${profile.emergencyName} · ${profile.emergencyPhone}`
      : null;

  // A signed-in account with no profile row has no name, no number and nothing
  // to edit, and every save on this page would be refused by the server. Send
  // them where that gets fixed rather than showing a half-empty account.
  if (profile === null) return <Navigate to="/onboarding" replace />;
  return (
    <>
    <div className="space-y-6">
      {/* Who you are. The photo is the one thing here you change without a
          dialog, because it is a single tap and a camera roll. */}
      <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <PhotoPicker name={displayName} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold tracking-tight">
              {displayName}
            </p>
            {email ? (
              <p className="truncate text-sm text-muted-foreground">
                {email}
              </p>
            ) : null}
            <p className="mt-0.5 truncate text-sm font-semibold text-fetch-red">
              {profile?.phone ?? t("account", "notAdded")}
            </p>
            {role ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {roleLabel(role)}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={openEdit}
            aria-label={t("profile", "editDetails")}
            className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <Pencil aria-hidden className="size-4" />
          </Button>
        </div>
      </section>

      <SettingGroup title={t("profile", "preferences")}>
        <SettingRow
          icon={Lock}
          label={t("profile", "accountSafety")}
          hint={t("profile", "accountSafetyHint")}
          onClick={() => {
            setPwStep("request");
            setPwError(null);
            setPwOpen(true);
          }}
        />
        <SettingRow
          icon={LifeBuoy}
          label={t("account", "emergency")}
          hint={emergencyLabel ?? t("account", "notAdded")}
          onClick={openEmergency}
        />
        <SettingRow
          icon={UserRound}
          label={t("profile", "languageAppearance")}
          hint={LOCALE_NAMES[locale]}
          onClick={() => {
            setAreaOpen(false);
            setSettingsOpen(true);
            onSettingsOpen?.();
          }}
        />
        <SettingRow
          icon={MapPinned}
          label={t("coverage", "menuLabel")}
          hint={t("coverage", "menuHint")}
          onClick={() => {
            setSettingsOpen(false);
            setAreaOpen(true);
            onSettingsOpen?.();
          }}
        />
      </SettingGroup>

      <SettingGroup title={t("profile", "activity")}>
        {/* Trips and Chats are destinations, not settings, so they still leave
            the account. `onNavigate` is how the host panel gets a chance to
            close before the route changes underneath it. */}
        <SettingRow
          icon={Ticket}
          label={t("nav", "activity")}
          to="/activity"
          onClick={() => onNavigate?.("/activity")}
        />
        <SettingRow
          icon={MessageCircle}
          label={t("nav", "chats")}
          to="/chats"
          onClick={() => onNavigate?.("/chats")}
        />
      </SettingGroup>

      <SettingGroup title={t("profile", "others")}>
        <SettingRow
          icon={CircleHelp}
          label={t("profile", "help")}
          hint={t("profile", "helpHint")}
          href={`mailto:${t("profile", "supportEmail")}?subject=${encodeURIComponent(t("profile", "help"))}`}
        />
        <SettingRow
          icon={FileText}
          label={t("legal", "terms")}
          onClick={() => setLegalOpen("terms")}
        />
        <SettingRow
          icon={Scale}
          label={t("legal", "privacy")}
          onClick={() => setLegalOpen("privacy")}
        />
        <SettingRow
          icon={LogOut}
          label={t("account", "signOut")}
          destructive
          onClick={() => void handleSignOut()}
        />
      </SettingGroup>

      <p className="pt-1 text-center text-xs text-muted-foreground">
        {t("profile", "footer")}
      </p>
    </div>

    <SettingsSheet open={settingsOpen} onOpenChange={(open) => {
      setSettingsOpen(open);
      if (!open) onSettingsOpen?.();
    }} />
    <ServiceAreaSheet open={areaOpen} onOpenChange={(open) => {
      setAreaOpen(open);
      if (!open) onSettingsOpen?.();
    }} />

    {/* The two legal rows, as one sheet with the copy inline. Written to say
        what this deployment actually does rather than to sound like a policy
        document: what a fare is, what we store, and what we do not. */}
    <Dialog
      open={legalOpen !== null}
      onOpenChange={(next) => {
        if (!next) setLegalOpen(null);
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {legalOpen === "privacy"
              ? t("legal", "privacy")
              : t("legal", "terms")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-6 text-muted-foreground">              {(
              legalOpen ? legalFor(legalOpen, locale) : []
            ).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog
      open={editOpen}
      onOpenChange={(next) => {
        setEditOpen(next);
        if (!next) setEditError(null);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("profile", "editDetails")}</DialogTitle>
          <DialogDescription>
            {t("profile", "editDetailsHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitDetails} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-xs">
              {t("profile", "name")}
            </Label>
            <Input
              id="profile-name"
              value={editDraft.name}
              onChange={(event) =>
                setEditDraft((draft) => ({
                  ...draft,
                  name: event.target.value,
                }))
              }
              placeholder={t("profile", "namePlaceholder")}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-phone" className="text-xs">
              {t("profile", "phone")}
            </Label>
            <Input
              id="profile-phone"
              value={editDraft.phone}
              onChange={(event) =>
                setEditDraft((draft) => ({
                  ...draft,
                  phone: event.target.value,
                }))
              }
              inputMode="tel"
              placeholder={t("profile", "phonePlaceholder")}
              required
            />
          </div>
          {editError ? (
            <p className="text-xs leading-5 text-destructive">{editError}</p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={editBusy}>
              {editBusy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                t("common", "save")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog
      open={emergencyOpen}
      onOpenChange={(next) => {
        setEmergencyOpen(next);
        if (!next) setEmergencyError(null);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("account", "emergency")}</DialogTitle>
          <DialogDescription>
            {t("account", "emergencyHint")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submitEmergency} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="emergency-name" className="text-xs">
              {t("account", "theirName")}
            </Label>
            <Input
              id="emergency-name"
              value={emergencyDraft.name}
              onChange={(event) =>
                setEmergencyDraft((draft) => ({
                  ...draft,
                  name: event.target.value,
                }))
              }
              placeholder="Maria Santos"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emergency-phone" className="text-xs">
              {t("account", "theirNumber")}
            </Label>
            <Input
              id="emergency-phone"
              value={emergencyDraft.phone}
              onChange={(event) =>
                setEmergencyDraft((draft) => ({
                  ...draft,
                  phone: event.target.value,
                }))
              }
              inputMode="tel"
              placeholder="0917 000 0000"
            />
          </div>
          {emergencyError ? (
            <p className="text-xs leading-5 text-destructive">
              {emergencyError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={emergencyBusy}>
              {emergencyBusy ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                t("account", "saveContact")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog
      open={pwOpen}
      onOpenChange={(next) => {
        setPwOpen(next);
        if (!next) setPwError(null);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("account", "passwordTitle")}</DialogTitle>
          <DialogDescription>
            {pwStep === "request"
              ? t("account", "passwordRequest")
              : t("account", "passwordVerify")}
          </DialogDescription>
        </DialogHeader>

        {pwStep === "request" ? (
          <form onSubmit={requestResetCode} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-email" className="text-xs">
                {t("account", "email")}
              </Label>
              <Input id="reset-email" value={email ?? ""} readOnly />
            </div>
            {pwError ? (
              <p className="text-xs leading-5 text-destructive">{pwError}</p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pwBusy || !email}>
                {pwBusy ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  t("account", "emailCodeAction")
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={confirmReset} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-code" className="text-xs">
                {t("account", "codeLabel")}
              </Label>
              <Input
                id="reset-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reset-password" className="text-xs">
                {t("account", "newPassword")}
              </Label>
              <Input
                id="reset-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                placeholder={t("account", "passwordPlaceholder")}
                required
              />
            </div>
            {pwError ? (
              <p className="text-xs leading-5 text-destructive">{pwError}</p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={pwBusy}>
                {pwBusy ? (
                  <Loader2 aria-hidden className="size-4 animate-spin" />
                ) : (
                  t("account", "setNewPassword")
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}
