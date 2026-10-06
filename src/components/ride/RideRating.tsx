import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { errorMessage } from "@/lib/errors";
import { SCORE_VALUES } from "@/lib/ratings";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * The five stars under a finished trip.
 *
 * Only the passenger leaves one, and only once the trip is finished — a rating
 * about a ride that has not happened is a rating about an expectation. The
 * stars are buttons rather than a picker, because the whole point is to be
 * finished in one tap, and re-rating replaces the old one instead of adding a
 * second.
 */
export function RideRating({
  rideId,
  className,
}: {
  rideId: Id<"rides">;
  className?: string;
}) {
  const existing = useQuery(api.ratings.forRide, { rideId });
  const rate = useMutation(api.ratings.rate);
  const [hovered, setHovered] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const current = existing?.score ?? 0;
  const shown = hovered ?? current;

  const give = async (score: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await rate({ rideId, score });
      toast.success(
        score === 5 ? "Thanks — glad it went well." : "Thanks, noted.",
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("pt-1", className)}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {current ? "Your rating" : "Rate your rider"}
      </p>
      <div
        className="mt-2 flex items-center gap-1"
        onMouseLeave={() => setHovered(null)}
      >
        {SCORE_VALUES.map((score) => (
          <button
            key={score}
            type="button"
            aria-label={`${score} of 5 stars`}
            aria-pressed={current === score}
            disabled={busy}
            onMouseEnter={() => setHovered(score)}
            onFocus={() => setHovered(score)}
            onBlur={() => setHovered(null)}
            onClick={() => void give(score)}
            className="flex size-10 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <Star
              className={cn(
                "size-6",
                score <= shown
                  ? "fill-fetch-gold text-fetch-gold"
                  : "text-muted-foreground/40",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
      {current ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Tap again to change it.
        </p>
      ) : null}
    </div>
  );
}

/** The star row the rider sees on their own completed trips. */
export function RideRatingReadOnly({
  rideId,
  className,
}: {
  rideId: Id<"rides">;
  className?: string;
}) {
  const existing = useQuery(api.ratings.forRide, { rideId });
  if (!existing) return null;
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      Rated {existing.score} of 5
      {existing.comment ? ` — “${existing.comment}”` : null}
    </p>
  );
}
