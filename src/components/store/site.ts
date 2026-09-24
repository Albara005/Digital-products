// Storefront constants and small pure helpers (safe for server and client).

export const SITE_NAME = "Nitro Store";

/** The wallet holds a single currency (top-ups and wallet payments are in USD). */
export const WALLET_CURRENCY = "USD";

export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@nitro.store";

// Placeholder until the owner sets NEXT_PUBLIC_WHATSAPP_NUMBER (international format, digits only).
const WHATSAPP_NUMBER = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "966500000000").replace(/\D/g, "");
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export function productHref(slug: string) {
  return `/product/${encodeURIComponent(slug)}`;
}

export function categoryHref(slug: string) {
  return `/category/${encodeURIComponent(slug)}`;
}

/** Route params can arrive percent-encoded for non-ASCII slugs; slugs never contain "%". */
export function decodeSlug(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function arabicCount(n: number, one: string, two: string, few: string, many: string) {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** "48" → "يومان", "72" → "3 أيام", "12" → "12 ساعة". */
export function formatWarranty(hours: number) {
  if (hours >= 24 && hours % 24 === 0) {
    return arabicCount(hours / 24, "يوم واحد", "يومان", "أيام", "يوماً");
  }
  return arabicCount(hours, "ساعة واحدة", "ساعتان", "ساعات", "ساعة");
}

/** Short Latin initials for placeholder tiles ("Steam Wallet" → "SW"). */
export function initials(name: string) {
  const all = name.trim().split(/\s+/).filter(Boolean);
  // Prefer the Latin brand words ("بطاقة PlayStation Store" → "PS") so scripts don't mix
  const latin = all.filter((w) => /^[A-Za-z0-9]/.test(w));
  const words = latin.length ? latin : all;
  const letters = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  return letters.join("").toUpperCase() || "N";
}

export function truncate(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function hasControlChars(value: string) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * Where to send the customer after signing in. Only same-site relative paths are allowed
 * ("/cart", "/order/x?token=…"); anything else — absolute or protocol-relative URLs, backslash
 * tricks, control characters, the login page itself — falls back to `fallback`.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/account"): string {
  if (!raw || raw.length > 512) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || hasControlChars(raw)) return fallback;
  try {
    const base = "http://nitro.invalid";
    const url = new URL(raw, base);
    if (url.origin !== base) return fallback;
    if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export const MAX_REVIEW_COMMENT = 1000;

/** Support ticket limits (shared by the forms, the server actions and src/lib/tickets.ts). */
export const MAX_TICKET_SUBJECT = 120;
export const MAX_TICKET_BODY = 5000;
export const MAX_REVIEW_NAME = 40;

/** Public reviewer name derived from an email: "ahmed@x.com" → "ahm***". */
export function maskedDisplayName(email: string): string {
  const local = Array.from(email.split("@")[0]?.trim() ?? "");
  if (local.length === 0) return "عميل";
  const keep = local.length <= 3 ? 1 : 3;
  return `${local.slice(0, keep).join("")}***`;
}

/** Arabic-Indic and Persian digits → Latin, then drops everything that isn't a digit. */
export function latinDigits(value: string): string {
  return value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}
