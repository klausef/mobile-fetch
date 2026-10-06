import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

/**
 * The list primitives the account surfaces are built from.
 *
 * A row is "a thing you can go to or change", so it has to work three ways: as
 * a route (Trips), as an external link (mailto for support), and as an action
 * that opens something in place (change password). Rendering all three through
 * one component is what keeps them looking identical — the alternative is three
 * near-identical blocks that drift apart the first time somebody adds a row.
 *
 * Shared because both the sliding account panel and the profile page use it,
 * and a second copy of this list in each would be the exact duplication that
 * made the old account card drift in the first place.
 */

/** One row: icon, label, optional current value, chevron. */
export function SettingRow({
  icon: Icon,
  label,
  hint,
  to,
  href,
  onClick,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  /** The current value, or a short explanation of what the row does. */
  hint?: string;
  to?: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
}) {
  const className = cn(
    "flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    destructive && "text-destructive hover:bg-destructive/5",
  );
  const body = (
    <>
      {/* No filled chip behind the icon. Four saturated circles in a column
          read as four badges competing with each other, and the icon alone is
          already the thing that distinguishes the rows; the circle only added
          weight and made a short list look busy. */}
      <Icon aria-hidden className="size-[18px] shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium tracking-tight">
          {label}
        </span>
        {hint ? (
          <span className="block truncate text-xs text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </span>
      <ChevronRight
        aria-hidden
        className="size-4 shrink-0 text-muted-foreground/60"
      />
    </>
  );

  if (to) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {body}
      </Link>
    );
  }
  // A real href, not a click handler: an email link should be copyable,
  // middle-clickable and announced as a link. The click still runs, so a panel
  // hosting the row can close itself as the mail app takes over.
  if (href) {
    return (
      <a href={href} className={className} onClick={onClick}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

/**
 * A card of rows, optionally under a heading.
 *
 * The heading is optional because a short list does not need one. Two labelled
 * cards of three rows each is more chrome than the content earns — the labels
 * were doing work when the groups were "preferences" and "activity", and none
 * at all once a panel is just a list of where you can go.
 */
export function SettingGroup({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      {title ? (
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title}
        </h2>
      ) : null}
      <div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card">
        {children}
      </div>
    </section>
  );
}
