"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, verifyCredentials } from "@/lib/auth";
import type { FormState } from "../../_lib/form-state";
import { checkLoginAllowed, clearLoginFailures, clientIp, registerLoginFailure } from "../../_lib/rate-limit";
import { fail, fromZod, str } from "../../_lib/validation";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254, "البريد طويل جداً").pipe(z.email("أدخل بريداً إلكترونياً صحيحاً")),
  password: z.string().min(1, "أدخل كلمة المرور").max(200, "كلمة المرور طويلة جداً"),
});

// The only admin action without requireAdmin(): it is the sign-in itself. Throttled per email+IP.
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
    return fail("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
  }

  clearLoginFailures(email, ip);
  await createSession(admin);
  redirect("/admin");
}
