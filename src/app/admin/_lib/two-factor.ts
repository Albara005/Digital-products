import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { base32Encode, verifyTotp } from "@/lib/totp";

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

// ---------------------------------------------------------------------------------------------
// Recovery codes: 10 single-use backup codes shown once when 2FA is enabled (or regenerated).
// Format XXXX-XXXX in RFC 4648 base32 (A-Z, 2-7): 40 random bits each. Only an HMAC-SHA256 keyed
// with AUTH_SECRET is stored, so a database leak alone doesn't reveal usable codes. Rotating
// AUTH_SECRET invalidates every stored code (admins then sign in with TOTP and regenerate).
// ---------------------------------------------------------------------------------------------

export const RECOVERY_CODE_COUNT = 10;

function recoveryKey(): string {
  const key = process.env.AUTH_SECRET;
  if (!key) throw new Error("AUTH_SECRET is not set");
  return key;
}

/**
 * A recovery code as typed -> canonical 8 characters, or "" when it can't be one.
 * Case-insensitive; ignores spaces and hyphens; reads 0/1/8 as O/I/B (not in the base32 alphabet).
 */
export function normalizeRecoveryCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[\s\-\u2010-\u2015]/g, "")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/8/g, "B");
  return /^[A-Z2-7]{8}$/.test(clean) ? clean : "";
}

export function hashRecoveryCode(normalized: string): string {
  return createHmac("sha256", recoveryKey()).update(`admin-recovery:${normalized}`).digest("hex");
}

function newRecoveryCode(): string {
  const raw = base32Encode(randomBytes(5), { padding: false }); // 40 bits -> exactly 8 characters
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/**
 * Replaces all of the admin's recovery codes with a fresh set and returns the plain codes
 * (the only time they exist in clear). Pass `tx` to make it part of a larger transaction.
 */
export async function replaceRecoveryCodes(adminId: string, tx?: Prisma.TransactionClient): Promise<string[]> {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_CODE_COUNT) codes.add(newRecoveryCode());
  const list = [...codes];
  const data = list.map((code) => ({ adminId, codeHash: hashRecoveryCode(normalizeRecoveryCode(code)) }));
  const run = async (db: Prisma.TransactionClient) => {
    await db.adminRecoveryCode.deleteMany({ where: { adminId } });
    await db.adminRecoveryCode.createMany({ data });
  };
  if (tx) await run(tx);
  else await prisma.$transaction(run);
  return list;
}

export function deleteRecoveryCodes(adminId: string, tx?: Prisma.TransactionClient) {
  return (tx ?? prisma).adminRecoveryCode.deleteMany({ where: { adminId } });
}

export function countUnusedRecoveryCodes(adminId: string): Promise<number> {
  return prisma.adminRecoveryCode.count({ where: { adminId, usedAt: null } });
}

/**
 * Marks the matching unused code as used and returns true, atomically: the update is conditional
 * on usedAt still being null, so two concurrent sign-ins with the same code can't both succeed.
 */
export async function consumeRecoveryCode(adminId: string, raw: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(raw);
  if (!normalized) return false;
  const res = await prisma.adminRecoveryCode.updateMany({
    where: { adminId, codeHash: hashRecoveryCode(normalized), usedAt: null },
    data: { usedAt: new Date() },
  });
  return res.count > 0;
}
