/**
 * Driver Documents: the approval queue.
 *
 * ── Why the queue is a queue and not a settings page ───────────────────────
 * Every other section of this console is configuration that can wait for a
 * quiet hour. This one is a queue of people who have applied and are waiting to
 * earn, so it is the only section whose cost of delay is paid by somebody who
 * is not an admin — hence the badge on the sidebar, so it can be noticed
 * without being opened.
 *
 * ── Why a rejection must carry a reason ────────────────────────────────────
 * `setRiderApproval` writes the note onto the rider row *and* notifies them
 * with it. A decline with no reason is not actionable: the applicant cannot
 * fix it, support cannot explain it, and the console has no record of why. So
 * the reason box is required before the button enables, rather than validated
 * after the fact — the button being visibly disabled is the whole affordance.
 *
 * ── Why the document is previewed and not just described ────────────────────
 * An approval is a judgement about a photograph and a plate. Reading "Photo
 * uploaded" and deciding does not work, so the image is shown at the size it
 * will be judged at.
 */

import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, FileText, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyState,
  Panel,
} from "@/components/admin/primitives";
import { errorMessage } from "@/lib/errors";

type Decision = "APPROVED" | "REJECTED";

export function DocumentsTab() {
  const queue = useQuery(api.admin.listDriverDocuments);
  const decide = useMutation(api.admin.setRiderApproval);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const decide_ = async (riderId: Id<"riders">, approval: Decision) => {
    const note = notes[riderId] ?? "";
    // Checked here as well as on the button: the button being disabled is a
    // hint, and this is the line that actually enforces it.
    if (approval === "REJECTED" && note.trim().length === 0) {
      toast.error("Write why. The applicant is told the reason.");
      return;
    }
    setBusy(riderId);
    try {
      await decide({ riderId, approval, note: note.trim() || undefined });
      toast.success(
        approval === "APPROVED"
          ? "Driver approved and notified."
          : "Application declined and the driver notified.",
      );
      setNotes((prev) => ({ ...prev, [riderId]: "" }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (!queue) return <EmptyState title="Loading the queue…" />;

  return (
    <div className="space-y-4">
      {queue.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No applications waiting"
          hint="Every driver who applied has been reviewed. New applications appear here the moment they are submitted."
        />
      ) : (
        queue.map((item) => {
          const note = notes[item.riderId] ?? "";
          return (
            <Panel
              key={item.riderId}
              title={item.name}
              description={`${item.vehicle.color} ${item.vehicle.make} ${item.vehicle.model} · ${item.vehicle.plate}`}
              action={
                <span className="text-[11px] text-muted-foreground">
                  Submitted{" "}
                  {new Date(item.submittedAt).toLocaleDateString("en-PH", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              }
            >
              <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)]">
                {item.photoUrl ? (
                  <a href={item.photoUrl} target="_blank" rel="noreferrer">
                    <img
                      src={item.photoUrl}
                      alt={`Document submitted by ${item.name}`}
                      className="h-36 w-full rounded-lg border border-border object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex h-36 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                    <FileText className="size-5 text-muted-foreground" />
                    <p className="mt-2 px-3 text-[11px] leading-4 text-muted-foreground">
                      No document uploaded
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    <p>{item.phone}</p>
                    {item.reviewNote ? (
                      <p className="mt-1">Last note: {item.reviewNote}</p>
                    ) : null}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`note-${item.riderId}`}>
                      Notes{" "}
                      <span className="font-normal text-muted-foreground">
                        (required to reject)
                      </span>
                    </Label>
                    <Textarea
                      id={`note-${item.riderId}`}
                      value={note}
                      onChange={(event) =>
                        setNotes((prev) => ({
                          ...prev,
                          [item.riderId]: event.target.value,
                        }))
                      }
                      placeholder="Blurry plate, wrong document, name does not match…"
                      rows={2}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={busy === item.riderId}
                      onClick={() => void decide_(item.riderId, "APPROVED")}
                    >
                      <CheckCircle2 className="size-4" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={
                        busy === item.riderId || note.trim().length === 0
                      }
                      title={
                        note.trim().length === 0
                          ? "Write a reason first — the driver is told it."
                          : undefined
                      }
                      onClick={() => void decide_(item.riderId, "REJECTED")}
                    >
                      <XCircle className="size-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            </Panel>
          );
        })
      )}
    </div>
  );
}