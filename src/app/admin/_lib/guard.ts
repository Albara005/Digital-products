import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { AdminRole } from "@prisma/client";
import { requireAdmin, type AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const loadAdmin = cache((id: string) =>
  prisma.admin.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true } }),
);

/**
 * Admin gate for every panel layout, page and Server Action.
 * Wraps `requireAdmin()` (JWT check + redirect to /admin/login) and re-reads the admin row,
 * so a removed admin loses access immediately instead of when their 12h cookie expires,
 * and the role always comes from the database rather than the token.
 */
export async function requireAdminAccess(role?: AdminRole): Promise<AdminSession> {
  const session = await requireAdmin(role);
  const admin = await loadAdmin(session.adminId);
  if (!admin) redirect("/admin/login?expired=1");
  if (role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") redirect("/admin");
  return { adminId: admin.id, email: admin.email, name: admin.name, role: admin.role };
}
