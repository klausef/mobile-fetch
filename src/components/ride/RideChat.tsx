import { ChatThread } from "@/components/ride/ChatThread";
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
import { useQuery } from "convex/react";
import { MessageCircle } from "lucide-react";
import { useState } from "react";

/**
 * Ride-scoped chat between a commuter and their rider, opened from a ride card.
 *
 * The messages themselves live in ChatThread, which the Chats tab also renders
 * full-screen — this component is only the trigger and the sheet around it.
 */
export function RideChat({
  rideId,
  triggerLabel = "Chat",
  counterpartyName,
}: {
  rideId: Id<"rides"> | string;
  triggerLabel?: string;
  counterpartyName?: string | null;
}) {
  const [open, setOpen] = useState(false);

  // Subscribed even while the sheet is closed, otherwise the unread badge has
  // nothing to count. At most one live ride per card, so this stays cheap.
  const thread = useQuery(api.chat.listForRide, { rideId: rideId as Id<"rides"> });

  // Read state is adjusted during render (the pattern used across this app)
  // rather than in an effect: entering a ride starts its thread as read, and
  // opening the sheet catches it up.
  const threadId = String(rideId);
  const [readState, setReadState] = useState<{
    id: string;
    count: number;
  } | null>(null);
  if (thread && readState?.id !== threadId) {
    setReadState({ id: threadId, count: thread.messages.length });
  }
  if (open && thread && readState && readState.count !== thread.messages.length) {
    setReadState({ id: threadId, count: thread.messages.length });
  }
  const readCount = readState?.id === threadId ? readState.count : 0;
  const unread = Math.max(0, (thread?.messages.length ?? 0) - readCount);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="relative"
        onClick={() => setOpen(true)}
      >
        <MessageCircle className="size-3.5" />
        {triggerLabel}
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[88dvh]">
          <SheetHeader>
            <SheetTitle>
              {counterpartyName
                ? `Chat with ${counterpartyName}`
                : "Ride chat"}
            </SheetTitle>
            <SheetDescription>
              Messages are tied to this trip and visible to both of you.
            </SheetDescription>
          </SheetHeader>

          <ChatThread
            rideId={rideId as Id<"rides">}
            className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
