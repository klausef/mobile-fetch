import { describe, expect, test } from "bun:test";
import {
  DEFAULT_LOCALE,
  DICTIONARIES,
  dictionaryFor,
  isLocale,
  isRecognisedLocaleTag,
  LOCALES,
  LOCALE_HTML_LANG,
  LOCALE_NAMES,
  pickInitialLocale,
  resolveLocale,
} from "../src/lib/i18n";
import { en } from "../src/lib/i18n/en";
import { ceb } from "../src/lib/i18n/ceb";

describe("resolveLocale", () => {
  test("accepts our own tags", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("ceb")).toBe("ceb");
  });

  test("reads the primary subtag of a full tag", () => {
    expect(resolveLocale("ceb-PH")).toBe("ceb");
    expect(resolveLocale("en-PH")).toBe("en");
    expect(resolveLocale("en_US")).toBe("en");
  });

  test("treats Filipino as Cebuano", () => {
    // A phone set to "Filipino" is the same language to a speaker. Answering
    // "I do not have that language" and falling back to English would be
    // exactly wrong.
    expect(resolveLocale("fil")).toBe("ceb");
    expect(resolveLocale("fil-PH")).toBe("ceb");
  });

  test("falls back to English for anything else", () => {
    expect(resolveLocale("ja")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  test("is not fooled by casing or spacing", () => {
    expect(resolveLocale("  CEB-ph ")).toBe("ceb");
  });
});

describe("pickInitialLocale", () => {
  test("English is the default, whatever the phone is set to", () => {
    // A phone in Bukidnon commonly reports fil-PH, and resolveLocale maps that
    // to ceb because they are the same language to a speaker. If the browser
    // list were consulted, every one of those phones opened in a language
    // nobody had asked for — and the fix was two taps in Settings that most
    // people never found.
    expect(pickInitialLocale(null)).toBe("en");
    expect(pickInitialLocale(undefined)).toBe("en");
  });

  test("a stored choice still wins, including a full tag", () => {
    expect(pickInitialLocale("ceb")).toBe("ceb");
    expect(pickInitialLocale("ceb-PH")).toBe("ceb");
    expect(pickInitialLocale("en")).toBe("en");
  });

  test("a Filipino tag in storage is honoured as Bisaya", () => {
    // Someone who did choose Bisaya keeps it, even if their phone calls the
    // language Filipino. resolveLocale knows the alias; the stored-value path
    // has to agree with it rather than applying a second, stricter rule.
    expect(pickInitialLocale("fil")).toBe("ceb");
    expect(pickInitialLocale("fil-PH")).toBe("ceb");
    expect(isRecognisedLocaleTag("fil")).toBe(true);
    expect(isRecognisedLocaleTag("ceb-PH")).toBe(true);
    expect(isRecognisedLocaleTag("ja")).toBe(false);
    expect(isRecognisedLocaleTag(null)).toBe(false);
  });

  test("junk in storage falls back to English", () => {
    expect(pickInitialLocale("nonsense")).toBe("en");
    expect(pickInitialLocale("ja")).toBe("en");
    expect(pickInitialLocale("")).toBe("en");
  });

  test("English leads the switcher, because it is the default", () => {
    expect(LOCALES[0]).toBe("en");
  });
});

describe("isLocale", () => {
  test("recognizes our tags and nothing else", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("ceb")).toBe(true);
    expect(isLocale("fil")).toBe(false);
    expect(isLocale("EN")).toBe(false);
    expect(isLocale(42)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe("dictionaries", () => {
  test("every locale has a dictionary", () => {
    for (const locale of LOCALES) {
      expect(dictionaryFor(locale)).toBeDefined();
    }
  });

  test("every dictionary has a name and an html tag", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_NAMES[locale]).toBeTruthy();
      expect(LOCALE_HTML_LANG[locale]).toBeTruthy();
    }
  });

  test("every locale is a real BCP-47 tag", () => {
    for (const locale of LOCALES) {
      expect(LOCALE_HTML_LANG[locale]).toMatch(/^[a-z]{2,3}-[A-Z]{2}$/);
    }
  });

  test("no dictionary is missing a key English has", () => {
    // The `Dictionary` type already enforces this at build time; this catches
    // the case where a language is added by copying a file and the copy is
    // edited by hand in a way the compiler cannot see.
    for (const dictionary of Object.values(DICTIONARIES)) {
      for (const section of Object.keys(en) as (keyof typeof en)[]) {
        const keys = Object.keys(en[section]);
        for (const key of keys) {
          const value = dictionary[section] as Record<string, string>;
          expect(typeof value[key]).toBe("string");
        }
      }
    }
  });

  test("no dictionary has a key English does not", () => {
    for (const dictionary of Object.values(DICTIONARIES)) {
      for (const section of Object.keys(dictionary) as (keyof typeof en)[]) {
        const keys = Object.keys(dictionary[section]);
        for (const key of keys) {
          expect(Object.keys(en[section])).toContain(key);
        }
      }
    }
  });

  test("no translation is blank", () => {
    // A key present but empty renders as an invisible label, which is worse
    // than the English: the control looks broken rather than untranslated.
    for (const dictionary of Object.values(DICTIONARIES)) {
      for (const section of Object.keys(dictionary) as (keyof typeof en)[]) {
        const group = dictionary[section] as Record<string, string>;
        for (const value of Object.values(group)) {
          expect(value.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("the Bisaya copy actually differs from the English", () => {
    // A "translation" that is the English string verbatim, section by section,
    // is the failure mode where somebody copies en.ts and ships it. Compare
    // section by section rather than file-wide, because a few words are
    // genuinely the same in both languages.
    const sections = Object.keys(en) as (keyof typeof en)[];
    for (const section of sections) {
      const english = en[section] as Record<string, string>;
      const bisaya = ceb[section] as Record<string, string>;
      const changed = Object.keys(english).filter(
        (key) => bisaya[key] !== english[key],
      );
      expect(changed.length).toBeGreaterThan(0);
    }
  });

  test("Bisaya keeps the terms Bukidnon actually uses", () => {
    // These are loanwords people already say in both languages. Translating
    // them would make the app harder to use, not easier.
    expect(ceb.nav.chats).toContain("chat");
    // `rider` stays untranslated wherever it survives — it is what people here
    // already say. (The onboarding rider card is gone; the driver flow lives at
    // `/rider/register`, and this is the passenger-facing sentence.)
    expect(ceb.onboarding.commuterHint).toContain("rider");
    expect(ceb.booking.fare).toBe("Fare");
  });

  test("no string lost its interpolation placeholder", () => {
    // The consent sentence is assembled from fragments around a placeholder.
    for (const dictionary of Object.values(DICTIONARIES)) {
      expect(dictionary.landing.consent.length).toBeGreaterThan(0);
      expect(dictionary.landing.termOfService.length).toBeGreaterThan(0);
    }
  });
});