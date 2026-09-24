import "server-only";
import { cookies } from "next/headers";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { sendSignInCodeEmail } from "@/lib/email";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/config";
import { dictionaryFor } from "@/i18n/server";

const COOKIE = "nitro_customer";
const SESSION_DAYS = 30;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 3;
const CODE_WINDOW_MINUTES = 10;

export type CustomerSession = { customerId: string; email: string };

export type OtpResult = { ok: true } | { ok: false; error: string };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string) {
  return createHmac("sha256", secret()).update(`${email}:${code}`).digest("hex");
}

/** Emails a 6-digit sign-in code (in `locale`). Limited to 3 codes per email per 10 minutes. */
export async function requestSignInCode(rawEmail: string, locale: Locale = DEFAULT_LOCALE): Promise<OtpResult> {
  const t = dictionaryFor(locale);
  const email = normalizeEmail(rawEmail);
  const since = new Date(Date.now() - CODE_WINDOW_MINUTES * 60_000);
  const recent = await prisma.customerOtp.count({ where: { email, createdAt: { gte: since } } });
  if (recent >= MAX_CODES_PER_WINDOW) {
    return { ok: false, error: t.login.errors.tooManyCodes };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await prisma.customerOtp.create({
    data: { email, codeHash: hashCode(email, code), expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000) },
  });
  const sent = await sendSignInCodeEmail(email, code, locale);
  return sent ? { ok: true } : { ok: false, error: t.login.errors.sendFailed };
}

/** Verifies the latest unexpired code; on success upserts the customer and starts a 30-day session. */
export async function verifySignInCode(rawEmail: string, code: string, locale: Locale = DEFAULT_LOCALE): Promise<OtpResult> {
  const email = normalizeEmail(rawEmail);
  const otp = await prisma.customerOtp.findFirst({
    where: { email, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const invalid = { ok: false as const, error: dictionaryFor(locale).login.errors.invalidCode };
  if (!otp || otp.attempts >= MAX_ATTEMPTS) return invalid;

  // Count the attempt before comparing so parallel guesses can't bypass the limit
  const bumped = await prisma.customerOtp.updateMany({
    where: { id: otp.id, attempts: { lt: MAX_ATTEMPTS }, consumedAt: null },
    data: { attempts: { increment: 1 } },
  });
  if (bumped.count === 0) return invalid;

  const expected = Buffer.from(otp.codeHash, "hex");
  const actual = Buffer.from(hashCode(email, code.trim()), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return invalid;

  const consumed = await prisma.customerOtp.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return invalid;

  const customer = await prisma.customer.upsert({
    where: { email },
    create: { email, emailVerifiedAt: new Date() },
    update: {},
  });
  if (!customer.emailVerifiedAt) {
    await prisma.customer.update({ where: { id: customer.id }, data: { emailVerifiedAt: new Date() } });
  }
  await startCustomerSession({ customerId: customer.id, email });
  return { ok: true };
}

async function startCustomerSession(session: CustomerSession) {
  const token = await new SignJWT({ email: session.email, kind: "customer" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.customerId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(new TextEncoder().encode(secret()));
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function getCustomerSession(): Promise<CustomerSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret()));
    if (payload.kind !== "customer" || !payload.sub || typeof payload.email !== "string") return null;
    return { customerId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function signOutCustomer() {
  (await cookies()).delete(COOKIE);
}
