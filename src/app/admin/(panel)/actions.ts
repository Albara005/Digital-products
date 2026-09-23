"use server";

import { redirect } from "next/navigation";
import { destroySession, requireAdmin } from "@/lib/auth";

export async function logoutAction() {
  // Plain JWT check (not the DB-backed guard) so a just-removed admin can still clear their cookie.
  await requireAdmin();
  await destroySession();
  redirect("/admin/login");
}
