import "server-only";
import { createHash } from "node:crypto";
import { decrypt } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";

// Last accepted TOTP time step per admin, so a code can't be used twice (RFC 6238 §5.2),
// including within its own ±30 s window. In memory, per process: a restart forgets it
// (a code seen in the last ~60 s could then be replayed once) and several instances don't share it.
// Move it to a shared store (Redis / a DB column) if the app is ever scaled horizontally.
// The entry is tied to a fingerprint of the secret, so a newly set-up secret starts fresh.
type LastUse = { step: number; secret: string };
const g = globalThis as unknown as { __nitroTotpLastStep?: Map<string, LastUse> };
const lastStep = (g.__nitroTotpLastStep ??= new Map<string, LastUse>());

const fingerprint = (secret: string) => createHash("sha256").update(secret).digest("base64url");

export type TotpCheck = "ok" | "invalid" | "replay";

/** Verifies `code` and, when valid and unused, marks its time step as consumed for this admin. */
export function consumeTotp(adminId: string, secret: string, code: string): TotpCheck {
  const match = verifyTotp(secret, code);
  if (!match) return "invalid";
  const fp = fingerprint(secret);
  // No await between the check and the write, so concurrent requests can't both pass
  const last = lastStep.get(adminId);
  if (last && last.secret === fp && match.step <= last.step) return "replay";
  lastStep.set(adminId, { step: match.step, secret: fp });
  return "ok";
}

/** Decrypts Admin.totpSecret; null when missing or unreadable (wrong INVENTORY_ENCRYPTION_KEY). */
export function readTotpSecret(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return decrypt(encrypted);
  } catch {
    return null;
  }
}

/**
 * A 6-digit code as typed; "" when it is not one. Accepts "123 456" / "123-456" and
 * Arabic-Indic (٠-٩) or Persian (۰-۹) digits, which Arabic phone keyboards produce.
 */
export function normalizeCode(raw: string): string {
  const digits = raw
    .replace(/[\s-]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  return /^[0-9]{6}$/.test(digits) ? digits : "";
}
