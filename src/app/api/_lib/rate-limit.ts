import "server-only";

// Basic in-memory rate limit (per instance; good enough for a single Railway service).
// Each named limiter has its own buckets, kept on globalThis so dev hot reloads don't reset them.

type Bucket = { count: number; resetAt: number };
const store = globalThis as unknown as { __nitroApiRateLimits?: Map<string, Map<string, Bucket>> };
const limiters = (store.__nitroApiRateLimits ??= new Map());

export function clientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/** Counts a request for `key`; returns seconds to wait when over `limit` per `windowMs`, otherwise 0. */
export function rateLimit(name: string, key: string, limit: number, windowMs: number): number {
  let buckets = limiters.get(name);
  if (!buckets) {
    buckets = new Map<string, Bucket>();
    limiters.set(name, buckets);
  }
  const now = Date.now();
  if (buckets.size > 5_000) {
    for (const [k, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  bucket.count += 1;
  return bucket.count > limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

export function jsonError(error: string, status: number, headers?: HeadersInit) {
  return Response.json({ error }, { status, headers });
}
