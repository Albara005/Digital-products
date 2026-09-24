"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AdminRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess, type AdminAccess } from "../../_lib/guard";
import { deleteRecoveryCodes } from "../../_lib/two-factor";
import {
  ActionError,
  fail,
  fromActionError,
  fromZod,
  idSchema,
  isNotFound,
  isSerializationFailure,
  isUniqueViolation,
  ok,
  str,
} from "../../_lib/validation";

const actor = (s: AdminAccess) => ({ adminId: s.adminId, email: s.email });

const passwordSchema = z.string().min(10, "كلمة المرور 10 أحرف على الأقل").max(200, "كلمة المرور طويلة جداً");

const addAdminSchema = z.object({
  name: z.string().trim().min(1, "الاسم مطلوب").max(80, "الاسم طويل جداً"),
  email: z.string().trim().toLowerCase().max(254, "البريد طويل جداً").pipe(z.email("أدخل بريداً إلكترونياً صحيحاً")),
  password: passwordSchema,
  role: z.enum(AdminRole, "اختر الصلاحية"),
});

export async function addAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const parsed = addAdminSchema.safeParse({
    name: str(formData, "name"),
    email: str(formData, "email"),
    password: str(formData, "password"),
    role: str(formData, "role"),
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { name, email, password, role } = parsed.data;

  let id: string;
  try {
    ({ id } = await prisma.admin.create({
      data: { name, email, role, passwordHash: await hashPassword(password) },
      select: { id: true },
    }));
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا البريد مسجّل لعضو آخر.", { email: "البريد مستخدم مسبقاً" });
    throw e;
  }
  await audit(actor(session), "team.add", { type: "admin", id }, { email, name, role });
  revalidatePath("/admin/team");
  return ok(`تمت إضافة ${name}. يمكنه الدخول الآن من /admin/login.`);
}

/** Id of another team member from the form. Acting on yourself goes through /admin/account instead. */
function otherAdminId(session: AdminAccess, formData: FormData): { id: string } | { error: FormState } {
  const parsed = idSchema.safeParse(str(formData, "id"));
  if (!parsed.success) return { error: fromZod(parsed.error) };
  if (parsed.data === session.adminId) return { error: fail("لإدارة حسابك استخدم صفحة «حسابي والأمان».") };
  return { id: parsed.data };
}

export async function removeAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const target = otherAdminId(session, formData);
  if ("error" in target) return target.error;
  const { id } = target;

  let removed: { email: string; name: string; role: AdminRole };
  try {
    removed = await prisma.$transaction(
      async (tx) => {
        const row = await tx.admin.findUnique({ where: { id }, select: { email: true, name: true, role: true } });
        if (!row) throw new ActionError("العضو غير موجود.");
        if (row.role === "SUPER_ADMIN") {
          const supers = await tx.admin.count({ where: { role: "SUPER_ADMIN" } });
          if (supers <= 1) throw new ActionError("لا يمكن حذف آخر مدير عام.");
        }
        await tx.admin.delete({ where: { id } });
        return row;
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    const handled = fromActionError(e);
    if (handled) return handled;
    if (isSerializationFailure(e)) return fail("تزامن هذا مع تغيير آخر على الفريق. أعد تحميل الصفحة وحاول مجدداً.");
    throw e;
  }
  await audit(actor(session), "team.remove", { type: "admin", id }, removed);
  revalidatePath("/admin/team");
  return ok("تم حذف العضو، وأُلغيت صلاحية دخوله فوراً.");
}

/** Sets a new password for another admin and signs them out everywhere (their old sessions are revoked). */
export async function resetAdminPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const target = otherAdminId(session, formData);
  if ("error" in target) return target.error;
  const parsed = passwordSchema.safeParse(str(formData, "password"));
  if (!parsed.success) return fromZod(parsed.error);

  let email: string;
  try {
    ({ email } = await prisma.admin.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(parsed.data), passwordChangedAt: new Date() },
      select: { email: true },
    }));
  } catch (e) {
    if (isNotFound(e)) return fail("العضو غير موجود.");
    throw e;
  }
  await audit(actor(session), "team.password_reset", { type: "admin", id: target.id }, { email });
  revalidatePath("/admin/team");
  return ok("تم تعيين كلمة المرور الجديدة وتسجيل خروجه من كل الأجهزة. سلّمها له بطريقة آمنة.");
}

/** Recovery for a lost phone: removes another admin's TOTP secret so they sign in with the password alone. */
export async function disableAdminTwoFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const target = otherAdminId(session, formData);
  if ("error" in target) return target.error;

  const row = await prisma.admin.findUnique({ where: { id: target.id }, select: { email: true, totpEnabledAt: true } });
  if (!row) return fail("العضو غير موجود.");
  if (!row.totpEnabledAt) return fail("التحقق بخطوتين غير مفعّل لهذا العضو.");
  await prisma.$transaction(async (tx) => {
    await tx.admin.update({ where: { id: target.id }, data: { totpSecret: null, totpEnabledAt: null } });
    await deleteRecoveryCodes(target.id, tx);
  });
  await audit(actor(session), "team.2fa_disable", { type: "admin", id: target.id }, { email: row.email });
  revalidatePath("/admin/team");
  return ok("تم تعطيل التحقق بخطوتين. يمكنه الدخول بكلمة المرور ثم إعادة التفعيل من صفحة حسابه.");
}

export async function changeAdminRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const target = otherAdminId(session, formData);
  if ("error" in target) return target.error;
  const role = z.enum(AdminRole).safeParse(str(formData, "role"));
  if (!role.success) return fail("صلاحية غير صالحة.");
  const { id } = target;

  let change: { email: string; from: AdminRole } | null;
  try {
    change = await prisma.$transaction(
      async (tx) => {
        const row = await tx.admin.findUnique({ where: { id }, select: { email: true, role: true } });
        if (!row) throw new ActionError("العضو غير موجود.");
        if (row.role === role.data) return null;
        if (row.role === "SUPER_ADMIN") {
          const supers = await tx.admin.count({ where: { role: "SUPER_ADMIN" } });
          if (supers <= 1) throw new ActionError("لا يمكن تحويل آخر مدير عام إلى موظف.");
        }
        await tx.admin.update({ where: { id }, data: { role: role.data } });
        return { email: row.email, from: row.role };
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    const handled = fromActionError(e);
    if (handled) return handled;
    if (isSerializationFailure(e)) return fail("تزامن هذا مع تغيير آخر على الفريق. أعد تحميل الصفحة وحاول مجدداً.");
    throw e;
  }
  if (!change) return ok("لا تغييرات.");
  await audit(actor(session), "team.role_change", { type: "admin", id }, { email: change.email, from: change.from, to: role.data });
  revalidatePath("/admin/team");
  return ok(role.data === "SUPER_ADMIN" ? "أصبح مديراً عاماً." : "أصبح موظفاً.");
}
