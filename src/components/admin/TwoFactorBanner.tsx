"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldIcon } from "./icons";

/** Persistent nudge for admins without 2FA (hidden on /admin/account, where it is set up). */
export function TwoFactorBanner({ required }: { required: boolean }) {
  const pathname = usePathname();
  if (pathname === "/admin/account") return null;
  return (
    <div role="note" className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-fuchsia/30 bg-fuchsia/10 px-4 py-3 text-sm">
      <ShieldIcon className="size-5 shrink-0 text-fuchsia" />
      <p className="min-w-0 flex-1">
        {required ? "التحقق بخطوتين إلزامي لأعضاء الفريق." : "حسابك محمي بكلمة المرور فقط."} فعّل التحقق بخطوتين لحماية المتجر
        حتى لو تسرّبت كلمة المرور.
      </p>
      <Link href="/admin/account" className="btn-primary px-3! py-1.5! text-xs!">
        تفعيل الآن
      </Link>
    </div>
  );
}
