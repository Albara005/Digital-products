import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LoginForm } from "@/components/admin/LoginForm";
import { loginAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تسجيل الدخول",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  const session = await getAdminSession();
  // Only bounce valid, still-existing admins (a removed admin's cookie would otherwise loop).
  if (session) {
    const exists = await prisma.admin.count({ where: { id: session.adminId } });
    if (exists) redirect("/admin");
  }
  const { expired } = await searchParams;

  return (
    <main className="relative flex min-h-screen flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 size-[520px] -translate-x-1/2 rounded-full bg-volt/10 blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Image
            src="/brand/nitro-logo.webp"
            alt="Nitro Store"
            width={72}
            height={72}
            priority
            className="size-18 rounded-2xl ring-1 ring-border"
          />
          <div>
            <h1 className="text-xl font-bold">لوحة تحكم Nitro Store</h1>
            <p className="mt-1 text-sm text-muted">سجّل الدخول لإدارة المتجر</p>
          </div>
        </div>
        <div className="card p-6">
          {expired && (
            <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
              انتهت صلاحية الجلسة أو تم إيقاف الحساب. سجّل الدخول مجدداً.
            </p>
          )}
          <LoginForm action={loginAction} />
        </div>
      </div>
    </main>
  );
}
