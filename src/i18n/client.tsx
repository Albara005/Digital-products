"use client";

import { createContext, useContext } from "react";
import { arClient, type ClientDictionary } from "./ar/client";
import { enClient } from "./en/client";
import { DEFAULT_LOCALE, type Locale, localizePath } from "./config";

// Client components get the locale from context (set once by the storefront shell) and only the
// client-side part of the dictionary is bundled.

const clientDictionaries: Record<Locale, ClientDictionary> = { ar: arClient, en: enClient };

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): ClientDictionary {
  return clientDictionaries[useContext(LocaleContext)];
}

/** Localizes an internal path for the current locale ("/cart" -> "/en/cart" in English). */
export function useLocalePath(): (path: string) => string {
  const locale = useContext(LocaleContext);
  return (path: string) => localizePath(path, locale);
}
