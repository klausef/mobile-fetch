/**
 * What a rider sees while the console decides about their application.
 *
 * Shared rather than duplicated, because it now guards two screens and the two
 * copies would drift: the booking screen has always gated on approval, and the
 * dashboard tab — earnings, rating, and the vehicle editor — did not. A rider
 * declined by the console could still open their dashboard, read their earnings
 * and edit the vehicle a passenger was about to be told about. Same reason, same
 * three outcomes, one screen.
 *
 * `bottomActiveKey` lets the caller mark the tab it is standing in for, so the
 * gate does not make the bar appear to jump to a different tab.
 */
import { AppShell } from "@/components/AppShell";
import { AlertCircle, Loader2 } from "lucide-react";

export function ApprovalGate({
  approval,
  bottomActiveKey,
}: {
  approval: string;
  bottomActiveKey?: string;
}) {
  const pending = approval === "PENDING";
  return (
    <AppShell bottomActiveKey={bottomActiveKey}>
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          {pending ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (
            <AlertCircle className="size-5 text-muted-foreground" />
          )}
        </div>
        <p className="mt-5 text-sm font-medium tracking-tight">
          {pending
            ? "Waiting for approval"
            : approval === "SUSPENDED"
              ? "Your account is suspended"
              : "Your application was declined"}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {pending
            ? "Fetch verifies every rider before they take passengers. You'll get a notification the moment your account is approved."
            : "Contact Fetch support if you think this is a mistake."}
        </p>
      </div>
    </AppShell>
  );
}

/**
 * May this rider see the rider-only surfaces?
 *
 * Mirrors the server's `canOperateAsRider`, including the guest exemption: a
 * throwaway demo session is never going to sit in an approval queue, so holding
 * it here would strand it on a screen it can never leave. The server enforces
 * the same rule on the queries behind these screens — this only decides what is
 * drawn, never what is readable.
 *
 * The missing-approval case is included deliberately even though the schema
 * makes `approval` required: a rider row that has no decision on it is not an
 * approved rider, and the server says so. Keeping the two answers identical is
 * what stops a screen from showing an empty earnings panel to somebody the
 * server has already refused to pay.
 */
export function canShowRiderSurfaces(
  approval: string | undefined | null,
  isGuest: boolean | undefined,
): boolean {
  if (approval === undefined || approval === null) return false;
  return approval === "APPROVED" || isGuest === true;
}