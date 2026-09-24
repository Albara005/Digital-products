"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { createPendingTwoFactor, createSession, verifyCredentials } from "@/lib/auth";
import type { FormState } from "../../_lib/form-state";
import { checkLoginAllowed, clearLoginFailures, clientIp, registerLoginFailure } from "../../_lib/rate-limit";
import { fail, fromZod, str } from "../../_lib/validation";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254, "البريد طويل جداً").pipe(z.email("أدخل بريداً إلكترونياً صحيحاً")),
  password: z.string().min(1, "أدخل كلمة المرور").max(200, "كلمة المرور طويلة جداً"),
});

// The only admin actions without requireAdmin() are this one and the 2FA step (./verify):
// they are the sign-in itself. Throttled per email+IP.
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: str(formData, "email"), password: str(formData, "password") });
  if (!parsed.success) return fromZod(parsed.error);
  const { email, password } = parsed.data;

  const ip = await clientIp();
  const gate = checkLoginAllowed(email, ip);
  if (!gate.allowed) {
    return fail(`محاولات دخول كثيرة. حاول مجدداً بعد ${gate.retryAfterMinutes} دقيقة.`);
  }

  const admin = await verifyCredentials(email, password);
  if (!admin) {
    registerLoginFailure(email, ip);
    // Looked up after the bcrypt compare, so it doesn't change the response time. Never log the password.
    const target = await prisma.admin.findUnique({ where: { email }, select: { id: true } });
    await audit(null, "auth.login_failed", target ? { type: "admin", id: target.id } : null, { email });
    return fail("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
  }

  clearLoginFailures(email, ip);
  if (admin.totpEnabledAt) {
    // Password step done; the session is only issued once the TOTP code checks out.
    await createPendingTwoFactor(admin.id);
    redirect("/admin/login/verify");
  }

  await createSession(admin);
  await audit({ adminId: admin.id, email: admin.email }, "auth.login", { type: "admin", id: admin.id }, { method: "password" });
  redirect("/admin");
}
