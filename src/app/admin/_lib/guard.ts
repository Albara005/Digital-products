import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { AdminRole } from "@prisma/client";
import { getAdminSession, requireAdmin, type AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const loadAdmin = cache((id: string) =>
  prisma.admin.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, passwordChangedAt: true, totpEnabledAt: true },
  }),
);

export type AdminAccess = AdminSession & { twoFactorEnabled: boolean };

/** REQUIRE_ADMIN_2FA=true: admins without 2FA can only use /admin/account until they enable it. */
export function isTwoFactorRequired() {
  return process.env.REQUIRE_ADMIN_2FA === "true";
}

/** A session is revoked when it was issued before the admin's last password change / "sign out everywhere". */
function isRevoked(session: AdminSession, passwordChangedAt: Date | null) {
  return passwordChangedAt !== null && session.issuedAtMs < passwordChangedAt.getTime();
}

/**
 * Admin gate for every panel layout, page and Server Action.
 * Wraps `requireAdmin()` (JWT check + redirect to /admin/login) and re-reads the admin row,
 * so a removed admin loses access immediately instead of when their 12h cookie expires,
 * the role always comes from the database rather than the token, and sessions issued before
 * the last password change are rejected.
 *
 * `allowWithoutTwoFactor` is only for the panel layout and /admin/account (where 2FA is set up);
 * everything else is sent to /admin/account while REQUIRE_ADMIN_2FA=true and 2FA is off.
 */
export async function requireAdminAccess(
  role?: AdminRole,
  { allowWithoutTwoFactor = false }: { allowWithoutTwoFactor?: boolean } = {},
): Promise<AdminAccess> {
  const session = await requireAdmin(role);
  const admin = await loadAdmin(session.adminId);
  if (!admin) redirect("/admin/login?expired=1");
  if (isRevoked(session, admin.passwordChangedAt)) redirect("/admin/login?revoked=1");
  if (role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") redirect("/admin");
  const twoFactorEnabled = admin.totpEnabledAt !== null;
  if (!twoFactorEnabled && !allowWithoutTwoFactor && isTwoFactorRequired()) redirect("/admin/account?setup2fa=1");
  return {
    adminId: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    issuedAtMs: session.issuedAtMs,
    twoFactorEnabled,
  };
}

/** Non-redirecting variant for the sign-in pages: is there a live, unrevoked session? */
export async function hasValidAdminSession(): Promise<boolean> {
  const session = await getAdminSession();
  if (!session) return false;
  const admin = await loadAdmin(session.adminId);
  return Boolean(admin && !isRevoked(session, admin.passwordChangedAt));
}
