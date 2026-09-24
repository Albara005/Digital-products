"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { clearPendingTwoFactor, createSession, getPendingTwoFactor } from "@/lib/auth";
import type { FormState } from "../../../_lib/form-state";
import {
  checkTwoFactorAllowed,
  clearTwoFactorFailures,
  clientIp,
  registerTwoFactorFailure,
} from "../../../_lib/rate-limit";
import {
  consumeRecoveryCode,
  consumeTotp,
  countUnusedRecoveryCodes,
  normalizeCode,
  normalizeRecoveryCode,
  readTotpSecret,
} from "../../../_lib/two-factor";
import { fail, str } from "../../../_lib/validation";

/**
 * Sign-in step 2. Authorised by the short-lived "pending 2FA" cookie that loginAction sets after a
 * correct password (not by a session: there is none yet). Throttled per admin and per IP.
 * Accepts either the authenticator code or (mode=recovery) a single-use recovery code; both share
 * the same throttle.
 */
export async function verifyTwoFactorAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const pending = await getPendingTwoFactor();
  if (!pending) redirect("/admin/login?verify=expired");

  if (str(formData, "mode") === "recovery") return verifyRecoveryCode(pending, str(formData, "recoveryCode"));

  const code = normalizeCode(str(formData, "code"));
  if (!code) return fail("أدخل الرمز المكوّن من 6 أرقام.", { code: "أدخل الرمز المكوّن من 6 أرقام." });

  const ip = await clientIp();
  const gate = checkTwoFactorAllowed(pending.adminId, ip);
  if (!gate.allowed) return fail(`محاولات كثيرة. حاول مجدداً بعد ${gate.retryAfterMinutes} دقيقة.`);

  const admin = await prisma.admin.findUnique({
    where: { id: pending.adminId },
    select: { id: true, email: true, name: true, role: true, totpSecret: true, totpEnabledAt: true, passwordChangedAt: true },
  });
  // Removed, 2FA reset by a super admin, or password changed since the password step: start over.
  if (!admin || !admin.totpEnabledAt || (admin.passwordChangedAt && pending.issuedAtMs < admin.passwordChangedAt.getTime())) {
    await clearPendingTwoFactor();
    redirect("/admin/login?verify=expired");
  }
  const secret = readTotpSecret(admin.totpSecret);
  if (!secret) return fail("تعذّر قراءة مفتاح التحقق بخطوتين. تواصل مع المدير العام لإعادة تعيينه.");

  const result = consumeTotp(admin.id, secret, code);
  if (result !== "ok") {
    registerTwoFactorFailure(admin.id, ip);
    await audit({ adminId: admin.id, email: admin.email }, "auth.2fa_failed", { type: "admin", id: admin.id }, { reason: result });
    const message =
      result === "replay" ? "هذا الرمز استُخدم للتو. انتظر ظهور الرمز التالي في التطبيق." : "الرمز غير صحيح. تأكد من الرمز الحالي في تطبيق المصادقة.";
    return fail(message, { code: message });
  }

  clearTwoFactorFailures(admin.id, ip);
  await clearPendingTwoFactor();
  await createSession(admin);
  await audit({ adminId: admin.id, email: admin.email }, "auth.login", { type: "admin", id: admin.id }, { method: "password+totp" });
  redirect("/admin");
}

async function verifyRecoveryCode(pending: { adminId: string; issuedAtMs: number }, raw: string): Promise<FormState> {
  const message = "أدخل رمز الاسترداد كما حفظته، مثل ABCD-EF23.";
  if (!normalizeRecoveryCode(raw)) return fail(message, { recoveryCode: message });

  const ip = await clientIp();
  const gate = checkTwoFactorAllowed(pending.adminId, ip);
  if (!gate.allowed) return fail(`محاولات كثيرة. حاول مجدداً بعد ${gate.retryAfterMinutes} دقيقة.`);

  const admin = await prisma.admin.findUnique({
    where: { id: pending.adminId },
    select: { id: true, email: true, name: true, role: true, totpEnabledAt: true, passwordChangedAt: true },
  });
  if (!admin || !admin.totpEnabledAt || (admin.passwordChangedAt && pending.issuedAtMs < admin.passwordChangedAt.getTime())) {
    await clearPendingTwoFactor();
    redirect("/admin/login?verify=expired");
  }

  const who = { adminId: admin.id, email: admin.email };
  const target = { type: "admin", id: admin.id };
  if (!(await consumeRecoveryCode(admin.id, raw))) {
    registerTwoFactorFailure(admin.id, ip);
    await audit(who, "auth.2fa_failed", target, { reason: "recovery_invalid" });
    const invalid = "رمز الاسترداد غير صحيح أو استُخدم من قبل.";
    return fail(invalid, { recoveryCode: invalid });
  }

  clearTwoFactorFailures(admin.id, ip);
  const remaining = await countUnusedRecoveryCodes(admin.id);
  await audit(who, "auth.recovery_code_used", target, { remaining });
  await clearPendingTwoFactor();
  await createSession(admin);
  await audit(who, "auth.login", target, { method: "password+recovery_code" });
  redirect("/admin/account?recoveryUsed=1");
}

/** "Use another account": drop the pending step and return to the password form. */
export async function cancelTwoFactorAction() {
  await clearPendingTwoFactor();
  redirect("/admin/login");
}
