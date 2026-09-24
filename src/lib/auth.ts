import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE = "nitro_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12;

// Short-lived proof that the password step passed for an admin who still owes a TOTP code.
// It is never accepted as a session (different `kind`), and only sent to the login pages.
const PENDING_COOKIE = "nitro_admin_2fa";
const PENDING_PATH = "/admin/login";
const PENDING_MAX_AGE_SECONDS = 5 * 60;

export type AdminSession = {
  adminId: string;
  email: string;
  name: string;
  role: AdminRole;
  /** When the token was issued, in ms. Sessions older than Admin.passwordChangedAt are revoked. */
  issuedAtMs: number;
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

const cookieBase = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
};

export async function verifyCredentials(email: string, password: string) {
  const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase().trim() } });
  // Compare even when the admin is missing so response time doesn't reveal which emails exist
  const hash = admin?.passwordHash ?? "$2b$12$HqmWkL0B9ZmyTcplIIt4Ye9VxyRCbQCP5LcXZmS7eSQ3Zp3Q9q5X6";
  const ok = await bcrypt.compare(password, hash);
  return ok && admin ? admin : null;
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(admin: { id: string; email: string; name: string; role: AdminRole }) {
  // `iat` has 1-second resolution; `iatMs` lets a session issued right after a password change
  // outlive that change while every token issued before it (even in the same second) is rejected.
  const token = await new SignJWT({ email: admin.email, name: admin.name, role: admin.role, kind: "admin", iatMs: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, { ...cookieBase, path: "/", maxAge: MAX_AGE_SECONDS });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.kind !== "admin" || !payload.sub || typeof payload.iat !== "number") return null;
    return {
      adminId: payload.sub,
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as AdminRole,
      issuedAtMs: typeof payload.iatMs === "number" ? payload.iatMs : payload.iat * 1000,
    };
  } catch {
    return null;
  }
}

// JWT-only check. Panel code must use requireAdminAccess() from src/app/admin/_lib/guard.ts,
// which also re-reads the admin row (removal, role, revoked sessions, 2FA policy).
export async function requireAdmin(role?: AdminRole): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (role === "SUPER_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/admin");
  return session;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

/** Password verified, TOTP still required: remember who for 5 minutes. */
export async function createPendingTwoFactor(adminId: string) {
  const token = await new SignJWT({ kind: "admin-2fa-pending", iatMs: Date.now() })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime(`${PENDING_MAX_AGE_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(PENDING_COOKIE, token, { ...cookieBase, path: PENDING_PATH, maxAge: PENDING_MAX_AGE_SECONDS });
}

export async function getPendingTwoFactor(): Promise<{ adminId: string; issuedAtMs: number } | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (payload.kind !== "admin-2fa-pending" || !payload.sub || typeof payload.iat !== "number") return null;
    return { adminId: payload.sub, issuedAtMs: typeof payload.iatMs === "number" ? payload.iatMs : payload.iat * 1000 };
  } catch {
    return null;
  }
}

export async function clearPendingTwoFactor() {
  (await cookies()).set(PENDING_COOKIE, "", { ...cookieBase, path: PENDING_PATH, maxAge: 0 });
}
