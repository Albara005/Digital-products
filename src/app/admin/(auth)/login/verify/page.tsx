import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getPendingTwoFactor } from "@/lib/auth";
import { ShieldIcon } from "@/components/admin/icons";
import { TwoFactorForm } from "@/components/admin/TwoFactorForm";
import { hasValidAdminSession } from "../../../_lib/guard";
import { cancelTwoFactorAction, verifyTwoFactorAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "التحقق بخطوتين",
  robots: { index: false, follow: false },
};

export default async function AdminTwoFactorPage() {
  if (await hasValidAdminSession()) redirect("/admin");
  // The pending cookie is only readable here if the password step passed in the last 5 minutes
  if (!(await getPendingTwoFactor())) redirect("/admin/login?verify=expired");

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
            <h1 className="text-xl font-bold">التحقق بخطوتين</h1>
            <p className="mt-1 text-sm text-muted">أدخل الرمز الظاهر في تطبيق المصادقة على هاتفك</p>
          </div>
        </div>
        <div className="card p-6">
          <p className="mb-4 flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
            <ShieldIcon className="mt-0.5 size-4 shrink-0 text-volt" />
            كلمة المرور صحيحة. يتغير الرمز كل 30 ثانية، ولديك 5 دقائق لإدخاله.
          </p>
          <TwoFactorForm action={verifyTwoFactorAction} />
          <form action={cancelTwoFactorAction} className="mt-4 text-center">
            <button type="submit" className="text-xs text-muted underline-offset-4 hover:text-text hover:underline">
              الدخول بحساب آخر
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs leading-relaxed text-muted">
          فقدت هاتفك؟ استخدم أحد رموز الاسترداد، أو اطلب من المدير العام تعطيل التحقق بخطوتين لحسابك من صفحة الفريق.
        </p>
      </div>
    </main>
  );
}
