import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { hasValidAdminSession } from "../../_lib/guard";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  // Only bounce live sessions: a removed admin's or a revoked session's cookie would otherwise loop.
  if (await hasValidAdminSession()) redirect("/admin");
  const { expired, revoked, verify } = await searchParams;
  const notice = revoked
    ? "انتهت جلستك لأن كلمة المرور تغيّرت أو أُنهيت الجلسات من جهاز آخر. سجّل الدخول مجدداً."
    : verify
      ? "انتهت مهلة التحقق بخطوتين. أدخل كلمة المرور مجدداً."
      : expired
        ? "انتهت صلاحية الجلسة أو تم إيقاف الحساب. سجّل الدخول مجدداً."
        : null;

  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-volt/10 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/brand/nitro-mark.webp"
            alt="Nitro Store"
            width={72}
            height={72}
            priority
            className="size-18 rounded-2xl bg-surface-2 p-2 ring-1 ring-border"
          />
          <div>
            <h1 className="text-xl font-bold">لوحة تحكم Nitro Store</h1>
            <p className="mt-1 text-sm text-muted">سجّل الدخول لإدارة المتجر</p>
          </div>
        </div>
        <div className="card p-6">
          {notice && <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">{notice}</p>}
          <LoginForm action={loginAction} />
        </div>
      </div>
    </main>
  );
}
