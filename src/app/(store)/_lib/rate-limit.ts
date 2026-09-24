import "server-only";
import { headers } from "next/headers";

// Small in-memory throttle for storefront actions (per process, like the checkout limiter).
// Keys are namespaced by the caller, e.g. "otp-send:<ip>".

type Entry = { count: number; resetAt: number };
const g = globalThis as unknown as { __nitroStoreThrottle?: Map<string, Entry> };
const store = (g.__nitroStoreThrottle ??= new Map<string, Entry>());

function live(key: string, now: number) {
  const entry = store.get(key);
  if (entry && entry.resetAt <= now) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

function prune(now: number) {
  if (store.size < 5_000) return;
  for (const [key, entry] of store) if (entry.resetAt <= now) store.delete(key);
}

/** Seconds until `key` may be used again, or 0 when it is under `max`. Does not count a hit. */
export function throttled(key: string, max: number): number {
  const now = Date.now();
  const entry = live(key, now);
  return entry && entry.count >= max ? Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) : 0;
}

/** Counts one use of `key` in a window of `windowMs`. */
export function hit(key: string, windowMs: number) {
  const now = Date.now();
  prune(now);
  const entry = live(key, now);
  if (entry) entry.count += 1;
  else store.set(key, { count: 1, resetAt: now + windowMs });
}

/** Checks and counts in one step. Returns seconds to wait (0 = allowed). */
export function consume(key: string, max: number, windowMs: number): number {
  const wait = throttled(key, max);
  if (wait === 0) hit(key, windowMs);
  return wait;
}

export async function requestIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

