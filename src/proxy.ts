import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, type Locale, isLocale, splitLocale } from "@/i18n/config";

/*
 * Storefront proxy: locale routing and referral capture.
 *
 * Locale (see src/i18n/config.ts): Arabic is served at the unprefixed URLs, English under "/en".
 * "/en/..." is rewritten onto the same route files and every storefront request gets the
 * LOCALE_HEADER request header (overwriting anything the client sent), which the root layout,
 * pages and server actions read. "/ar/..." redirects to the unprefixed URL. The last used locale
 * is remembered in LOCALE_COOKIE for the API routes and emails, which have no locale in their URL.
 * A first visit (no cookie) to an unprefixed page whose browser prefers English is sent to "/en"
 * once; crawlers are never redirected, and "/en" URLs never redirect, so this cannot loop.
 *
 * Referral capture: any storefront page opened with `?ref=CODE` stores the code in the httpOnly
 * `nitro_ref` cookie for 30 days; checkout reads it (src/app/api/checkout/route.ts). The format
 * check mirrors REFERRAL_CODE_RE in src/lib/referrals.ts (server-only, not importable here);
 * whether the code belongs to anyone is decided at checkout.
 */

const REF_COOKIE = "nitro_ref";
const REF_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const REF_CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;
const LOCALE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless|curl|wget|python|axios|node-fetch/i;

/** English only when the browser ranks some "en" above any "ar" (q-values respected). */
function prefersEnglish(acceptLanguage: string | null): boolean {
  if (!acceptLanguage) return false;
  let en = -1;
  let ar = -1;
  for (const part of acceptLanguage.split(",")) {
    const [tag, ...params] = part.trim().toLowerCase().split(";");
    const qParam = params.find((p) => p.trim().startsWith("q="));
    const q = qParam ? Number(qParam.trim().slice(2)) : 1;
    if (!Number.isFinite(q)) continue;
    if (tag === "en" || tag.startsWith("en-")) en = Math.max(en, q);
    if (tag === "ar" || tag.startsWith("ar-")) ar = Math.max(ar, q);
  }
  return en > 0 && en > ar;
}

/** A top-level page load by a person (not a prefetch, RSC fetch, server action or crawler). */
function isFirstPageLoad(request: NextRequest): boolean {
  if (request.method !== "GET" || request.cookies.has(LOCALE_COOKIE)) return false;
  if (request.headers.get("rsc") || request.headers.get("next-router-prefetch") || request.headers.get("next-action")) return false;
  const mode = request.headers.get("sec-fetch-mode");
  if (mode && mode !== "navigate") return false;
  if (!(request.headers.get("accept") ?? "").includes("text/html")) return false;
  return !BOT.test(request.headers.get("user-agent") ?? "");
}

function withLocalePrefix(locale: Locale, path: string) {
  return locale === DEFAULT_LOCALE ? path : path === "/" ? `/${locale}` : `/${locale}${path}`;
}

export function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const { locale: prefix, path } = splitLocale(url.pathname);

  // "/ar/..." is the unprefixed URL; "/en/admin" or "/en/api" are not storefront pages.
  if (prefix === DEFAULT_LOCALE || (prefix && /^\/(admin|api)(\/|$)/.test(path))) {
    const target = url.clone();
    target.pathname = path;
    return NextResponse.redirect(target, 308);
  }
  const locale: Locale = prefix ?? DEFAULT_LOCALE;

  if (!prefix && isFirstPageLoad(request) && prefersEnglish(request.headers.get("accept-language"))) {
    const target = url.clone();
    target.pathname = withLocalePrefix("en", path);
    const redirect = NextResponse.redirect(target, 307);
    redirect.headers.set("Cache-Control", "private, no-store");
    redirect.headers.set("Vary", "Accept-Language, Cookie");
    redirect.cookies.set(LOCALE_COOKIE, "en", { path: "/", sameSite: "lax", maxAge: LOCALE_MAX_AGE_SECONDS });
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  let response: NextResponse;
  if (prefix) {
    const target = url.clone();
    target.pathname = path;
    response = NextResponse.rewrite(target, { request: { headers: requestHeaders } });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  const remembered = request.cookies.get(LOCALE_COOKIE)?.value;
  if (!isLocale(remembered) || remembered !== locale) {
    response.cookies.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: LOCALE_MAX_AGE_SECONDS });
  }

  const code = url.searchParams.get("ref")?.trim().toUpperCase();
  if (code && REF_CODE.test(code) && request.cookies.get(REF_COOKIE)?.value !== code) {
    response.cookies.set(REF_COOKIE, code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: REF_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const config = {
  // Storefront pages only: not the API, the admin panel, Next internals or files
  matcher: ["/((?!api|admin|_next|.*\\..*).*)"],
};
