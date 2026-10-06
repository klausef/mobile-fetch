/**
 * Rider registration, as its own flow.
 *
 * ── Why it is not `/auth` then `/onboarding` ───────────────────────────────
 * Registering to *drive* is not registering to *book*, and sharing a screen
 * with the passenger flow made that blur in three places: a query parameter
 * choosing which card was pre-selected, a role toggle on the form that a
 * passenger could land on by accident, and a rider who had already made the
 * account before being asked for a plate number — which is the moment most
 * applicants quietly abandon.
 *
 * So it is one screen, two steps, and nothing else on it. A driver never sees
 * the passenger's role question, and a passenger never sees a plate field.
 *
 * ── Why the account comes first ────────────────────────────────────────────
 * Because it is the only step that can fail in a way the person cannot fix —
 * an address already in use, a password the server refuses. Finding that out
 * *after* typing their name, phone, vehicle and photo means retyping all of it,
 * so the cheap, fallible step goes first and the details follow.
 *
 * ── Why the vehicle is required before submitting ──────────────────────────
 * A rider row is created with placeholder vehicle data and an approval queue
 * entry. Submitting a driver with "—" as their plate puts an unactionable
 * application in front of an admin, who then has to send them away to fix it.
 * Asking here is the difference between a queue that can be worked through and
 * one that cannot.
 *
 * ── Why photo upload is optional ───────────────────────────────────────────
 * It is a document the *admin* looks at, and a driver on a phone with a slow
 * connection should be able to finish and be approved later rather than be
 * stuck on a spinner. It is offered, never demanded.
 */

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FetchBrand } from "@/components/FetchBrand";
import { errorMessage } from "@/lib/errors";
import { useAuth } from "@/hooks/use-auth";

/**
 * The photo ceiling, stated here rather than imported from the Convex module
 * that enforces it.
 *
 * Importing a value out of a server module would drag that module into the
 * client bundle. The server is what actually refuses an oversized upload; this
 * copy exists only so the person finds out before their photo has been read
 * across a slow connection, and the comment marks it as a second copy on
 * purpose.
 */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * The password rule, restated rather than imported.
 *
 * `MIN_PASSWORD_LENGTH` lives in a Convex module, and importing a *value* out
 * of one drags that module into the client bundle. It is a second copy on
 * purpose: the server is what actually refuses the password, and this copy
 * exists so the form does not accept something the server will reject after the
 * person has already submitted. Keep it in step with `lib/password.ts` — which
 * also requires a letter and a number, hence the wording below.
 */
const MIN_PASSWORD_LENGTH = 10;

type Step = "account" | "driver";

