import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  dictionaryFor,
  LOCALE_HTML_LANG,
  LOCALES,
  LOCALE_STORAGE_KEY,
  pickInitialLocale,
  type Dictionary,
  type Locale,
} from "./index";

type Translator = <K extends keyof Dictionary>(
  section: K,
  key: keyof Dictionary[K],
  /**
   * Values for `{name}` tokens in the string.
   *
   * Interpolating rather than concatenating in the caller, because where the
   * value lands in the sentence is a property of the language: "riders are on
   * the road in Malaybalay and Valencia" and the Bisaya of it do not put the
   * names in the same place.
   */
  vars?: Record<string, string>,
) => string;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Translator;
  dictionary: Dictionary;
  locales: readonly Locale[];
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

/** Read the stored choice, ignoring anything unreadable. */
function readStored(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Private browsing on some browsers throws on access rather than
    // returning null. Losing the preference is fine; failing to boot is not.
    return null;
  }
}

function writeStored(locale: Locale): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Same as above: a full or blocked storage must not break the app.
  }
}

export {
  LOCALES,
  LOCALE_NAMES,
  pickInitialLocale,
  type Locale,
} from "./index";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Chosen once, on the first render, and then held in state. English unless
  // the stored choice says otherwise — see `pickInitialLocale` for why the
  // browser's language list is not asked.
  const [locale, setLocaleState] = useState<Locale>(() =>
    pickInitialLocale(readStored()),
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    writeStored(next);
    // The html lang attribute drives hyphenation, font fallback and the
    // screen reader's pronunciation, so it has to follow the choice.
    if (typeof document !== "undefined") {
      document.documentElement.lang = LOCALE_HTML_LANG[next] ?? next;
    }
  }, []);

  const dictionary = dictionaryFor(locale);

  const value = useMemo<LocaleContextValue>(() => {
    const t: Translator = (section, key, vars) => {
      const group = dictionary[section] as Record<string, string> | undefined;
      // Falls back to the key itself rather than throwing or rendering
      // "undefined": a missing string is a bug, but the person using the app
      // should see a slightly odd label rather than a blank screen.
      const template = group?.[key as string] ?? String(key);
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        vars[name] ?? match,
      );
    };
    return { locale, setLocale, t, dictionary, locales: LOCALES };
  }, [dictionary, locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/** The current locale, the translator, and a setter. */
export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useLocale must be used inside a LocaleProvider.");
  }
  return value;
}

/**
 * Shorthand for the common case: just the translator.
 *
 * `const t = useT()` then `t("nav", "home")`.
 */
export function useT(): Translator {
  return useLocale().t;
}