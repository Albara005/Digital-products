import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { ActionButton } from "@/components/admin/ActionButton";
import { AddAdminForm } from "@/components/admin/AddAdminForm";
import { TrashIcon } from "@/components/admin/icons";
import { DataTable, PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { addAdmin, removeAdmin } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الفريق" };

const roleLabel = { SUPER_ADMIN: "مدير عام", STAFF: "موظف" } as const;

export default async function TeamPage() {
  const session = await requireAdminAccess("SUPER_ADMIN");

  const admins = await prisma.admin.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  const superCount = admins.filter((a) => a.role === "SUPER_ADMIN").length;

  return (
    <>
      <PageHeader title="الفريق" description="من يمكنه الدخول إلى لوحة التحكم. الموظف لا يرى صفحة الفريق." />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card overflow-hidden" aria-label="أعضاء الفريق">
          <DataTable>
            <thead>
              <tr>
                <th>العضو</th>
                <th>الصلاحية</th>
                <th>منذ</th>
                <th className="w-px">
                  <span className="sr-only">إجراءات</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => {
                const isSelf = a.id === session.adminId;
                const lastSuper = a.role === "SUPER_ADMIN" && superCount <= 1;
                return (
                  <tr key={a.id}>
                    <td>
                      <span className="flex items-center gap-2 font-medium">
                        {a.name}
                        {isSelf && <span className="badge bg-volt/15 text-volt">أنت</span>}
                      </span>
                      <span className="block text-xs text-muted" dir="ltr">
                        <span className="block text-end">{a.email}</span>
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          a.role === "SUPER_ADMIN" ? "bg-fuchsia/15 text-fuchsia" : "bg-surface-2 text-muted ring-1 ring-border"
                        }`}
                      >
                        {roleLabel[a.role]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-xs text-muted">{formatDate(a.createdAt)}</td>
                    <td>
                      {isSelf || lastSuper ? (
                        <span className="text-xs text-muted" title={isSelf ? "لا يمكنك حذف حسابك" : "آخر مدير عام"}>
                          —
                        </span>
                      ) : (
                        <ActionButton
                          action={removeAdmin}
                          fields={{ id: a.id }}
                          variant="danger"
                          confirm={{
                            title: "حذف عضو من الفريق؟",
                            body: (
                              <>
                                سيفقد <strong className="text-text">{a.name}</strong> صلاحية الدخول إلى لوحة التحكم فوراً.
                              </>
                            ),
                            confirmLabel: "حذف العضو",
                          }}
                        >
                          <TrashIcon className="size-3.5" />
                          حذف
                        </ActionButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </section>

        <section className="card p-5" aria-labelledby="add-admin">
          <h2 id="add-admin" className="mb-4 font-semibold">
            إضافة عضو
          </h2>
          <AddAdminForm action={addAdmin} />
        </section>
      </div>
    </>
  );
}
