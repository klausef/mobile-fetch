import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export const STATUS_LABEL: Record<string, string> = {
  SEARCHING: "Searching for a rider",
  ACCEPTED: "Rider assigned",
  RIDER_ARRIVING: "Rider on the way",
  RIDER_ARRIVED: "Rider has arrived",
  IN_PROGRESS: "Ride in progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const STATUS_STEPS = [
  "SEARCHING",
  "ACCEPTED",
  "RIDER_ARRIVING",
  "RIDER_ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;

/**
 * A trip's status as a small pill.
 *
 * Lives here rather than in either screen that shows it, so the history list
 * and its detail dialog cannot drift into two different-looking chips for the
 * same status.
 */
export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]",
        status === "COMPLETED" ? "text-foreground" : "text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function RideTimeline({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return (
      <div className="rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-sm text-muted-foreground">
        This ride was cancelled.
      </div>
    );
  }

  const currentIndex = STATUS_STEPS.indexOf(status as (typeof STATUS_STEPS)[number]);

  return (
    <ol className="space-y-0">
      {STATUS_STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;
        const last = index === STATUS_STEPS.length - 1;
        return (
          <li key={step} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                  done && "border-foreground bg-foreground text-background",
                  active && "border-foreground bg-background",
                  !done && !active && "border-border",
                )}
              >
                {done ? (
                  <Check className="size-3" />
                ) : (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      active ? "bg-foreground" : "bg-border",
                    )}
                  />
                )}
              </span>
              {!last ? (
                <span
                  className={cn(
                    "my-1 w-px flex-1",
                    done ? "bg-foreground/60" : "bg-border",
                  )}
                />
              ) : null}
            </div>
            <span
              className={cn(
                "pb-4 pt-0.5 text-sm tracking-tight",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {STATUS_LABEL[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
