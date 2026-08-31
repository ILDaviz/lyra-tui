import { describe, it, expect, beforeEach } from "vitest";
import { t, setLocale, getLocale, I18N_KEYS } from "../src/i18n";
import enTranslations from "../src/i18n/locales/en.json";
import itTranslations from "../src/i18n/locales/it.json";

describe("TUI i18n System (UUID Keys)", () => {
  beforeEach(() => {
    setLocale("en");
  });

  it("should have all I18N_KEYS mapped in English (base language)", () => {
    const keyValues = Object.values(I18N_KEYS);
    for (const uuid of keyValues) {
      expect(enTranslations[uuid as keyof typeof enTranslations]).toBeDefined();
      expect(typeof (enTranslations as any)[uuid]).toBe("string");
      expect((enTranslations as any)[uuid].length).toBeGreaterThan(0);
    }
  });

  it("should have all I18N_KEYS mapped in Italian (secondary language)", () => {
    const keyValues = Object.values(I18N_KEYS);
    for (const uuid of keyValues) {
      expect(itTranslations[uuid as keyof typeof itTranslations]).toBeDefined();
      expect(typeof (itTranslations as any)[uuid]).toBe("string");
      expect((itTranslations as any)[uuid].length).toBeGreaterThan(0);
    }
  });

  it("should return English translation by default", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t(I18N_KEYS.HEADER_BREADCRUMB_NOTES)).toBe("Notes");
    expect(t(I18N_KEYS.SIDEBAR_TITLE)).toBe("NAVIGATOR");
  });

  it("should return Italian translation when switched to Italian", () => {
    setLocale("it");
    expect(getLocale()).toBe("it");
    expect(t(I18N_KEYS.HEADER_BREADCRUMB_NOTES)).toBe("Note");
    expect(t(I18N_KEYS.SIDEBAR_TITLE)).toBe("NAVIGATORE");
  });

  it("should interpolate parameters correctly", () => {
    setLocale("en");
    expect(t(I18N_KEYS.NOTES_LIST_TOTAL_COUNT, { count: 5 })).toBe("Notes: 5");
    expect(t(I18N_KEYS.STATUS_NOTE_CREATED, { title: "Meeting" })).toBe(
      "Note created: Meeting",
    );

    setLocale("it");
    expect(t(I18N_KEYS.NOTES_LIST_TOTAL_COUNT, { count: 5 })).toBe("Note: 5");
    expect(t(I18N_KEYS.STATUS_NOTE_CREATED, { title: "Meeting" })).toBe(
      "Nota creata: Meeting",
    );
  });

  it("should fallback to English if translation is missing in Italian", () => {
    setLocale("it");
    const testUUID = "00000000-0000-0000-0000-000000000001";
    (enTranslations as any)[testUUID] = "English Fallback Text";

    expect(t(testUUID)).toBe("English Fallback Text");

    delete (enTranslations as any)[testUUID];
  });
});
