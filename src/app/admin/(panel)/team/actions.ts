"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess } from "../../_lib/guard";
import { ActionError, fail, fromActionError, fromZod, idSchema, isUniqueViolation, ok, str } from "../../_lib/validation";

const addAdminSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(80, "الاسم طويل جداً"),
  email: z.string().trim().toLowerCase().max(254, "البريد طويل جداً").pipe(z.email("أدخل بريداً إلكترونياً صحيحاً")),
  password: z.string().min(10, "كلمة المرور 10 أحرف على الأقل").max(200, "كلمة المرور طويلة جداً"),
  role: z.enum(AdminRole, "اختر الصلاحية"),
});

export async function addAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAccess("SUPER_ADMIN");
  const parsed = addAdminSchema.safeParse({
    name: str(formData, "name"),
    email: str(formData, "email"),
    password: str(formData, "password"),
    role: str(formData, "role"),
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { name, email, password, role } = parsed.data;

  try {
    await prisma.admin.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا البريد مسجّل لعضو آخر.", { email: "البريد مستخدم مسبقاً" });
    throw e;
  }
  revalidatePath("/admin/team");
  return ok(`تمت إضافة ${name}. يمكنه الدخول الآن من /admin/login.`);
}

export async function removeAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const parsed = idSchema.safeParse(str(formData, "id"));
  if (!parsed.success) return fromZod(parsed.error);
  const id = parsed.data;
  if (id === session.adminId) return fail("لا يمكنك حذف حسابك الخاص.");

  try {
    await prisma.$transaction(
      async (tx) => {
        const target = await tx.admin.findUnique({ where: { id }, select: { role: true } });
        if (!target) throw new ActionError("العضو غير موجود.");
        if (target.role === "SUPER_ADMIN") {
          const supers = await tx.admin.count({ where: { role: "SUPER_ADMIN" } });
          if (supers <= 1) throw new ActionError("لا يمكن حذف آخر مدير عام.");
        }
        await tx.admin.delete({ where: { id } });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    const handled = fromActionError(e);
    if (handled) return handled;
    throw e;
  }
  revalidatePath("/admin/team");
  return ok("تم حذف العضو، وأُلغيت صلاحية دخوله فوراً.");
}
