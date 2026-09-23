// Storefront constants and small pure helpers (safe for server and client).

export const SITE_NAME = "Nitro Store";

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
