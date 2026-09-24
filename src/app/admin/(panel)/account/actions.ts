"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { encrypt } from "@/lib/crypto";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { generateTotpSecret } from "@/lib/totp";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess, type AdminAccess } from "../../_lib/guard";
import {
  checkLoginAllowed,
  checkTwoFactorAllowed,
  clearTwoFactorFailures,
  clientIp,
  registerLoginFailure,
  registerTwoFactorFailure,
} from "../../_lib/rate-limit";
import type { RecoveryCodesState } from "@/components/admin/AccountForms";
import {
  consumeTotp,
  deleteRecoveryCodes,
  normalizeCode,
  readTotpSecret,
  replaceRecoveryCodes,
} from "../../_lib/two-factor";
import { fail, fromZod, ok, str } from "../../_lib/validation";

// Every action here is for the signed-in admin's own account, so none takes an admin id from the form.
// They pass allowWithoutTwoFactor so an admin forced by REQUIRE_ADMIN_2FA can still set 2FA up.
const self = () => requireAdminAccess(undefined, { allowWithoutTwoFactor: true });
const actor = (s: AdminAccess) => ({ adminId: s.adminId, email: s.email });
const selfTarget = (s: AdminAccess) => ({ type: "admin", id: s.adminId });

const newPasswordSchema = z.string().min(10, "كلمة المرور 10 أحرف على الأقل").max(200, "كلمة المرور طويلة جداً");

/**
 * Re-checks the current password for a sensitive change. Failures share the sign-in throttle
 * for this email, so a hijacked session can't be used to brute-force the password.
 */
async function checkCurrentPassword(session: AdminAccess, password: string): Promise<FormState | null> {
  if (!password) return fail("أدخل كلمة المرور الحالية.", { currentPassword: "أدخل كلمة المرور الحالية." });
  if (password.length > 200) return fail("كلمة المرور طويلة جداً.", { currentPassword: "كلمة المرور طويلة جداً." });
  const ip = await clientIp();
  const gate = checkLoginAllowed(session.email, ip);
  if (!gate.allowed) return fail(`محاولات كثيرة. حاول مجدداً بعد ${gate.retryAfterMinutes} دقيقة.`);
  const admin = await prisma.admin.findUnique({ where: { id: session.adminId }, select: { passwordHash: true } });
  if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
    registerLoginFailure(session.email, ip);
    return fail("كلمة المرور الحالية غير صحيحة.", { currentPassword: "كلمة المرور الحالية غير صحيحة." });
  }
  return null;
}

/** Verifies a TOTP code for this admin (throttled, no replays). `secret` is the decrypted base32 key. */
async function checkCode(session: AdminAccess, secret: string, rawCode: string): Promise<FormState | null> {
  const code = normalizeCode(rawCode);
  if (!code) return fail("أدخل الرمز المكوّن من 6 أرقام.", { code: "أدخل الرمز المكوّن من 6 أرقام." });
  const ip = await clientIp();
  const gate = checkTwoFactorAllowed(session.adminId, ip);
  if (!gate.allowed) return fail(`محاولات كثيرة. حاول مجدداً بعد ${gate.retryAfterMinutes} دقيقة.`);
  const result = consumeTotp(session.adminId, secret, code);
  if (result !== "ok") {
    registerTwoFactorFailure(session.adminId, ip);
    await audit(actor(session), "auth.2fa_failed", selfTarget(session), { reason: result, context: "account" });
    const message = result === "replay" ? "هذا الرمز استُخدم للتو. انتظر الرمز التالي." : "الرمز غير صحيح. تأكد من الرمز الحالي في التطبيق.";
    return fail(message, { code: message });
  }
  clearTwoFactorFailures(session.adminId, ip);
  return null;
}

/**
 * Revokes every session of this admin issued before now (requireAdminAccess compares the token's
 * issue time with passwordChangedAt) and issues a fresh one, so only this browser stays signed in.
 */
async function reissueOwnSession(session: AdminAccess, data: { passwordHash?: string } = {}) {
  await prisma.admin.update({ where: { id: session.adminId }, data: { ...data, passwordChangedAt: new Date() } });
  await createSession({ id: session.adminId, email: session.email, name: session.name, role: session.role });
}

const nameSchema = z.string().trim().min(1, "الاسم مطلوب").max(80, "الاسم طويل جداً");

export async function updateOwnName(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await self();
  const parsed = nameSchema.safeParse(str(formData, "name"));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "الاسم غير صالح";
    return fail(message, { name: message });
  }
  if (parsed.data === session.name) return ok("لا تغييرات.");

  await prisma.admin.update({ where: { id: session.adminId }, data: { name: parsed.data } });
  await audit(actor(session), "account.name_change", selfTarget(session), { from: session.name, to: parsed.data });
  revalidatePath("/admin", "layout");
  return ok("تم حفظ الاسم.");
}

const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "أدخل كلمة المرور الحالية").max(200),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().max(200),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "التأكيد لا يطابق كلمة المرور الجديدة" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "اختر كلمة مرور مختلفة عن الحالية" });

