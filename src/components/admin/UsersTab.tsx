/**
 * Users: every account, searchable, with the ability to suspend one.
 *
 * ── Why search is the first control ────────────────────────────────────────
 * An admin comes here with a name from a support ticket. Filters narrow a list
 * they are already looking at; search finds the one they came for. So the box
 * is first and the filter chips are beside it, and the filter applies to the
 * search results rather than the other way round.
 *
 * ── Why suspension asks for a reason ───────────────────────────────────────
 * A suspension is the one thing in this console that locks a person out of
 * their own money and their own trip history. It notifies them, so a reason is
 * the only thing they will be told — "suspended, no reason" is not an answer
 * anybody can act on, and it is the reason the field is required rather than
 * optional.
 *
 * The action is deliberately not a bare confirm dialog: it asks for the words
 * that will be read by the person being suspended.
 */

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  Ban,
  Car,
  CheckCircle2,
  Search,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Cell,
  DataTable,
  EmptyState,
  FilterChips,
  Panel,
} from "@/components/admin/primitives";
import { errorMessage } from "@/lib/errors";

type RoleFilter = "all" | "rider" | "commuter";

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function UsersTab() {
  const users = useQuery(api.admin.listUsers);
  const setSuspended = useMutation(api.admin.setUserSuspended);
  const [role, setRole] = useState<RoleFilter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<Id<"users"> | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    if (!users) return [];
    const needle = query.trim().toLowerCase();
    return users
      .filter((user) =>
        role === "all" ? true : user.role === role,
      )
      .filter((user) =>
        needle.length === 0
          ? true
          : `${user.name} ${user.email ?? ""} ${user.phone ?? ""}`
              .toLowerCase()
              .includes(needle),
      );
  }, [users, role, query]);

  const open = users?.find((user) => user.userId === openId);

  const toggleSuspension = async () => {
    if (!open) return;
    const suspending = open.suspendedAt == null;
    if (suspending && reason.trim().length === 0) {
      toast.error("Write why. The person you suspend is told this reason.");
      return;
    }
    setBusy(true);
    try {
      await setSuspended({
        userId: open.userId,
        suspended: suspending,
        reason: reason.trim() || undefined,
      });
      toast.success(suspending ? "Account suspended." : "Account restored.");
      setReason("");
      setOpenId(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Accounts"
        description={`${rows.length} of ${users?.length ?? 0} shown`}
        action={
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email or phone"
            aria-label="Search users"
            className="h-9 w-full sm:w-64"
          />
        }
      >
        <div className="mb-3">
          <FilterChips<RoleFilter>
            ariaLabel="Filter by role"
            value={role}
            onChange={setRole}
            options={[
              { value: "all", label: "Everyone" },
              { value: "rider", label: "Drivers" },
              { value: "commuter", label: "Passengers" },
            ]}
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nobody matches that"
            hint={
              query.trim().length > 0
                ? "Check the spelling, or clear the search to see everyone."
                : "No accounts have been created yet."
            }
          />
        ) : (
          <DataTable head={["Name", "Role", "Status", "Trips", "Joined"]}>
            {rows.map((user) => (
              <tr key={user.userId}>
                <Cell label="Name">
                  <button
                    type="button"
                    onClick={() => setOpenId(user.userId)}
                    className="text-left transition-colors hover:text-primary"
                  >
                    <span className="font-medium">{user.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {user.email ?? "No email"}
                    </span>
                  </button>
                </Cell>
                <Cell label="Role">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap capitalize">
                    {user.role === "rider" ? (
                      <Car className="size-3.5" aria-hidden />
                    ) : (
                      <User className="size-3.5" aria-hidden />
                    )}
                    {user.role === "rider" ? "Driver" : "Passenger"}
                  </span>
                </Cell>
                <Cell label="Status">
                  {user.suspendedAt != null ? (
                    <span className="whitespace-nowrap text-primary">Suspended</span>
                  ) : user.approval === "PENDING" ? (
                    <span className="whitespace-nowrap text-muted-foreground">
                      Pending
                    </span>
                  ) : user.isOnline ? (
                    <span className="whitespace-nowrap text-muted-foreground">
                      Online
                    </span>
                  ) : (
                    <span className="whitespace-nowrap text-muted-foreground">—</span>
                  )}
                </Cell>
                <Cell label="Trips" className="tabular-nums">
                  {user.rides}
                </Cell>
                <Cell label="Joined">{formatDate(user.joinedAt)}</Cell>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      <Sheet open={openId !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-base tracking-tight">
              {open?.name ?? "Account"}
            </SheetTitle>
          </SheetHeader>
          {open ? (
            <div className="space-y-5 pt-2">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="min-w-0 truncate">{open.email ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{open.phone ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="capitalize">{open.role}</dd>
                </div>
                {open.vehicle ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Vehicle</dt>
                    <dd className="text-right">
                      {open.vehicle.color} {open.vehicle.make}{" "}
                      {open.vehicle.model}
                      <span className="block text-[11px] text-muted-foreground">
                        {open.vehicle.plate}
                      </span>
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Trips</dt>
                  <dd className="tabular-nums">
                    {open.rides} total · {open.completed} completed
                  </dd>
                </div>
              </dl>

              {open.suspendedAt != null ? (
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <p className="text-sm font-medium">Suspended</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {open.suspendedReason}
                  </p>
                </div>
              ) : null}

              {/* ── Suspension ─────────────────────────────────────────────
                  The reason box appears with the action, not behind a
                  confirm dialog: whoever is suspended is told this sentence,
                  so it has to exist before they are locked out. */}
              <div className="space-y-2 border-t border-border pt-4">
                <Label htmlFor="suspend-reason">
                  {open.suspendedAt != null
                    ? "Restore this account"
                    : "Reason for suspension"}
                </Label>
                <Textarea
                  id="suspend-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={
                    open.suspendedAt != null
                      ? "Optional note"
                      : "The driver is told exactly this."
                  }
                  rows={3}
                />
                <Button
                  variant={open.suspendedAt != null ? "default" : "destructive"}
                  className="w-full"
                  disabled={busy}
                  onClick={() => void toggleSuspension()}
                >
                  {open.suspendedAt != null ? (
                    <CheckCircle2 className="size-4" />
                  ) : (
                    <Ban className="size-4" />
                  )}
                  {open.suspendedAt != null ? "Restore account" : "Suspend account"}
                </Button>
                <p className="text-[10px] leading-4 text-muted-foreground">
                  The person is notified either way. Suspending a driver also
                  takes them offline, so any trip they are carrying finishes
                  first.
                </p>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}