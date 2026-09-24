import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { ar, type Dictionary } from "./ar";
import { en } from "./en";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, type Locale, isLocale, localizePath } from "./config";

export type { Dictionary } from "./ar";

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function dictionaryFor(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/**
 * Locale of the current storefront request, from the header src/proxy.ts sets from the URL
 * ("/en/..." = English). Pages, layouts and server actions all run behind the proxy. Outside a
 * request (scripts) or on routes the proxy skips (admin), this is the default (Arabic).
 */
export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const value = (await headers()).get(LOCALE_HEADER);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
});

/** The dictionary for the current request. */
export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}

/** Localized internal path for the current request ("/cart" -> "/en/cart" in English). */
export async function localPath(path: string): Promise<string> {
  return localizePath(path, await getLocale());
}

/**
 * Locale for API route handlers and background work started by a browser request (the proxy
 * does not run on /api): an explicit `x-nitro-locale` header from our own fetch calls, then the
 * visitor's last-used locale cookie, else Arabic. Never throws.
 */
export async function getRequestLocale(req?: Request): Promise<Locale> {
  try {
    const explicit = req ? req.headers.get(LOCALE_HEADER) : (await headers()).get(LOCALE_HEADER);
    if (isLocale(explicit)) return explicit;
    const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    return isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Locale for an email triggered by the current request: only an explicit storefront locale (the
 * proxy's header on pages and server actions, or the header our own checkout fetch sends). The
 * cookie is not used, so an admin action or a payment webhook never borrows the wrong visitor's
 * language; those default to Arabic.
 */
export async function getEmailLocale(): Promise<Locale> {
  try {
    const value = (await headers()).get(LOCALE_HEADER);
    return isLocale(value) ? value : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}
