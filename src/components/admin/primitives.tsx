/**
 * The console's repeated furniture: panels, stat cards, empty states, filters.
 *
 * ── Why these exist at all ─────────────────────────────────────────────────
 * Nine sections of console each need "a bordered box with a heading", "four
 * big numbers", "nothing here yet" and a row of filters. Written inline in
 * every tab they drift within one release — different radii, different muted
 * greys, a table that is flush on one screen and padded on the next — and the
 * result reads as eight tools rather than one console.
 *
 * ── Why a stat card is not a table row ─────────────────────────────────────
 * The four numbers an admin opens the console for are a *headline*, and a
 * headline that scrolls is not one. They get their own row, at the top, with
 * the label above the figure so a glance reads top-down.
 */

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Panel({
  title,
  description,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-4 sm:p-5",
        className,
      )}
    >
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        {Icon ? (
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * What an empty list says.
 *
 * Always says what would fill it. A bare "No results" makes an empty console
 * look broken and gives an admin nothing to check — the query, the filter, or
 * their own filter choice are all plausible and all different.
 */
export function EmptyState({
  title,
  hint,
  icon: Icon,
  className,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-border px-4 py-8 text-center",
        className,
      )}
    >
      {Icon ? <Icon className="mx-auto size-5 text-muted-foreground" /> : null}
      <p className="mt-2 text-sm font-medium tracking-tight">{title}</p>
      {hint ? (
        <p className="mx-auto mt-1 max-w-[26rem] text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A row of filter chips.
 *
 * A group rather than a `<select>` because every one of these lists is short
 * and the whole point of the filter is to be one tap. The pressed state is
 * announced as `aria-pressed`, not only by colour.
 */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium tracking-tight transition-colors",
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A table that stays readable on a phone.
 *
 * `block` on a phone turns each row into a stack of labelled cells instead of
 * a horizontally-scrolling table nobody can read. The header row is hidden
 * there, and each cell carries its own label from `label` — so the same markup
 * is a table on a laptop and a list of cards on a phone, with no second
 * component to keep in step.
 */
export function DataTable({
  head,
  children,
  className,
}: {
  head: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead className="hidden sm:table-header-group">
          <tr className="border-b border-border">
            {head.map((label) => (
              <th
                key={label}
                scope="col"
                className="whitespace-nowrap px-2 py-2 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({
  label,
  children,
  className,
}: {
  /** Shown above the value on a phone, where the table header is hidden. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-2 py-2.5 align-top ${className ?? ""}`}>
      <span className="mb-0.5 block text-[10px] uppercase tracking-[0.12em] text-muted-foreground sm:hidden">
        {label}
      </span>
      {children}
    </td>
  );
}