/**
 * Support tickets, and the audit log beside it in the console's vocabulary.
 *
 * ── Why a ticket is not a chat with a flag ─────────────────────────────────
 * Because it has a lifecycle an admin has to be able to *see*. A conversation
 * where somebody asked a question three days ago and never got an answer looks
 * identical to one that is actively in progress unless the status says
 * otherwise, and the status is the only thing that keeps a queue honest.
 *
 * ── Why resolving and replying are one action ──────────────────────────────
 * "Reply and resolve" is the action admins take most, and splitting it into
 * send-then-a-second-click-resolve produces the classic failure: a reply sent,
 * the ticket left open, and the queue slowly fills with answered questions
 * that look unanswered.
 *
 * ── Why the log is append-only and searchable ──────────────────────────────
 * Every consequential action writes one row from inside the mutation that did
 * it, never from the client afterwards — a log that can be skipped by a failed
 * request is not an audit trail. Search is over action, admin, target and
 * detail, because "who suspended this rider" is the question it exists for and
 * nobody remembers which filter they used last time.
 */

import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  LifeBuoy,
  ScrollText,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Cell,
  DataTable,
  EmptyState,
  FilterChips,
  Panel,
} from "@/components/admin/primitives";
import { errorMessage } from "@/lib/errors";

type TicketStatus = "all" | "OPEN" | "IN_PROGRESS" | "RESOLVED";

const PRIORITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Normal",
  3: "Urgent",
};

/** The colour that makes urgency visible before a word is read. */
const PRIORITY_CLASS: Record<number, string> = {
  1: "bg-secondary text-muted-foreground",
  2: "bg-secondary text-foreground",
  3: "bg-primary text-primary-foreground",
};

export function TicketsTab() {
  const [status, setStatus] = useState<TicketStatus>("all");
  const [openId, setOpenId] = useState<Id<"tickets"> | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const reply = useMutation(api.admin.replyToTicket);

  const tickets = useQuery(
    api.admin.listTickets,
    status === "all" ? {} : { status },
  );

  const open = useMemo(
    () => tickets?.find((ticket) => ticket._id === openId) ?? null,
    [tickets, openId],
  );

  const send = async (resolve: boolean) => {
    if (!open || draft.trim().length === 0) return;
    setBusy(true);
    try {
      await reply({ ticketId: open._id, body: draft.trim(), resolve });
      setDraft("");
      toast.success(resolve ? "Reply sent and ticket resolved." : "Reply sent.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Panel
        title="Tickets"
        description="Sorted by most recently touched."
        action={
          <FilterChips<TicketStatus>
            ariaLabel="Filter by status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "OPEN", label: "Open" },
              { value: "IN_PROGRESS", label: "In progress" },
              { value: "RESOLVED", label: "Resolved" },
            ]}
          />
        }
      >
        {tickets === undefined ? (
          <EmptyState title="Loading tickets…" />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Nothing in this state"
            hint="Switch the filter, or wait for someone to need help."
          />
        ) : (
          <DataTable head={["Subject", "Status", "Priority", "Replies", "Updated"]}>
            {tickets.map((ticket) => (
              <tr key={ticket._id}>
                <Cell label="Subject">
                  <button
                    type="button"
                    onClick={() => setOpenId(ticket._id)}
                    className="text-left font-medium transition-colors hover:text-primary"
                  >
                    {ticket.subject}
                  </button>
                </Cell>
                <Cell label="Status">
                  <span className="whitespace-nowrap">
                    {ticket.status === "OPEN"
                      ? "Open"
                      : ticket.status === "IN_PROGRESS"
                        ? "In progress"
                        : "Resolved"}
                  </span>
                </Cell>
                <Cell label="Priority">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_CLASS[ticket.priority] ?? PRIORITY_CLASS[2]}`}
                  >
                    {PRIORITY_LABEL[ticket.priority] ?? "Normal"}
                  </span>
                </Cell>
                <Cell label="Replies" className="tabular-nums">
                  {ticket.messages.length}
                </Cell>
                <Cell label="Updated">
                  {new Date(ticket.updatedAt).toLocaleDateString("en-PH", {
                    day: "numeric",
                    month: "short",
                  })}
                </Cell>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      {open ? (
        <Panel title={open.subject} description={`${open.messages.length} messages`}>
          <ul className="space-y-3">
            {open.messages.map((message) => (
              <li
                key={message._id}
                className={`rounded-lg border p-3 ${
                  message.fromAdmin
                    ? "border-border bg-secondary/40"
                    : "border-border bg-card"
                }`}
              >
                <p className="text-[11px] text-muted-foreground">
                  {message.senderName} ·{" "}
                  {new Date(message.createdAt).toLocaleString("en-PH", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6">
                  {message.body}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type your reply…"
              rows={3}
              aria-label="Reply"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || draft.trim().length === 0}
                onClick={() => void send(false)}
              >
                <Send className="size-4" />
                Send
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || draft.trim().length === 0}
                onClick={() => void send(true)}
              >
                <CheckCircle2 className="size-4" />
                Send and resolve
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

export function LogsTab() {
  const [search, setSearch] = useState("");
  const logs = useQuery(api.admin.listAdminLogs, { search });

  const actions = useMemo(() => {
    const seen = new Set<string>();
    for (const row of logs ?? []) seen.add(row.action);
    return [...seen].sort();
  }, [logs]);

  const [action, setAction] = useState<string>("all");

  const rows = useMemo(
    () =>
      (logs ?? []).filter((row) =>
        action === "all" ? true : row.action === action,
      ),
    [logs, action],
  );

  return (
    <Panel
      title="Admin activity"
      description="Written from inside the mutation that did the work, so it cannot be skipped."
      action={
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search action, admin or person"
          aria-label="Search the log"
          className="h-9 w-full sm:w-64"
        />
      }
    >
      {actions.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setAction("all")}
            aria-pressed={action === "all"}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              action === "all"
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-secondary"
            }`}
          >
            All
          </button>
          {actions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setAction(name)}
              aria-pressed={action === name}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                action === name
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {name.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No entries match"
          hint="Every suspension, approval, fare change and ticket action lands here."
        />
      ) : (
        <DataTable head={["When", "Admin", "Action", "Affected", "Details"]}>
          {rows.map((row) => (
            <tr key={row._id}>
              <Cell label="When" className="whitespace-nowrap">
                {new Date(row.createdAt).toLocaleString("en-PH", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Cell>
              <Cell label="Admin">{row.adminName}</Cell>
              <Cell label="Action">
                <span className="whitespace-nowrap">
                  {row.action.replace(/_/g, " ")}
                </span>
              </Cell>
              <Cell label="Affected">{row.targetName ?? "—"}</Cell>
              <Cell label="Details" className="max-w-[22rem]">
                <span className="line-clamp-2 text-muted-foreground">
                  {row.details ?? "—"}
                </span>
              </Cell>
            </tr>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}