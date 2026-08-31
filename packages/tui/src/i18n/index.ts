import { useState, useEffect } from "react";
import {
  setLocale as setCoreLocale,
  getLocale as getCoreLocale,
} from "@lyratui/core";
import { I18N_KEYS, I18nKey } from "./keys";
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
    setCoreLocale(nextLocale);
    listeners.forEach((listener) => listener(currentLocale));
  }
}

export function getLocale(): Locale {
  return currentLocale;
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

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(currentLocale);

  useEffect(() => {
    const handleLocaleChange = (newLocale: Locale) => {
      setLocaleState(newLocale);
    };
    listeners.add(handleLocaleChange);
    return () => {
      listeners.delete(handleLocaleChange);
    };
  }, []);

  const changeLocale = (newLocale: Locale) => {
    setLocale(newLocale);
  };

  return {
    t,
    locale,
    setLocale: changeLocale,
    keys: I18N_KEYS,
  };
}

export { I18N_KEYS };
export type { I18nKey };
