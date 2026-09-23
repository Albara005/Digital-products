import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE = "nitro_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12;

export type AdminSession = { adminId: string; email: string; name: string; role: AdminRole };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function verifyCredentials(email: string, password: string) {
  const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase().trim() } });
  // Compare even when the admin is missing so response time doesn't reveal which emails exist
  const hash = admin?.passwordHash ?? "$2b$12$HqmWkL0B9ZmyTcplIIt4Ye9VxyRCbQCP5LcXZmS7eSQ3Zp3Q9q5X6";
  const ok = await bcrypt.compare(password, hash);
  return ok && admin ? admin : null;
}

export async function createSession(admin: { id: string; email: string; name: string; role: AdminRole }) {
  const token = await new SignJWT({ email: admin.email, name: admin.name, role: admin.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(admin.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      adminId: payload.sub,
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as AdminRole,
    };
  } catch {
    return null;
  }
}

// Use in every admin page, layout and server action: server actions are reachable by direct POST.
export async function requireAdmin(role?: AdminRole): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  if (role === "SUPER_ADMIN" && session.role !== "SUPER_ADMIN") redirect("/admin");
  return session;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
