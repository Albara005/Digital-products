import "server-only";
import { headers } from "next/headers";

// In-memory login throttle. Per-process: good enough for a single Node instance;
// use a shared store (Redis) if the app is ever scaled horizontally.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL_IP = 5;
const MAX_PER_IP = 25; // credential-stuffing guard across many emails (shared by password and 2FA failures)
const MAX_2FA_PER_ADMIN_IP = 5;
const MAX_2FA_PER_ADMIN = 10; // across IPs: one password holder rotating addresses still gets 10 guesses / 15 min

type Entry = { count: number; resetAt: number };
const g = globalThis as unknown as { __nitroLoginAttempts?: Map<string, Entry> };
const store = (g.__nitroLoginAttempts ??= new Map<string, Entry>());

function prune(now: number) {
  if (store.size < 5000) return;
  for (const [key, entry] of store) if (entry.resetAt <= now) store.delete(key);
}

function keys(email: string, ip: string) {
  return { pair: `pair:${email}|${ip}`, ip: `ip:${ip}` };
}

function live(key: string, now: number): Entry | undefined {
  const entry = store.get(key);
  if (entry && entry.resetAt <= now) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

type Gate = { allowed: true } | { allowed: false; retryAfterMinutes: number };

function check(limits: [key: string, max: number][]): Gate {
  const now = Date.now();
  for (const [key, max] of limits) {
    const entry = live(key, now);
    if (entry && entry.count >= max) {
      return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil((entry.resetAt - now) / 60000)) };
    }
  }
  return { allowed: true };
}

function register(keysToBump: string[]) {
  const now = Date.now();
  prune(now);
  for (const key of keysToBump) {
    const entry = live(key, now);
    if (entry) entry.count += 1;
    else store.set(key, { count: 1, resetAt: now + WINDOW_MS });
  }
}

export function checkLoginAllowed(email: string, ip: string): Gate {
  const k = keys(email, ip);
  return check([
    [k.pair, MAX_PER_EMAIL_IP],
    [k.ip, MAX_PER_IP],
  ]);
}

export function registerLoginFailure(email: string, ip: string) {
  register(Object.values(keys(email, ip)));
}

export function clearLoginFailures(email: string, ip: string) {
  store.delete(keys(email, ip).pair);
}

// TOTP codes (login step 2, enabling/disabling 2FA): 10^6 codes, so cap guesses per admin too.
function twoFactorKeys(adminId: string, ip: string) {
  return { pair: `2fa:${adminId}|${ip}`, admin: `2fa-admin:${adminId}`, ip: `ip:${ip}` };
}

export function checkTwoFactorAllowed(adminId: string, ip: string): Gate {
  const k = twoFactorKeys(adminId, ip);
  return check([
    [k.pair, MAX_2FA_PER_ADMIN_IP],
    [k.admin, MAX_2FA_PER_ADMIN],
    [k.ip, MAX_PER_IP],
  ]);
}

export function registerTwoFactorFailure(adminId: string, ip: string) {
  register(Object.values(twoFactorKeys(adminId, ip)));
}

export function clearTwoFactorFailures(adminId: string, ip: string) {
  const k = twoFactorKeys(adminId, ip);
  store.delete(k.pair);
  store.delete(k.admin);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
