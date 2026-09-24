import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Shared by the order page and the actions it hosts: an order is only ever read or
// acted on after its id and access token have both been checked here.

export const ORDER_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_TOKEN_LENGTH = 256;

/** Constant-time token check; hashing first gives equal-length buffers whatever the input. */
export function tokenMatches(provided: string, expected: string) {
  const a = createHash("sha256").update(provided, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export function isPlausibleOrderRef(id: string, token: string | undefined): token is string {
  return !!token && token.length <= MAX_TOKEN_LENGTH && ORDER_ID.test(id);
}
