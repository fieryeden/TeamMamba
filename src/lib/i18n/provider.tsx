"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_LABELS,
  LOCALE_DIRECTION,
  TRANSLATIONS,
  type Locale,
} from "@/lib/i18n/locales";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
  dir: "ltr" | "rtl";
  labels: Record<Locale, string>;
}

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key) => key,
  dir: "ltr",
  labels: LOCALE_LABELS,
});

const STORAGE_KEY = "teammamba-locale";

function getStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }
  } catch {}
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
    } catch {}
    // Update html dir attribute for RTL
    document.documentElement.dir = LOCALE_DIRECTION[newLocale];
    document.documentElement.lang = newLocale;
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>): string => {
      const translations = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];
      let value = translations[key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          value = value.replace(`{${k}}`, v);
        });
      }
      return value;
    },
    [locale]
  );

  const dir = LOCALE_DIRECTION[locale];

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir, labels: LOCALE_LABELS }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale };
