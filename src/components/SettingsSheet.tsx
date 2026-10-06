import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useT } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * Light or dark, and nothing else.
 *
 * There is deliberately no "follow system" option. The app shell passes
 * `enableSystem={false}`, so "system" is not a theme next-themes can resolve —
 * selecting it would write the literal string "system" as the class name and
 * silently leave the app in whatever it already was. Two honest choices beat
 * three where the third one is a no-op.
 */
const THEMES = [
  { value: "light", labelKey: "themeLight", icon: Sun },
  { value: "dark", labelKey: "themeDark", icon: Moon },
] as const;

/**
 * Language and appearance, in one sheet.
 *
 * These were three loose controls in the header — a sun/moon toggle, a
 * language pill and a gear — which crowded out the bell and pushed the brand
 * off a narrow screen. None is a control a rider needs in the moment they are
 * taking a trip, so they now sit behind the account menu in the header.
 *
 * A sheet from the bottom, not a route: there is nowhere to navigate to when
 * it is closed, and a settings page that is only ever opened and dismissed
 * should not be a page.
 *
 * Controlled rather than owning a trigger, because the account menu is what
 * opens it. The sheet is a destination, not a button.
 */
export function SettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // The stored theme is only readable after mount, so the first paint cannot
  // know which option is selected. Painting the wrong one highlighted for a
  // frame is worse than painting none.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base tracking-tight">
            {t("settings", "title")}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-2 space-y-6 px-4">
          <section className="space-y-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("settings", "language")}
            </p>
            <LocaleSwitcher className="w-full [&>button]:flex-1" />
          </section>

          <section className="space-y-2.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {t("settings", "appearance")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {THEMES.map((option) => {
                const Icon = option.icon;
                const active = mounted && theme === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    variant={active ? "default" : "outline"}
                    aria-pressed={active}
                    onClick={() => setTheme(option.value)}
                    className={cn(
                      "h-auto min-h-11 flex-col gap-1 rounded-xl",
                      active ? "text-white" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="text-[11px] font-medium">
                      {t("settings", option.labelKey)}
                    </span>
                  </Button>
                );
              })}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}