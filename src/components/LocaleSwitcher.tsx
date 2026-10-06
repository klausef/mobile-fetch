import { cn } from "@/lib/utils";
import {
  LOCALE_NAMES,
  useLocale,
  type Locale,
} from "@/lib/i18n/LocaleProvider";
import type { Locale as LocaleType } from "@/lib/i18n";

/**
 * "English / Bisaya", as a two-way pill.
 *
 * A segmented control rather than a dropdown because there are exactly two
 * choices and no third language to hunt through a list for. It sits in the
 * header on signed-in screens and on the welcome screen, so somebody can
 * switch before they have an account and stay switched after they make one —
 * the choice is a property of the phone, not of the session.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, locales } = useLocale();

  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        "inline-flex items-center rounded-full border border-border/80 bg-background/70 p-0.5",
        className,
      )}
    >
      {locales.map((option: LocaleType) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            // aria-pressed rather than a tab: these are two settings toggling
            // one value, not two destinations to move between.
            aria-pressed={active}
            onClick={() => setLocale(option as Locale)}
            className={cn(
              "min-h-9 rounded-full px-3 text-xs font-medium tracking-tight transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-fetch-red text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LOCALE_NAMES[option]}
          </button>
        );
      })}
    </div>
  );
}