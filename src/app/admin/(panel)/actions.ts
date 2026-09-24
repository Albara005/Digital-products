"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { destroySession, requireAdmin } from "@/lib/auth";

export async function logoutAction() {
  // Plain JWT check (not the DB-backed guard) so a just-removed admin can still clear their cookie.
  const session = await requireAdmin();
  await destroySession();
  await audit({ adminId: session.adminId, email: session.email }, "auth.logout", { type: "admin", id: session.adminId });
  redirect("/admin/login");
}