export async function changeOwnPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await self();
  const parsed = passwordChangeSchema.safeParse({
    currentPassword: str(formData, "currentPassword"),
    newPassword: str(formData, "newPassword"),
    confirmPassword: str(formData, "confirmPassword"),
  });
  if (!parsed.success) return fromZod(parsed.error);

  const denied = await checkCurrentPassword(session, parsed.data.currentPassword);
  if (denied) return denied;

  await reissueOwnSession(session, { passwordHash: await hashPassword(parsed.data.newPassword) });
  await audit(actor(session), "account.password_change", selfTarget(session));
  revalidatePath("/admin/account");
  return ok("تم تغيير كلمة المرور. سُجّل خروج كل الأجهزة الأخرى، وبقيت متصلاً هنا.");
}

export async function revokeOtherSessions(): Promise<FormState> {
  const session = await self();
  await reissueOwnSession(session);
  await audit(actor(session), "account.sessions_revoke", selfTarget(session));
  revalidatePath("/admin/account");
  return ok("تم تسجيل الخروج من كل الأجهزة الأخرى.");
}

/** Step 1 of enabling 2FA: store a new (encrypted) secret; the page then shows it as a QR code. */
export async function startTotpSetup(): Promise<FormState> {
  const session = await self();
  const res = await prisma.admin.updateMany({
    where: { id: session.adminId, totpEnabledAt: null },
    data: { totpSecret: encrypt(generateTotpSecret()) },
  });
  if (res.count === 0) return fail("التحقق بخطوتين مفعّل مسبقاً.");
  revalidatePath("/admin/account");
  return ok("امسح الرمز بتطبيق المصادقة ثم أدخل الرمز الظاهر فيه.");
}

export async function cancelTotpSetup(): Promise<FormState> {
  const session = await self();
  await prisma.admin.updateMany({ where: { id: session.adminId, totpEnabledAt: null }, data: { totpSecret: null } });
  revalidatePath("/admin/account");
  return ok("أُلغي الإعداد.");
}

/**
 * Step 2: the first valid code (plus the password, so a hijacked session can't bind its own phone).
 * Returns the new recovery codes, shown once. It deliberately doesn't revalidate: the page would
 * switch to its "enabled" view and unmount the form holding the codes; the client refreshes once
 * the admin confirms they saved them.
 */
export async function confirmTotpSetup(_prev: FormState, formData: FormData): Promise<RecoveryCodesState> {
  const session = await self();
  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!admin) return fail("الحساب غير موجود.");
  if (admin.totpEnabledAt) return fail("التحقق بخطوتين مفعّل مسبقاً.");
  const secret = readTotpSecret(admin.totpSecret);
  if (!secret) return fail("ابدأ الإعداد من جديد.");

  const denied = (await checkCurrentPassword(session, str(formData, "currentPassword"))) ?? (await checkCode(session, secret, str(formData, "code")));
  if (denied) return denied;

  // Conditional on the same encrypted secret, so a concurrent "start again" can't enable a key the admin never scanned
  const codes = await prisma.$transaction(async (tx) => {
    const res = await tx.admin.updateMany({
      where: { id: session.adminId, totpEnabledAt: null, totpSecret: admin.totpSecret },
      data: { totpEnabledAt: new Date() },
    });
    if (res.count === 0) return null;
    return replaceRecoveryCodes(session.adminId, tx);
  });
  if (!codes) return fail("تغيّر الإعداد في نافذة أخرى. أعد تحميل الصفحة.");
  await audit(actor(session), "account.2fa_enable", selfTarget(session), { recoveryCodes: codes.length });
  return { ok: true, message: "تم تفعيل التحقق بخطوتين. سيُطلب الرمز عند كل تسجيل دخول.", ts: Date.now(), codes };
}

/** New set of recovery codes (old ones stop working). Needs the password and a current authenticator code. */
export async function regenerateRecoveryCodes(_prev: FormState, formData: FormData): Promise<RecoveryCodesState> {
  const session = await self();
  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!admin?.totpEnabledAt) return fail("فعّل التحقق بخطوتين أولاً.");
  const secret = readTotpSecret(admin.totpSecret);
  if (!secret) return fail("تعذّر قراءة مفتاح التحقق. اطلب من المدير العام تعطيله لحسابك ثم فعّله من جديد.");

  const denied = (await checkCurrentPassword(session, str(formData, "currentPassword"))) ?? (await checkCode(session, secret, str(formData, "code")));
  if (denied) return denied;

  const codes = await replaceRecoveryCodes(session.adminId);
  await audit(actor(session), "account.recovery_codes_regenerate", selfTarget(session), { count: codes.length });
  return { ok: true, message: "أُنشئت رموز استرداد جديدة وأُلغيت القديمة.", ts: Date.now(), codes };
}

export async function disableOwnTotp(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await self();
  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { totpSecret: true, totpEnabledAt: true },
  });
  if (!admin?.totpEnabledAt) return fail("التحقق بخطوتين غير مفعّل.");
  const secret = readTotpSecret(admin.totpSecret);
  if (!secret) return fail("تعذّر قراءة مفتاح التحقق. اطلب من المدير العام تعطيله لحسابك.");

  const denied = (await checkCurrentPassword(session, str(formData, "currentPassword"))) ?? (await checkCode(session, secret, str(formData, "code")));
  if (denied) return denied;

  await prisma.$transaction(async (tx) => {
    await tx.admin.update({ where: { id: session.adminId }, data: { totpSecret: null, totpEnabledAt: null } });
    await deleteRecoveryCodes(session.adminId, tx);
  });
  await audit(actor(session), "account.2fa_disable", selfTarget(session));
  revalidatePath("/admin", "layout");
  return ok("تم تعطيل التحقق بخطوتين.");
}
