import { FetchBrand } from "@/components/FetchBrand";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { useOwnerAdmin } from "@/hooks/use-owner-admin";
import { RESERVED_ADMIN_EMAIL } from "@/lib/adminEmail";
import { resolvePostAuthPath } from "@/lib/adminRedirect";
import { errorMessage } from "@/lib/errors";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useQuery } from "convex/react";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  /** Where to land after a successful sign-in when no `returnTo` is given. */
  redirectAfterAuth?: string;
}

/** Only a same-origin path may be used as the post-auth destination. */
function resolveRedirect(returnTo: string | null, fallback: string): string {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

/**
 * Sign in, sign up, or continue as a guest.
 *
 * One form serves both the password sign-in and the account creation (`pwFlow`),
 * because the only difference the person cares about is which button they
 * pressed — the alternative was a second screen with the same two fields.
 */
export function Auth({ redirectAfterAuth = "/app" }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirect(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [step, setStep] = useState<"signIn" | { email: string }>("signIn");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [pwFlow, setPwFlow] = useState<"signIn" | "signUp">("signIn");

  const { isOwner, resolved } = useOwnerAdmin();
  const needsOwnerPassword = useQuery(api.profiles.ownerNeedsPassword);
  const [ownerPwBusy, setOwnerPwBusy] = useState(false);
  const [ownerPwError, setOwnerPwError] = useState<string | null>(null);
  const ownerPwInFlight = useRef(false);

  // Once the session and the ownership verdict are both settled, send the
  // person where they were going: the console for the owner address, the
  // validated `returnTo` otherwise.
  useEffect(() => {
    if (authLoading || !isAuthenticated || !resolved) return;
    if (ownerPwInFlight.current) return;
    navigate(resolvePostAuthPath(isOwner, redirect), { replace: true });
  }, [authLoading, isAuthenticated, resolved, isOwner, navigate, redirect]);

  const handleOwnerPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ownerPwInFlight.current = true;
    setOwnerPwBusy(true);
    setOwnerPwError(null);
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    try {
      try {
        await signIn("password", {
          email: RESERVED_ADMIN_EMAIL,
          password,
          flow: "signUp",
        });
      } catch {
        await signIn("password", {
          email: RESERVED_ADMIN_EMAIL,
          password,
          flow: "signIn",
        });
      }
      navigate(resolvePostAuthPath(true, redirect), { replace: true });
    } catch (err) {
      ownerPwInFlight.current = false;
      setOwnerPwError(errorMessage(err, "Could not set the owner password."));
      setOwnerPwBusy(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("password", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        flow: pwFlow,
      });
    } catch (err) {
      setError(errorMessage(err, "Those sign-in details were not accepted."));
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      await signIn("email-otp", formData);
      setStep({ email: String(formData.get("email") ?? "") });
    } catch (err) {
      setError(errorMessage(err, "Failed to send the verification code."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", new FormData(event.currentTarget));
    } catch {
      setError("That code is not correct. Check your email and try again.");
      setOtp("");
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signIn("anonymous");
    } catch (err) {
      setError(errorMessage(err, "Could not continue as guest."));
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="safe-top flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 sm:px-6">
        <Link
          to="/"
          className="rounded-md"
          aria-label="Back to the home page"
        >
          <FetchBrand size="md" />
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="cursor-pointer"
          >
            <Link to="/" aria-label="Back to the home page">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          {needsOwnerPassword ? (
            <section className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
              <div className="mb-3 flex items-center gap-2 text-primary">
                <ShieldCheck className="size-4" />
                <span className="text-xs font-semibold tracking-wide uppercase">
                  Owner account
                </span>
              </div>
              <h2 className="text-lg font-bold tracking-tight">
                Set your Fetch password
              </h2>
              <p className="mt-1 mb-4 text-sm leading-6 text-muted-foreground">
                {RESERVED_ADMIN_EMAIL} has no password yet. Setting one here
                signs you straight into the admin console.
              </p>
              <form onSubmit={handleOwnerPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="owner-password">Password</Label>
                  <Input
                    id="owner-password"
                    name="password"
                    type="password"
                    required
                    minLength={10}
                    autoComplete="new-password"
                    placeholder="••••••••••"
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    At least 10 characters, with a letter and a number.
                  </p>
                </div>
                {ownerPwError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {ownerPwError}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  disabled={ownerPwBusy}
                  className="w-full cursor-pointer"
                >
                  {ownerPwBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {ownerPwBusy ? "Setting…" : "Open the admin console"}
                </Button>
              </form>
            </section>
          ) : null}

          {step === "signIn" ? (
            <section className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
              <h1 className="text-2xl font-bold tracking-tight">
                {t("auth", "title")}
              </h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {mode === "otp" ? t("auth", "otpHint") : t("auth", "passwordHint")}
              </p>

              {mode === "otp" ? (
                <form onSubmit={handleEmailSubmit} className="mt-5 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-email">{t("auth", "email")}</Label>
                    <Input
                      id="auth-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder={t("auth", "emailPlaceholder")}
                    />
                  </div>
                  {error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full cursor-pointer"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {t("auth", "sendCode")}
                  </Button>
                </form>
              ) : (
                <form
                  onSubmit={handlePasswordSubmit}
                  className="mt-5 space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="pw-email">{t("auth", "email")}</Label>
                    <Input
                      id="pw-email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      placeholder={t("auth", "emailPlaceholder")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pw-password">{t("auth", "password")}</Label>
                    <Input
                      id="pw-password"
                      name="password"
                      type="password"
                      required
                      minLength={pwFlow === "signUp" ? 10 : undefined}
                      autoComplete={
                        pwFlow === "signUp" ? "new-password" : "current-password"
                      }
                      placeholder="••••••••••"
                    />
                    <p className="text-xs leading-5 text-muted-foreground">
                      {pwFlow === "signUp"
                        ? t("auth", "createHint")
                        : t("auth", "passwordHint")}
                    </p>
                  </div>
                  {error ? (
                    <p role="alert" className="text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full cursor-pointer"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {pwFlow === "signUp"
                      ? t("auth", "submitSignUp")
                      : t("auth", "submitSignIn")}
                  </Button>
                  <button
                    type="button"
                    onClick={() =>
                      setPwFlow(pwFlow === "signUp" ? "signIn" : "signUp")
                    }
                    className="w-full cursor-pointer text-center text-sm text-muted-foreground hover:text-foreground"
                  >
                    {pwFlow === "signUp"
                      ? t("auth", "signIn")
                      : t("auth", "noAccount")}{" "}
                    <span className="font-medium text-foreground underline">
                      {pwFlow === "signUp"
                        ? t("auth", "signIn")
                        : t("auth", "signUp")}
                    </span>
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => {
                  setMode(mode === "otp" ? "password" : "otp");
                  setError(null);
                }}
                className="mt-4 w-full cursor-pointer text-center text-sm text-primary hover:underline"
              >
                {mode === "otp"
                  ? t("auth", "signInWithPassword")
                  : t("auth", "signInWithEmailCode")}
              </button>

              <div className="my-5 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">
                  {t("auth", "orContinueWith")}
                </span>
                <Separator className="flex-1" />
              </div>

              <Button
                type="button"
                variant="secondary"
                disabled={isLoading}
                onClick={() => void handleGuestLogin()}
                className="w-full cursor-pointer"
              >
                {t("auth", "guest")}
              </Button>
              <p className="mt-2 text-center text-xs leading-5 text-muted-foreground">
                {t("auth", "guestNoteShort")}
              </p>
            </section>
          ) : (
            <section className="rounded-xl border border-border/70 bg-card p-5 sm:p-6">
              <h1 className="text-xl font-bold tracking-tight">
                {t("auth", "checkEmail")}
              </h1>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {t("auth", "sentTo")}{" "}
                <span className="font-medium text-foreground">
                  {step.email}
                </span>
              </p>

              <form onSubmit={handleOtpSubmit} className="mt-5 space-y-4">
                <input type="hidden" name="email" value={step.email} />
                <input type="hidden" name="code" value={otp} />
                <div className="space-y-2">
                  <Label htmlFor="auth-otp">{t("auth", "enterCode")}</Label>
                  <InputOTP
                    id="auth-otp"
                    value={otp}
                    onChange={setOtp}
                    maxLength={6}
                    containerClassName="justify-center"
                  >
                    <InputOTPGroup>
                      {[0, 1, 2, 3, 4, 5].map((index) => (
                        <InputOTPSlot key={index} index={index} />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  disabled={isLoading || otp.length < 6}
                  className="w-full cursor-pointer"
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {t("auth", "verifyContinue")}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("signIn");
                    setOtp("");
                    setError(null);
                  }}
                  className="w-full cursor-pointer text-center text-sm text-muted-foreground hover:text-foreground"
                >
                  {t("auth", "differentEmail")}
                </button>
              </form>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

export default Auth;
