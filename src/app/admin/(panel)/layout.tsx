import type { Metadata } from "next";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { AdminNav } from "@/components/admin/AdminNav";
import { TwoFactorBanner } from "@/components/admin/TwoFactorBanner";
import { isTwoFactorRequired, requireAdminAccess } from "../_lib/guard";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  // Pages and actions enforce REQUIRE_ADMIN_2FA themselves; the layout also wraps /admin/account,
  // where 2FA is set up, so it must not redirect.
  const admin = await requireAdminAccess(undefined, { allowWithoutTwoFactor: true });
  const awaitingDelivery = await prisma.order.count({ where: { status: "PAID" } });

  return (
    <div className="min-h-screen w-full lg:flex">
      <AdminNav
        admin={{ name: admin.name, email: admin.email, role: admin.role }}
        awaitingDelivery={awaitingDelivery}
        logoutAction={logoutAction}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-7xl">
          {!admin.twoFactorEnabled && <TwoFactorBanner required={isTwoFactorRequired()} />}
          {children}
        </div>
      </main>
    </div>
  );
}
