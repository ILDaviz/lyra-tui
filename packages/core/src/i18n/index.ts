import { CORE_I18N_KEYS, I18N_KEYS, CoreI18nKey, I18nKey } from "./keys";
import enTranslations from "./locales/en.json";
import itTranslations from "./locales/it.json";

export type Locale = "en" | "it";

const translations: Record<Locale, Record<string, string>> = {
  en: enTranslations as Record<string, string>,
  it: itTranslations as Record<string, string>,
};

let currentLocale: Locale = "en";
const listeners = new Set<(locale: Locale) => void>();

export function setLocale(locale: string): void {
  const nextLocale: Locale = locale.startsWith("it") ? "it" : "en";
  if (currentLocale !== nextLocale) {
    currentLocale = nextLocale;
    listeners.forEach((listener) => listener(currentLocale));
  }
}

export function getLocale(): Locale {
  return currentLocale;
}

export function onLocaleChange(listener: (locale: Locale) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function t(
  key?: string | null,
  params?: Record<string, string | number | undefined | null>,
): string {
  if (!key) return "";
  const locale: Locale = currentLocale || "en";
  let text = translations[locale]?.[key];

  if (!text && locale !== "en") {
    text = translations.en?.[key];
  }

  if (!text) {
    return String(key);
  }

  if (params) {
    for (const [pKey, pVal] of Object.entries(params)) {
      if (pVal !== undefined && pVal !== null) {
        text = text.replace(new RegExp(`\\{${pKey}\\}`, "g"), String(pVal));
      }
    }
  }

  return text;
}

export function formatMyDayDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString(
      currentLocale === "it" ? "it-IT" : "en-US",
      {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );
  } catch {
    return dateStr;
  }
}

export function getPriorityTerms(
  priority: "high" | "medium" | "low",
): string[] {
  const keyMap = {
    high: CORE_I18N_KEYS.PRIORITY_HIGH,
    medium: CORE_I18N_KEYS.PRIORITY_MEDIUM,
    low: CORE_I18N_KEYS.PRIORITY_LOW,
  };
  const key = keyMap[priority];
  const terms = new Set<string>();
  if (priority === "high") terms.add("high");
  if (priority === "medium") terms.add("medium");
  if (priority === "low") terms.add("low");

  for (const locale of Object.keys(translations) as Locale[]) {
    const term = translations[locale]?.[key];
    if (term) {
      terms.add(term.toLowerCase());
    }
  }
  return Array.from(terms);
}

export function getAllPriorityTerms(): string[] {
  return Array.from(
    new Set([
      ...getPriorityTerms("high"),
      ...getPriorityTerms("medium"),
      ...getPriorityTerms("low"),
    ]),
  );
}

export function getPriorityRegexPatterns() {
  const highTerms = getPriorityTerms("high").join("|");
  const mediumTerms = getPriorityTerms("medium").join("|");
  const lowTerms = getPriorityTerms("low").join("|");
  const allTerms = getAllPriorityTerms().join("|");

  return {
    highRegex: new RegExp(
      `(?:^|\\s)#(?:${highTerms}|p1)\\b|@priority\\((?:${highTerms})\\)|\\[(?:${highTerms})\\]|\\((?:${highTerms})\\)|(?:^|\\s)!(?:${highTerms})\\b`,
      "i",
    ),
    lowRegex: new RegExp(
      `(?:^|\\s)#(?:${lowTerms}|p3)\\b|@priority\\((?:${lowTerms})\\)|\\[(?:${lowTerms})\\]|\\((?:${lowTerms})\\)|(?:^|\\s)!(?:${lowTerms})\\b`,
      "i",
    ),
    mediumRegex: new RegExp(
      `(?:^|\\s)#(?:${mediumTerms}|p2)\\b|@priority\\((?:${mediumTerms})\\)|\\[(?:${mediumTerms})\\]|\\((?:${mediumTerms})\\)|(?:^|\\s)!(?:${mediumTerms})\\b`,
      "i",
    ),
    stripPriorityRegex: new RegExp(
      `(?:^|\\s)#(?:${allTerms}|p1|p2|p3)\\b|@priority\\((?:${allTerms})\\)|(?:^|\\s)!(?:${allTerms})\\b`,
      "gi",
    ),
    stripBracketPriorityRegex: new RegExp(
      `(?:\\[|\\()(?:${allTerms})(?:\\]|\\))`,
      "gi",
    ),
  };
}

export { CORE_I18N_KEYS, I18N_KEYS };
export type { CoreI18nKey, I18nKey };
