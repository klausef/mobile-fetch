/**
 * Which language the app speaks.
 *
 * Kept as a plain union and a couple of pure functions rather than a
 * dictionary lookup here, because everything about *picking* the locale has to
 * be unit testable and nothing about it belongs in a React file.
 */

/** The languages FETCH ships. English first: it is the default, so it leads
 *  the switcher too. */
export const LOCALES = ["en", "ceb"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** What each one is called, in that language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  // "Bisaya", which is what somebody in Bukidnon actually calls the language.
  ceb: "Bisaya",
};

/** The tag to put on <html lang>, so the browser picks the right hyphenation. */
export const LOCALE_HTML_LANG: Record<Locale, string> = {
  en: "en-PH",
  ceb: "ceb-PH",
};

/** The storage key. Versioned so a future rename does not read old junk. */
export const LOCALE_STORAGE_KEY = "fetch.locale.v1";

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Turn anything a browser might hand us into one of ours.
 *
 * Checks our own short tags first (`ceb`, `en`) and then the full tags people
 * actually have on their phones — a phone set to "Cebuano" reports `fil`, which
 * is the same language under its other name, and shipping the app to somebody
 * whose phone says `fil-PH` and then showing them English is the failure this
 * function exists to prevent.
 */
export function resolveLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  const primary = input.trim().toLowerCase().split(/[-_]/)[0];
  if (isLocale(primary)) return primary;
  // Filipino and Cebuano are the same language to a speaker; treat the tag as
  // the same language rather than as no match.
  if (primary === "fil") return "ceb";
  return DEFAULT_LOCALE;
}

/**
 * Does this string name one of our locales, in any spelling we accept?
 *
 * `resolveLocale` maps `fil` to `ceb`, so it answers "ceb" for a Filipino tag
 * too. Asking it alone is not enough to tell a real tag from junk: junk resolves
 * to the English default, and "ja" does not start with "en", so the caller
 * could go on to reject it — but "fil" also does not start with "ceb", and
 * rejecting that would quietly undo the alias this module went to the trouble of
 * supporting. One predicate, so both facts live in the same place.
 */
export function isRecognisedLocaleTag(
  input: string | null | undefined,
): boolean {
  const primary = (input ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(primary) || primary === "fil";
}

/**
 * The locale to start in, given a stored choice.
 *
 * English unless somebody has already chosen otherwise — and "otherwise" means
 * they picked Bisaya in Settings, not that their phone happens to be set to
 * Filipino. The browser's language list is deliberately not consulted.
 *
 * It used to be, and that was wrong in a way nobody could argue with: a phone
 * in Bukidnon commonly reports `fil-PH`, `resolveLocale` maps that to `ceb` on
 * the grounds that they are the same language to a speaker, and so the app
 * greeted a commuter in a language they had never asked for. Two taps in
 * Settings put it back, and most people never find those two taps. English
 * first is the boring default that somebody who wants Bisaya can reach in one
 * tap, rather than the one they have to go and undo.
 */
export function pickInitialLocale(
  stored: string | null | undefined,
): Locale {
  if (isLocale(stored)) return stored;
  // A full "ceb-PH", or a Filipino tag, stored from an older build or by hand.
  if (isRecognisedLocaleTag(stored)) return resolveLocale(stored);
  return DEFAULT_LOCALE;
}