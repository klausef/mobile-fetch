import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, useLocation, useSearchParams } from "react-router";

/** A same-origin return path, or null when the value cannot be trusted. */
function safeTarget(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

/**
 * The return target a signed-out visitor should land on after signing in.
 *
 * An explicit, validated `returnTo` wins. Otherwise the current path is used,
 * so the sign-in screen can bring the visitor back to the page that blocked
 * them rather than to a generic home.
 */
export function useReturnTarget(redirectAfterAuth = "/app"): string {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const explicit = safeTarget(searchParams.get("returnTo"));
  if (explicit) return explicit;

  const here = `${location.pathname}${location.search}`;
  if (here.startsWith("/auth")) return redirectAfterAuth;
  return safeTarget(here) ?? redirectAfterAuth;
}

/**
 * Wraps a route that requires a signed-in user.
 *
 * Signed-out visitors used to be bounced straight to `/auth`, which left them
 * on a bare sign-in form with no idea which page they had asked for or why they
 * were moved. The block is now stated on the page they landed on, and sign-in
 * still returns them to it via `returnTo`. Pass `redirectImmediately` for a
 * route where the bounce really is the better experience.
 */
export function RequireAuth({
  children,
  title = "Sign in to continue",
  description = "This page is only available to signed-in users.",
  redirectImmediately = false,
}: {
  children: ReactNode;
  /** Headline on the blocked screen. */
  title?: string;
  /** Says what the visitor gets by signing in. */
  description?: string;
  /** Skip the explanation and go straight to `/auth`. */
  redirectImmediately?: boolean;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  const returnTarget = useReturnTarget();
  const signInHref = `/auth?returnTo=${encodeURIComponent(returnTarget)}`;

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (redirectImmediately) {
      return <Navigate to={signInHref} replace />;
    }

    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
        <Card className="w-full max-w-sm border-border/70 shadow-none">
          <CardHeader className="items-center text-center">
            <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Lock className="size-5" />
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            You&apos;ll come straight back to this page once you&apos;re signed
            in.
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <Button asChild className="w-full cursor-pointer">
              <Link to={signInHref}>Sign in</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full cursor-pointer">
              <Link to="/">Back to home</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  return <>{children}</>;
}
