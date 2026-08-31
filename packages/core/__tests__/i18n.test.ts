import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  t,
  setLocale,
  getLocale,
  formatMyDayDate,
  onLocaleChange,
  getPriorityTerms,
  getAllPriorityTerms,
  getPriorityRegexPatterns,
  CORE_I18N_KEYS,
  I18N_KEYS,
} from "../src/i18n";
import * as i18n from "../src/i18n";
import enTranslations from "../src/i18n/locales/en.json";
import itTranslations from "../src/i18n/locales/it.json";

describe("Core i18n System", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("should have all CORE_I18N_KEYS mapped in English (base language)", () => {
    const keyValues = Object.values(CORE_I18N_KEYS);
    for (const key of keyValues) {
      expect(enTranslations[key as keyof typeof enTranslations]).toBeDefined();
      expect(typeof (enTranslations as any)[key]).toBe("string");
      expect((enTranslations as any)[key].length).toBeGreaterThan(0);
    }
  });

  it("should have all CORE_I18N_KEYS mapped in Italian (secondary language)", () => {
    const keyValues = Object.values(CORE_I18N_KEYS);
    for (const key of keyValues) {
      expect(itTranslations[key as keyof typeof itTranslations]).toBeDefined();
      expect(typeof (itTranslations as any)[key]).toBe("string");
      expect((itTranslations as any)[key].length).toBeGreaterThan(0);
    }
  });

  it("should export I18N_KEYS matching CORE_I18N_KEYS", () => {
    expect(I18N_KEYS).toEqual(CORE_I18N_KEYS);
  });

  it("should return English translation by default", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t(CORE_I18N_KEYS.NO_ADDITIONAL_TEXT)).toBe("No additional text");
    expect(t(CORE_I18N_KEYS.ERROR_GIT_MISSING)).toBe(
      "Git is not installed or available in PATH",
    );
  });

  it("should return Italian translation when switched to Italian", () => {
    setLocale("it");
    expect(getLocale()).toBe("it");
    expect(t(CORE_I18N_KEYS.NO_ADDITIONAL_TEXT)).toBe("Nessun testo aggiuntivo");
    expect(t(CORE_I18N_KEYS.ERROR_GIT_MISSING)).toBe(
      "Git non è installato o non è presente nel PATH",
    );
  });

  it("should format dates properly according to locale", () => {
    setLocale("en");
    const formattedEn = formatMyDayDate("2026-08-20");
    expect(formattedEn.toLowerCase()).toContain("august");

    setLocale("it");
    const formattedIt = formatMyDayDate("2026-08-20");
    expect(formattedIt.toLowerCase()).toContain("agosto");
  });

  it("should interpolate parameters correctly", () => {
    setLocale("en");
    expect(
      t(CORE_I18N_KEYS.ERROR_RAG_GENERATION, { error: "Network timeout" }),
    ).toBe("Error generating AI response: Network timeout");
    expect(
      t(CORE_I18N_KEYS.ERROR_OLLAMA_CONNECT, {
        url: "http://localhost:11434",
        model: "llama3.3",
      }),
    ).toBe(
      "Unable to connect to Ollama. Make sure Ollama is running on http://localhost:11434 and the model 'llama3.3' has been downloaded (run 'ollama pull llama3.3').",
    );

    setLocale("it");
    expect(
      t(CORE_I18N_KEYS.ERROR_RAG_GENERATION, { error: "Network timeout" }),
    ).toBe("Errore nella generazione della risposta dell'AI: Network timeout");
    expect(
      t(CORE_I18N_KEYS.ERROR_OLLAMA_CONNECT, {
        url: "http://localhost:11434",
        model: "llama3.3",
      }),
    ).toBe(
      "Impossibile connettersi ad Ollama. Assicurati che Ollama sia avviato su http://localhost:11434 e che il modello 'llama3.3' sia stato scaricato (esegui 'ollama pull llama3.3').",
    );
  });

  it("should fallback to English if translation is missing in Italian", () => {
    setLocale("it");
    const testKey = "temporary_test_key_for_fallback";
    (enTranslations as any)[testKey] = "English Fallback Text";

    expect(t(testKey)).toBe("English Fallback Text");

    delete (enTranslations as any)[testKey];
  });

  it("should return raw key if translation is not found in any locale", () => {
    setLocale("en");
    expect(t("unknown_nonexistent_key")).toBe("unknown_nonexistent_key");
  });

  it("should return empty string if key is null or undefined", () => {
    expect(t(null)).toBe("");
    expect(t(undefined)).toBe("");
  });

  it("should notify listeners when locale changes", () => {
    const listener = vi.fn();
    const unsubscribe = onLocaleChange(listener);

    setLocale("it");
    expect(listener).toHaveBeenCalledWith("it");

    setLocale("it"); // same locale, shouldn't fire again
    expect(listener).toHaveBeenCalledTimes(1);

    setLocale("en");
    expect(listener).toHaveBeenCalledWith("en");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setLocale("it");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should extract priority terms and regex patterns from i18n", () => {
    const highTerms = i18n.getPriorityTerms("high");
    expect(highTerms).toContain("high");
    expect(highTerms).toContain("alta");

    const mediumTerms = i18n.getPriorityTerms("medium");
    expect(mediumTerms).toContain("medium");
    expect(mediumTerms).toContain("media");

    const lowTerms = i18n.getPriorityTerms("low");
    expect(lowTerms).toContain("low");
    expect(lowTerms).toContain("bassa");

    const allTerms = i18n.getAllPriorityTerms();
    expect(allTerms).toEqual(
      expect.arrayContaining(["high", "alta", "medium", "media", "low", "bassa"]),
    );

    const { highRegex, lowRegex, mediumRegex, stripPriorityRegex, stripBracketPriorityRegex } =
      i18n.getPriorityRegexPatterns();

    expect(highRegex.test("#high")).toBe(true);
    expect(highRegex.test("#alta")).toBe(true);
    expect(highRegex.test("@priority(alta)")).toBe(true);
    expect(highRegex.test("[Alta]")).toBe(true);
    expect(highRegex.test("!alta")).toBe(true);

    expect(lowRegex.test("#low")).toBe(true);
    expect(lowRegex.test("#bassa")).toBe(true);
    expect(lowRegex.test("@priority(bassa)")).toBe(true);
    expect(lowRegex.test("[Bassa]")).toBe(true);

    expect(mediumRegex.test("#medium")).toBe(true);
    expect(mediumRegex.test("#media")).toBe(true);
    expect(mediumRegex.test("@priority(media)")).toBe(true);
    expect(mediumRegex.test("[Media]")).toBe(true);

    const stripped = "Task #alta @priority(bassa) [Media] !high"
      .replace(stripPriorityRegex, " ")
      .replace(stripBracketPriorityRegex, " ")
      .replace(/\s+/g, " ")
      .trim();
    expect(stripped).toBe("Task");
  });
});
