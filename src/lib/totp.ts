import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (HMAC-SHA1, 30-second steps, 6 digits) using node:crypto only.
 * Secrets are exchanged as RFC 4648 base32 strings (what authenticator apps expect).
 */

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
const ISSUER = "Nitro Store";
const SECRET_BYTES = 20; // 160 bits, the RFC 4226 recommended key length for HMAC-SHA1

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 §6 base32. `padding: false` omits the trailing "=" (the otpauth:// convention). */
export function base32Encode(data: Uint8Array, { padding = true }: { padding?: boolean } = {}): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of data) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1; // keep only the unread bits so the int never overflows
  }
  if (bits > 0) out += B32_ALPHABET[(buffer << (5 - bits)) & 31];
  if (padding) while (out.length % 8 !== 0) out += "=";
  return out;
}

/**
 * RFC 4648 base32 decode. Case-insensitive; ignores spaces, hyphens and trailing "=" padding
 * (users type keys as "ABCD EFGH …"). Throws on any other character or a malformed length.
 */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();
  if ([1, 3, 6].includes(clean.length % 8)) throw new Error("Invalid base32 length");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = B32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error("Invalid base32 character");
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
    buffer &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}

/** New random shared secret, base32 without padding (32 chars for 20 bytes). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES), { padding: false });
}

/** otpauth:// URI for QR codes (Google Authenticator key-URI format). */
export function totpUri(secret: string, accountEmail: string): string {
  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(accountEmail)}`;
  const params = new URLSearchParams({
    secret: secret.replace(/[\s=-]/g, "").toUpperCase(),
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  // URLSearchParams encodes spaces as "+", which some authenticator apps show literally
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, "%20")}`;
}

/** RFC 4226 HOTP with dynamic truncation. */
export function hotp(key: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function totpStep(timeMs: number = Date.now()): number {
  return Math.floor(timeMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code for `timeMs`. `key` is the raw secret bytes or its base32 form. */
export function generateTotp(key: string | Uint8Array, timeMs: number = Date.now(), digits = TOTP_DIGITS): string {
  const raw = typeof key === "string" ? base32Decode(key) : key;
  return hotp(raw, totpStep(timeMs), digits);
}

/**
 * Checks `code` against the steps `now ± window` (window=1 tolerates ±30 s of clock drift).
 * Every candidate step is computed and compared with timingSafeEqual, with no early exit,
 * so timing does not reveal which step (if any) matched.
 * Returns the matched time step (callers use it to refuse replays), or null.
 */
export function verifyTotp(
  secret: string,
  code: string,
  window = 1,
  timeMs: number = Date.now(),
): { step: number } | null {
  const normalized = code.replace(/\s/g, "");
  if (!new RegExp(`^\\d{${TOTP_DIGITS}}$`).test(normalized)) return null;
  let key: Buffer;
  try {
    key = base32Decode(secret);
  } catch {
    return null;
  }
  if (key.length === 0) return null;

  const given = Buffer.from(normalized);
  const current = totpStep(timeMs);
  let matched = -1;
  for (let offset = -window; offset <= window; offset++) {
    const step = current + offset;
    const expected = Buffer.from(hotp(key, step));
    const equal = timingSafeEqual(expected, given);
    // No early exit: the loop does the same work whether or not (and where) a step matched
    matched = equal && matched === -1 ? step : matched;
  }
  return matched === -1 ? null : { step: matched };
}
