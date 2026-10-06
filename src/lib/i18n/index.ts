/**
 * The string catalogue: which dictionary goes with which locale, and how to
 * read a key out of one.
 *
 * No React here. The provider in `LocaleProvider.tsx` owns the state; this
 * module owns the data, so it can be imported by a test, by a Convex function,
 * or by a plain script without dragging a hook along.
 */

import { en, type Dictionary } from "./en";

export { en };
import { ceb } from "./ceb";
import { DEFAULT_LOCALE, type Locale } from "./locale";

/** Every language, keyed by locale. Add a locale here and nothing else. */
export const DICTIONARIES: Record<Locale, Dictionary> = {
  en,
  ceb,
};

export const dictionaryFor = (locale: Locale): Dictionary =>
  DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];

export type { Dictionary };
export type { Locale };
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_NAMES,
  LOCALE_HTML_LANG,
  LOCALE_STORAGE_KEY,
  isLocale,
  isRecognisedLocaleTag,
  pickInitialLocale,
  resolveLocale,
} from "./locale";