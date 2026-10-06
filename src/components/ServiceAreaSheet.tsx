import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/LocaleProvider";
import { LIVE_CITIES, PLANNED_MUNICIPALITIES } from "@/lib/region";
import { Check } from "lucide-react";

/**
 * Where Fetch runs, stated as two cities rather than twenty-two.
 *
 * The map and the geocoder open across the whole province, so it is tempting to
 * claim the province. But a request from a town with no rider online sits in
 * SEARCHING until the commuter cancels it, and "we run in Bukidnon" is a
 * promise the app cannot keep yet. So the live cities lead, each with what is
 * actually inside its radius, and the rest of the province is listed underneath
 * as coming next — which tells somebody in Maramag that Fetch knows their town
 * exists rather than that the app is broken there.
 *
 * Controlled, and opened from more than one place (the booking home's tile, the
 * account panel, the profile page), so it is a destination rather than a button
 * of its own.
 */
export function ServiceAreaSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-base tracking-tight">
            {t("coverage", "title")}
          </SheetTitle>
          <SheetDescription className="text-sm leading-6 text-muted-foreground">
            {t("coverage", "intro")}
          </SheetDescription>
        </SheetHeader>

        <ul className="mt-4 space-y-2.5">
          {LIVE_CITIES.map((city) => (
            <li
              key={city.name}
              className="rounded-2xl border border-fetch-red/30 bg-fetch-red/5 p-4"
            >
              <div className="flex items-start gap-2.5">
                {/* A tick rather than a dot: this list is a short "yes" and a
                    longer "not yet", and the difference should be legible
                    before a word is read. */}
                <span
                  aria-hidden
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-fetch-red text-white"
                >
                  <Check className="size-3" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold tracking-tight">
                    {city.name}
                  </p>
                  <p className="text-xs text-muted-foreground">{city.area}</p>
                  <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                    {city.blurb}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <h3 className="px-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {t("coverage", "comingNext")}
          </h3>
          <p className="mt-1.5 px-1 text-xs leading-5 text-muted-foreground">
            {t("coverage", "comingNextHint")}
          </p>
          <ul className="mt-2.5 flex flex-wrap gap-2">
            {PLANNED_MUNICIPALITIES.map((town) => (
              <li
                key={town}
                className="rounded-full border border-border px-3 py-1.5 text-xs tracking-tight text-muted-foreground"
              >
                {town}
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}
