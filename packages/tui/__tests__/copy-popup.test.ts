import { describe, it, expect, beforeEach } from "vitest";
import { t, setLocale, getLocale, I18N_KEYS } from "../src/i18n";
import enTranslations from "../src/i18n/locales/en.json";
import itTranslations from "../src/i18n/locales/it.json";

describe("Copy Popup & Auto-Copy on Selection", () => {
  beforeEach(() => {
    setLocale("it");
  });

  it("should have POPUP_COPIED defined in both en and it locales", () => {
    const key = I18N_KEYS.POPUP_COPIED;
    expect(key).toBeDefined();
    expect(enTranslations[key as keyof typeof enTranslations]).toBe(
      "Copied to clipboard",
    );
    expect(itTranslations[key as keyof typeof itTranslations]).toBe(
      "Copiato negli appunti",
    );
  });

  it("should return Italian translation for POPUP_COPIED by default when locale is it", () => {
    setLocale("it");
    expect(getLocale()).toBe("it");
    expect(t(I18N_KEYS.POPUP_COPIED)).toBe("Copiato negli appunti");
  });

  it("should return English translation for POPUP_COPIED when switched to en", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t(I18N_KEYS.POPUP_COPIED)).toBe("Copied to clipboard");
  });

  it("should translate EDITOR_COPIED_CLIPBOARD correctly across locales", () => {
    setLocale("it");
    expect(t(I18N_KEYS.EDITOR_COPIED_CLIPBOARD)).toBe("Copiato negli appunti");
    setLocale("en");
    expect(t(I18N_KEYS.EDITOR_COPIED_CLIPBOARD)).toBe("Copied to clipboard");
  });
});
