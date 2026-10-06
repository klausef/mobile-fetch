import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { quickRepliesFor } from "@/convex/lib/chat";
import { errorMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Loader2, SendHorizonal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

/**
 * One ride's messages.
 *
 * A single reactive query per mounted thread is what makes this "realtime":
 * Convex pushes the other side's message into every open client with no
 * polling, no socket code, and no extra service.
 */
function useRideThread(rideId: Id<"rides">) {
  return useQuery(api.chat.listForRide, { rideId });
}

function clockTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The messages of a ride thread, and the box to type the next one in.
 *
 * Split out of RideChat so the sheet on the booking screen and the
 * full-screen conversation on the Chats tab are the same code — one wording,
 * one send path, one scroll behaviour.
 */
export function ChatThread({
  rideId,
  className,
}: {
  rideId: Id<"rides">;
  className?: string;
}) {
  const thread = useRideThread(rideId);
  const send = useMutation(api.chat.send);
  const markRead = useMutation(api.chat.markRead);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const messages = thread?.messages ?? [];
  const quickReplies = quickRepliesFor(thread?.myRole);
  const closed = thread?.cancelled === true;

  // Opening the thread is what marks it read. Only fires when there is
  // something new: the dependency is the newest message, so scrolling and
  // re-rendering do not write to the database over and over.
  const newestId = messages[messages.length - 1]?._id ?? null;
  useEffect(() => {
    if (newestId) void markRead({ rideId });
  }, [rideId, newestId, markRead]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  /** One send path for both the composer and the one-tap replies. */
  const post = async (text: string) => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await send({ rideId, body });
      setDraft("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    await post(draft);
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-3", className)}>
      <div
        ref={listRef}
        className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-secondary/40 p-3"
      >
        {messages.length === 0 ? (
          <p className="m-auto px-2 text-center text-xs leading-5 text-muted-foreground">
            No messages yet. Use this for things like{" "}
            &ldquo;gate is closed, use the back gate&rdquo; or{" "}
            &ldquo;the store has no stock&rdquo;.
          </p>
        ) : (
          messages.map((message) =>
            // A status line is the ride talking, not a person, so it sits in
            // the middle as a quiet rule rather than in somebody's bubble.
            message.kind === "system" ? (
              <p
                key={message._id}
                className="self-center rounded-full bg-secondary px-3 py-1 text-center text-[11px] font-medium tracking-tight text-muted-foreground"
              >
                {message.body}
              </p>
            ) : (
              <div
                key={message._id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6",
                  message.mine
                    ? "ml-auto rounded-br-md bg-primary text-primary-foreground"
                    : "mr-auto rounded-bl-md border border-border bg-background",
                )}
              >
                {!message.mine ? (
                  <p className="mb-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    {message.senderName}
                  </p>
                ) : null}
                <p className="whitespace-pre-line break-words">{message.body}</p>
                <p
                  className={cn(
                    "mt-1 text-[10px]",
                    message.mine
                      ? "text-right text-white/70"
                      : "text-muted-foreground",
                  )}
                >
                  {clockTime(message.createdAt)}
                </p>
              </div>
            ),
          )
        )}
      </div>

      {closed ? (
        <p className="text-xs leading-5 text-muted-foreground">
          This ride was cancelled, so the chat is closed.
        </p>
      ) : null}

      {/* The sentences people type one-handed on a moving tricycle. Offering
          them is what keeps a trip thread short enough to be worth reading. */}
      {!closed ? (
        <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {quickReplies.map((reply) => (
            <li key={reply.label}>
              <button
                type="button"
                onClick={() => void post(reply.body)}
                disabled={sending}
                className="min-h-9 shrink-0 rounded-full border border-border bg-background px-3 text-xs font-medium tracking-tight text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {reply.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message"
          maxLength={500}
          disabled={sending || closed}
          className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:h-10"
        />
        <Button
          type="submit"
          size="icon"
          className="rounded-full"
          disabled={sending || !draft.trim() || closed}
          aria-label="Send message"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizonal className="size-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
