// Locale primitives shared by the proxy, server code and client components (no server-only imports).
//
// Routing: Arabic (the default) lives at the unprefixed URLs ("/cart"), English under "/en"
// ("/en/cart"). src/proxy.ts rewrites "/en/..." onto the same route files and passes the locale
// to the app in the LOCALE_HEADER request header; it also remembers the last used locale in
// LOCALE_COOKIE for requests that carry no URL (API routes, emails sent from them).

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";

/** Request header set by src/proxy.ts on every storefront request (never trusted from elsewhere for anything sensitive). */
export const LOCALE_HEADER = "x-nitro-locale";
/** Last locale the visitor browsed in (1 year). */
export const LOCALE_COOKIE = "nitro_lang";

export function isLocale(value: unknown): value is Locale {
  return value === "ar" || value === "en";
}

export function localeDir(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

/** BCP 47 tag for Intl formatting. Arabic keeps Latin digits, as the store always has. */
export function intlLocale(locale: Locale): string {
  return locale === "ar" ? "ar-u-nu-latn" : "en-US";
}

/** "/en/cart" -> { locale: "en", path: "/cart" }; "/cart" -> { locale: null, path: "/cart" }. */
export function splitLocale(pathname: string): { locale: Locale | null; path: string } {
  const match = /^\/(ar|en)(?=\/|$)/.exec(pathname);
  if (!match) return { locale: null, path: pathname || "/" };
  return { locale: match[1] as Locale, path: pathname.slice(match[0].length) || "/" };
}

/**
 * Internal path for `locale`: "/cart" -> "/en/cart" in English, unchanged in Arabic. Any locale
 * prefix already on the path is replaced. Only site-relative paths ("/...") are touched;
 * "#hash", "?query", absolute and protocol-relative URLs pass through unchanged.
 */
export function localizePath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const cut = href.search(/[?#]/);
  const pathname = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? "" : href.slice(cut);
  const { path } = splitLocale(pathname);
  if (locale === DEFAULT_LOCALE) return `${path}${rest}`;
  return `${path === "/" ? `/${locale}` : `/${locale}${path}`}${rest}`;
}

/** Picks the English text when the locale is English and it is filled in, else the Arabic one. */
export function localized<T extends string | null>(locale: Locale, ar: T, en: string | null | undefined): T | string {
  if (locale === "en" && en && en.trim()) return en;
  return ar;
}
