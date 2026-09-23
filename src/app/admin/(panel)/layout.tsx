import type { Metadata } from "next";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminAccess } from "../_lib/guard";
import { logoutAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "لوحة التحكم", template: "%s | لوحة التحكم" },
  robots: { index: false, follow: false },
};

export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminAccess();
  const awaitingDelivery = await prisma.order.count({ where: { status: "PAID" } });

  return (
    <div className="min-h-screen w-full lg:flex">
      <AdminNav
        admin={{ name: admin.name, email: admin.email, role: admin.role }}
        awaitingDelivery={awaitingDelivery}
        logoutAction={logoutAction}
      />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
