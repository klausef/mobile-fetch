import { AppShell } from "@/components/AppShell";
import { ChatThread } from "@/components/ride/ChatThread";
import { StatusChip } from "@/components/ride/RideStatus";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { initials } from "@/lib/account";
import { audienceForRole, serviceLabel } from "@/lib/booking";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageCircle, ShieldOff } from "lucide-react";
import { useState } from "react";
import { Link, Navigate } from "react-router";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";

type OpenThread = {
  rideId: Id<"rides">;
  name: string;
  code: string;
  /** The rider, when there is one — the only person a commuter can block. */
  riderId: Id<"users"> | null;
};

/**
 * Every conversation this account is in, with the person on the other side of
 * the trip.
 *
 * Chat is ride-scoped, so a thread appears here once someone has actually
 * written in it — an empty conversation with a rider who was never assigned
 * would be noise. The list is one reactive query: a message arriving anywhere
 * in the app reorders this page without a refresh.
 */
export default function Chats() {
  const profile = useQuery(api.profiles.getMyProfile);
  const threads = useQuery(api.chat.listThreads);
  const blockRider = useMutation(api.chat.blockRider);
  const [open, setOpen] = useState<OpenThread | null>(null);
  const [blocking, setBlocking] = useState(false);

  if (profile === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (profile === null) return <Navigate to="/onboarding" replace />;

  // The same helper the ride lists use, so a rider's "Padala" never shows up
  // on their passenger's screen.
  const audience = audienceForRole(profile.role);
  const isRider = profile.role === "rider";
  const list = threads ?? [];

  return (
    <AppShell bottomActiveKey="chats">
      <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col sm:min-h-[calc(100dvh-4rem)]">
        <div className="border-b border-border">
          <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
            <h1 className="text-3xl font-bold tracking-tight">Chats</h1>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-5 sm:px-6 sm:py-6">
          <h2 className="text-sm font-semibold tracking-tight">Your chats</h2>

          <div className="mt-3 overflow-hidden rounded-2xl border border-border">
            {threads === undefined ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : list.length === 0 ? (
              <div className="flex items-center gap-4 px-4 py-6">
                <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-fetch-royal">
                  <MessageCircle className="size-8 text-white" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold tracking-tight">
                    No chats yet
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Messages with your rider appear here once a trip is booked —
                    ask about the gate, the fare, or what the store has in
                    stock.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {list.map((thread) => (
                  <li key={thread.rideId}>
                    <button
                      type="button"
                      onClick={() =>
                        setOpen({
                          rideId: thread.rideId,
                          name: thread.counterpartyName,
                          code: thread.code,
                          riderId: isRider ? null : thread.counterpartyId,
                        })
                      }
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                        {initials(thread.counterpartyName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-sm font-semibold tracking-tight">
                              {thread.counterpartyName}
                            </span>
                            {/* The dot, not the count: what a commuter needs to
                                know here is "this one is waiting on me". */}
                            {thread.unread ? (
                              <span
                                className="size-2 shrink-0 rounded-full bg-fetch-red"
                                aria-label="Unread messages"
                              />
                            ) : null}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatDistanceToNow(thread.lastMessageAt, {
                              addSuffix: true,
                            })}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {thread.lastMessageMine ? "You: " : ""}
                          {thread.lastMessage}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {thread.code} ·{" "}
                            {serviceLabel(thread.bookingType, audience)}
                          </span>
                          <StatusChip status={thread.status} />
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Chats belong to a trip, so both of you can read them. Tap a
            conversation to reply.
          </p>

          {/* A chat needs a trip: this is the way to start one. */}
          <div className="sticky bottom-0 -mx-4 mt-auto bg-background px-4 pt-5 sm:-mx-6 sm:px-6">
            <Button
              asChild
              className="h-12 w-full rounded-full bg-fetch-brick text-base font-bold text-white hover:bg-fetch-brick/90 sm:h-12"
            >
              <Link to={isRider ? "/rider" : "/book?type=ride"}>
                {isRider ? "Go to dashboard" : "Book a ride to start a chat"}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* The conversation, full screen. */}
      <Sheet
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
      >
        <SheetContent side="bottom" className="h-[92dvh]">
          <SheetHeader>
            <SheetTitle>
              {open ? `Chat with ${open.name}` : "Chat"}
            </SheetTitle>
            <SheetDescription>
              {open
                ? `Trip ${open.code} · messages are visible to both of you.`
                : null}
            </SheetDescription>
            {open?.riderId ? (
              <button
                type="button"
                disabled={blocking}
                onClick={async () => {
                  setBlocking(true);
                  try {
                    await blockRider({ riderId: open.riderId! });
                    toast.success(`${open.name} cannot take your trips again.`);
                    setOpen(null);
                  } catch (error) {
                    toast.error(errorMessage(error));
                  } finally {
                    setBlocking(false);
                  }
                }}
                className="flex min-h-11 items-center gap-2 self-start rounded-full px-3 text-xs font-semibold tracking-tight text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ShieldOff className="size-4" aria-hidden />
                Block this rider
              </button>
            ) : null}
          </SheetHeader>
          {open ? (
            <ChatThread
              rideId={open.rideId}
              className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
