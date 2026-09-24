import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { ActionButton } from "@/components/admin/ActionButton";
import { AddAdminForm } from "@/components/admin/AddAdminForm";
import { CheckIcon, PencilIcon, ShieldIcon, TrashIcon, UsersIcon } from "@/components/admin/icons";
import { DataTable, PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { addAdmin, changeAdminRole, disableAdminTwoFactor, removeAdmin, resetAdminPassword } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الفريق" };

const roleLabel = { SUPER_ADMIN: "مدير عام", STAFF: "موظف" } as const;

export default async function TeamPage() {
  const session = await requireAdminAccess("SUPER_ADMIN");

  const admins = await prisma.admin.findMany({
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, email: true, role: true, createdAt: true, totpEnabledAt: true },
  });
  const superCount = admins.filter((a) => a.role === "SUPER_ADMIN").length;

  return (
    <>
      <PageHeader
        title="الفريق"
        description="من يمكنه الدخول إلى لوحة التحكم. الموظف لا يرى صفحة الفريق ولا سجل النشاط. إعدادات حسابك أنت في «حسابي والأمان»."
      />

      <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card overflow-hidden" aria-label="أعضاء الفريق">
          <DataTable>
            <thead>
              <tr>
                <th>العضو</th>
                <th>الصلاحية</th>
                <th className="whitespace-nowrap">التحقق بخطوتين</th>
                <th>
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
                      <span className="mt-0.5 block whitespace-nowrap text-[11px] text-muted">منذ {formatDate(a.createdAt)}</span>
                    </td>
                    <td>
                      <span
                        className={`badge whitespace-nowrap ${
                          a.role === "SUPER_ADMIN" ? "bg-fuchsia/15 text-fuchsia" : "bg-surface-2 text-muted ring-1 ring-border"
                        }`}
                      >
                        {roleLabel[a.role]}
                      </span>
                    </td>
                    <td>
                      {a.totpEnabledAt ? (
                        <span className="badge gap-1 bg-success/15 text-success ring-1 ring-success/30" title={`منذ ${formatDate(a.totpEnabledAt)}`}>
                          <CheckIcon className="size-3" />
                          مفعّل
                        </span>
                      ) : (
                        <span className="badge bg-surface-2 text-muted ring-1 ring-border">غير مفعّل</span>
                      )}
                    </td>
                    <td>
                      {isSelf ? (
                        <Link href="/admin/account" className="text-xs text-muted hover:text-volt">
                          من «حسابي والأمان»
                        </Link>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5 [&_button]:whitespace-nowrap">
                          <ActionButton
                            action={resetAdminPassword}
                            fields={{ id: a.id }}
                            variant="subtle"
                            pendingLabel="جارٍ الحفظ…"
                            confirm={{
                              title: `كلمة مرور جديدة لـ ${a.name}`,
                              body: (
                                <div className="flex flex-col gap-3">
                                  <p>ستُلغى كلمة مروره الحالية ويُسجَّل خروجه من كل الأجهزة فوراً. سلّمه الكلمة الجديدة بطريقة آمنة.</p>
                                  <div>
                                    <label htmlFor={`reset-${a.id}`} className="label">
                                      كلمة المرور الجديدة
                                    </label>
                                    <input
                                      id={`reset-${a.id}`}
                                      name="password"
                                      type="password"
                                      dir="ltr"
                                      minLength={10}
                                      maxLength={200}
                                      required
                                      autoComplete="new-password"
                                      className="input text-start"
                                    />
                                    <p className="mt-1 text-xs">10 أحرف على الأقل.</p>
                                  </div>
                                </div>
                              ),
                              confirmLabel: "تعيين كلمة المرور",
                              tone: "primary",
                            }}
                          >
                            <PencilIcon className="size-3.5" />
                            كلمة المرور
                          </ActionButton>
                          {a.totpEnabledAt && (
                            <ActionButton
                              action={disableAdminTwoFactor}
                              fields={{ id: a.id }}
                              variant="subtle"
                              confirm={{
                                title: "تعطيل التحقق بخطوتين؟",
                                body: (
                                  <>
                                    سيتمكن <strong className="text-text">{a.name}</strong> من الدخول بكلمة المرور وحدها. استخدمه فقط إذا فقد
                                    هاتفه، وتأكد من هويته قبل ذلك.
                                  </>
                                ),
                                confirmLabel: "تعطيل 2FA",
                              }}
                            >
                              <ShieldIcon className="size-3.5" />
                              تعطيل 2FA
                            </ActionButton>
                          )}
                          {!lastSuper && (
                            <ActionButton
                              action={changeAdminRole}
                              fields={{ id: a.id, role: a.role === "SUPER_ADMIN" ? "STAFF" : "SUPER_ADMIN" }}
                              variant="subtle"
                              confirm={{
                                title: a.role === "SUPER_ADMIN" ? "تحويل إلى موظف؟" : "ترقية إلى مدير عام؟",
                                body:
                                  a.role === "SUPER_ADMIN" ? (
                                    <>
                                      سيفقد <strong className="text-text">{a.name}</strong> الوصول إلى الفريق وسجل النشاط فوراً.
                                    </>
                                  ) : (
                                    <>
                                      سيتمكن <strong className="text-text">{a.name}</strong> من إدارة الفريق وكلمات مرورهم وقراءة سجل النشاط.
                                    </>
                                  ),
                                confirmLabel: a.role === "SUPER_ADMIN" ? "تحويل إلى موظف" : "ترقية",
                                tone: "primary",
                              }}
                            >
                              <UsersIcon className="size-3.5" />
                              {a.role === "SUPER_ADMIN" ? "تحويل لموظف" : "ترقية"}
                            </ActionButton>
                          )}
                          {!lastSuper && (
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
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </section>

        <section className="card w-full max-w-xl p-5 2xl:max-w-none" aria-labelledby="add-admin">
          <h2 id="add-admin" className="mb-4 font-semibold">
            إضافة عضو
          </h2>
          <AddAdminForm action={addAdmin} />
        </section>
      </div>
    </>
  );
}