export default function RiderRegister() {
  const { signIn, signOut, isAuthenticated } = useAuth();
  const profile = useQuery(api.profiles.getMyProfile);
  const createProfile = useMutation(api.profiles.createProfile);
  const saveVehicle = useMutation(api.riders.saveVehicle);
  const uploadUrl = useMutation(api.profiles.generatePhotoUploadUrl);
  const setPhoto = useMutation(api.profiles.setPhoto);

  const [step, setStep] = useState<Step>("account");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once the account exists the screen can skip straight to the details, so a
  // driver who abandoned halfway resumes instead of retyping their address.
  const [accountDone, setAccountDone] = useState(false);

  const handleAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    try {
      await signIn("password", { email, password, flow: "signUp" });
    } catch (err) {
      // Signing up an address that already has an account fails, and the
      // provider reports it as an unserializable action error — which reaches
      // the person as "[CONVEX A(auth:signIn)]" and tells them nothing. That is
      // the wrong answer for the very common case of a driver who made an
      // account earlier and came back to finish registering, so try signing in
      // before giving up: the credentials are already in their hands, and this
      // way that person gets to step two instead of a dead end.
      try {
        await signIn("password", { email, password, flow: "signIn" });
      } catch {
        setError(
          errorMessage(
            err,
            "That account could not be created. If you already have one, sign in with it.",
          ),
        );
        setBusy(false);
        return;
      }
    }
    setAccountDone(true);
    setStep("driver");
    setBusy(false);
  };

  const handleDriver = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const file = (data.get("photo") as File | null) ?? null;
      await createProfile({
        role: "rider",
        name: String(data.get("name") ?? ""),
        phone: String(data.get("phone") ?? ""),
      });
      await saveVehicle({
        make: String(data.get("make") ?? ""),
        model: String(data.get("model") ?? ""),
        plate: String(data.get("plate") ?? ""),
        color: String(data.get("color") ?? ""),
      });

      // Uploaded last, and only if there is one: the profile has to exist
      // before a photo can be attached to it, so a failed upload must not cost
      // the driver their account or their vehicle details.
      if (file && file.size > 0) {
        const url = await uploadUrl();
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) {
          throw new Error("The upload did not finish. Please try again.");
        }
        // The upload URL hands back the id as JSON; the server re-reads the
        // stored file's metadata rather than trusting what we send here.
        const { storageId } = (await response.json()) as {
          storageId: Id<"_storage">;
        };
        await setPhoto({ storageId });
      }

      toast.success("Application sent.", {
        description: "You can drive as soon as an admin approves you.",
      });
      // The rider dashboard is the pending-approval screen; it already knows
      // how to say "we are checking your documents" and does not need a second
      // version of that sentence here.
      window.location.assign("/rider");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  // Already a rider: there is nothing to register.
  if (profile?.role === "rider") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <Check className="mx-auto size-6 text-primary" />
          <p className="mt-3 text-sm font-medium tracking-tight">
            You are already registered to drive.
          </p>
          <Button className="mt-4 w-full" onClick={() => window.location.assign("/rider")}>
            Go to your dashboard
          </Button>
        </div>
      </main>
    );
  }

  // One account carries one role: `createProfile` returns the existing profile
  // untouched when there already is one, so a passenger submitting this form
  // would keep their commuter profile and then be refused by `saveVehicle`
  // with "Rider profile not found." — a dead end with no way forward. Say so
  // instead, and offer the sign-out that actually unblocks them.
  if (profile?.role === "commuter") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm font-medium tracking-tight">
            This account is already a passenger account.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            One account is either a rider or a passenger. Sign out and register
            with the address you want to drive with.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => void signOut().then(() => window.location.assign("/rider/register"))}
          >
            Sign out and start over
          </Button>
        </div>
      </main>
    );
  }

  // Only a settled answer may pick a step. `profile` is `undefined` while the
  // query is still in flight, and deciding on it then flashed the details form
  // at somebody who had not chosen it yet.
  if (profile === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // Keyed off the session, not off `profile !== null`: a visitor who is not
  // signed in has no profile either way, and treating that as "already past
  // step one" put the details form in front of every first-time driver — the
  // one person this screen exists for.
  const driverStep = step === "driver" || accountDone || isAuthenticated;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <FetchBrand />

      {/* Progress, because this is the only multi-step form in the app and a
          person who cannot tell which of two steps they are on will submit the
          wrong one. */}
      <ol className="mt-6 flex items-center gap-2 text-[11px]">
        {(["account", "driver"] as const).map((key, index) => {
          const done = driverStep && index === 0;
          const active = key === "driver" ? driverStep : !driverStep;
          return (
            <li key={key} className="flex items-center gap-2">
              <span
                className={`flex size-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  active || done
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {index + 1}
              </span>
              <span className={active ? "text-foreground" : "text-muted-foreground"}>
                {key === "account" ? "Your account" : "Driver details"}
              </span>
              {index === 0 ? (
                <span className="mx-1 h-px w-6 bg-border" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>

      <h1 className="mt-4 text-xl font-semibold tracking-tight">
        {driverStep ? "Driver details" : "Register to drive"}
      </h1>
      <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {driverStep
          ? "An admin reviews every application before you can take a booking."
          : "A separate account from your passenger one, so the two never get mixed up."}
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs text-foreground">
          {error}
        </p>
      ) : null}

      {driverStep ? (
        <form onSubmit={handleDriver} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rider-name">Full name</Label>
            <Input id="rider-name" name="name" required maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rider-phone">Mobile number</Label>
            <Input
              id="rider-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              required
              placeholder="09xx xxx xxxx"
            />
          </div>

          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-medium tracking-tight">Your vehicle</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Riders see this on the map while they wait.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="v-make">Make</Label>
                <Input id="v-make" name="make" required maxLength={40} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-model">Model</Label>
                <Input id="v-model" name="model" required maxLength={40} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-color">Colour</Label>
                <Input id="v-color" name="color" required maxLength={30} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-plate">Plate number</Label>
                <Input
                  id="v-plate"
                  name="plate"
                  required
                  maxLength={20}
                  className="uppercase"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rider-photo">
              Licence or ID photo{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="rider-photo"
              name="photo"
              type="file"
              accept="image/*"
            />
            <p className="text-[10px] text-muted-foreground">
              Up to {Math.round(MAX_PHOTO_BYTES / (1024 * 1024))} MB. You can
              add it later from your profile if you would rather not now.
            </p>
          </div>

          <Button type="submit" className="h-12 w-full rounded-full" disabled={busy}>
            {busy ? "Sending…" : "Send application"}
            <ArrowRight className="size-4" />
          </Button>
          <p className="text-[10px] leading-4 text-muted-foreground">
            By applying you agree to Fetch's terms of service and privacy
            notice.
          </p>
        </form>
      ) : (
        <form onSubmit={handleAccount} className="mt-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rider-email">Email address</Label>
            <Input
              id="rider-email"
              name="email"
              type="email"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rider-password">Password</Label>
            <Input
              id="rider-password"
              name="password"
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
            />
            {/* Stated here because the server enforces it: `assertPasswordRequirements`
                wants the same length *and* a letter and a number. Telling the
                person beforehand is the difference between a form and a guessing
                game, and a form that understates the rule fails after submit. */}
            <p className="text-[10px] text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters, with a letter and a
              number. You will use this to sign in.
            </p>
          </div>
          <Button
            type="submit"
            className="h-12 w-full rounded-full"
            disabled={busy}
          >
            {busy ? "Creating…" : "Continue"}
            <ArrowRight className="size-4" />
          </Button>
          <a
            href="/auth"
            className="flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Already have an account? Sign in
          </a>
        </form>
      )}
    </main>
  );
}