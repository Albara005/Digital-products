import "server-only";
import { headers } from "next/headers";

// In-memory login throttle. Per-process: good enough for a single Node instance;
// use a shared store (Redis) if the app is ever scaled horizontally.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL_IP = 5;
const MAX_PER_IP = 25; // credential-stuffing guard across many emails

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

export function checkLoginAllowed(email: string, ip: string): { allowed: true } | { allowed: false; retryAfterMinutes: number } {
  const now = Date.now();
  const k = keys(email, ip);
  const blocking = [
    [live(k.pair, now), MAX_PER_EMAIL_IP],
    [live(k.ip, now), MAX_PER_IP],
  ] as const;
  for (const [entry, max] of blocking) {
    if (entry && entry.count >= max) {
      return { allowed: false, retryAfterMinutes: Math.max(1, Math.ceil((entry.resetAt - now) / 60000)) };
    }
  }
  return { allowed: true };
}

export function registerLoginFailure(email: string, ip: string) {
  const now = Date.now();
  prune(now);
  for (const key of Object.values(keys(email, ip))) {
    const entry = live(key, now);
    if (entry) entry.count += 1;
    else store.set(key, { count: 1, resetAt: now + WINDOW_MS });
  }
}

export function clearLoginFailures(email: string, ip: string) {
  store.delete(keys(email, ip).pair);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
