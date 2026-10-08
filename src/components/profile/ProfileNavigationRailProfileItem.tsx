import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export function ProfileNavigationRailProfileItem({
  label,
  href,
  children,
  className,
}: {
  label: string;
  href?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href ?? "#"}
      className={cn(
        "flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        href ? "hover:bg-secondary hover:text-foreground" : "cursor-default",
        className
      )}
    >
      <span className="shrink-0">{children}</span>
      <span className="truncate">{label}</span>
    </a>
  );
}
