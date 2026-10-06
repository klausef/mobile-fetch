import { cn } from "@/lib/utils";

/**
 * The FETCH crest beside the wordmark.
 *
 * Used wherever the app signs its name — the app shell header, onboarding, and
 * the landing page — so the badge only has to be swapped in one place when the
 * artwork changes.
 */
export function FetchBrand({
  className,
  badgeClassName,
  wordmarkClassName,
  showWordmark = true,
  size = "md",
}: {
  className?: string;
  badgeClassName?: string;
  wordmarkClassName?: string;
  /** Set false to render the crest alone, e.g. in a tight header. */
  showWordmark?: boolean;
  /** Crest size. The header default is deliberately large: the badge is the
   *  app's only identity in a phone-width header, and the landing hero signs
   *  the brand at `lg` where it has room to breathe. */
  size?: "sm" | "md" | "lg";
}) {
  const badge = {
    sm: "size-9",
    md: "size-11",
    lg: "size-20 sm:size-24",
  }[size];
  const wordmark = {
    sm: "text-sm tracking-[0.28em]",
    md: "text-lg tracking-[0.3em]",
    // Big enough to own the landing hero, still a step under the headline so
    // the two do not compete.
    lg: "text-4xl sm:text-5xl tracking-[0.22em]",
  }[size];
  const px = { sm: 36, md: 44, lg: 96 }[size];

  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <img
        src="/logo.svg"
        alt=""
        aria-hidden
        width={px}
        height={px}
        className={cn("shrink-0", badge, badgeClassName)}
      />
      {showWordmark ? (
        <span
          className={cn(
            "font-semibold uppercase",
            wordmark,
            wordmarkClassName,
          )}
        >
          Fetch
        </span>
      ) : null}
    </span>
  );
}