import { NextResponse, type NextRequest } from "next/server";

/*
 * Referral capture: any storefront page opened with `?ref=CODE` stores the code in the httpOnly
 * `nitro_ref` cookie for 30 days; checkout reads it (src/app/api/checkout/route.ts).
 *
 * A proxy rather than page code because the link can land on any page (home, product, category),
 * including ones that must not set cookies while rendering. The matcher's `has` condition means
 * the proxy only runs for requests that actually carry `?ref=`, so normal traffic never pays for it.
 * The format check mirrors REFERRAL_CODE_RE in src/lib/referrals.ts (server-only, not importable here);
 * whether the code belongs to anyone is decided at checkout.
 */

const COOKIE = "nitro_ref";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CODE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

export function proxy(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("ref")?.trim().toUpperCase();
  const response = NextResponse.next();
  if (code && CODE.test(code) && request.cookies.get(COOKIE)?.value !== code) {
    response.cookies.set(COOKIE, code, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Storefront pages only: not the API, the admin panel, Next internals or files
      source: "/((?!api|admin|_next|.*\\..*).*)",
      has: [{ type: "query", key: "ref" }],
    },
  ],
};
