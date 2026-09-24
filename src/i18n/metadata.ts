import "server-only";
import type { Metadata } from "next";
import { localizePath } from "./config";
import { getLocale } from "./server";

/**
 * Canonical URL in the current language plus hreflang alternates for indexable pages
 * (Arabic at the unprefixed path, English under /en; x-default = Arabic).
 */
export async function alternates(path: string): Promise<NonNullable<Metadata["alternates"]>> {
  const locale = await getLocale();
  return {
    canonical: localizePath(path, locale),
    languages: { ar: localizePath(path, "ar"), en: localizePath(path, "en"), "x-default": localizePath(path, "ar") },
  };
}
