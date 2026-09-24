import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { Pagination, firstParam, pageParam } from "@/components/admin/Pagination";
import { DataTable, EmptyState, PageHeader, shortId } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { addDays } from "../../_lib/dates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "سجل النشاط" };

const PAGE_SIZE = 50;
const SYSTEM = "system"; // AuditLog.adminEmail for rows without a signed-in admin (failed sign-ins, webhooks)

const actionLabel: Record<string, string> = {
  "auth.login": "تسجيل دخول",
  "auth.login_failed": "محاولة دخول فاشلة",
  "auth.2fa_failed": "رمز تحقق خاطئ",
  "auth.logout": "تسجيل خروج",
  "account.name_change": "تغيير الاسم",
  "account.password_change": "تغيير كلمة المرور",
  "account.sessions_revoke": "خروج من الأجهزة الأخرى",
  "account.2fa_enable": "تفعيل التحقق بخطوتين",
  "account.2fa_disable": "تعطيل التحقق بخطوتين",
  "team.add": "إضافة عضو",
  "team.remove": "حذف عضو",
  "team.password_reset": "إعادة تعيين كلمة مرور عضو",
  "team.2fa_disable": "تعطيل 2FA لعضو",
  "team.role_change": "تغيير صلاحية عضو",
  "category.create": "إضافة فئة",
  "category.update": "تعديل فئة",
  "category.delete": "حذف فئة",
  "product.create": "إضافة منتج",
  "product.update": "تعديل منتج",
  "product.delete": "حذف منتج",
  "product.variants_update": "تعديل خيارات منتج",
  "inventory.add": "إضافة مخزون",
  "inventory.delete": "حذف عنصر مخزون",
  "inventory.reveal": "إظهار كود/بيانات حساب",
  "order.deliver_manual": "تسليم يدوي",
  "order.retry_delivery": "إعادة التسليم التلقائي",
  "order.reveal_note": "إظهار نص تسليم",
  "order.refund": "استرجاع طلب",
  "order.refund_unrecorded": "استرجاع غير مسجّل في الطلب",
  "coupon.create": "إضافة كوبون",
  "coupon.update": "تعديل كوبون",
  "coupon.delete": "حذف كوبون",
  "coupon.activate": "تفعيل كوبون",
  "coupon.deactivate": "إيقاف كوبون",
  "review.approve": "قبول تقييم",
  "review.reject": "رفض تقييم",
  "review.delete": "حذف تقييم",
  "wallet.adjust": "تعديل رصيد محفظة",
};

const PREFIXES = ["auth.", "account.", "team.", "order.", "product.", "category.", "inventory.", "coupon.", "review.", "wallet."];

// Sensitive or security-relevant actions get a coloured badge
function actionTone(action: string) {
  if (action === "inventory.reveal" || action === "order.reveal_note") return "bg-fuchsia/15 text-fuchsia ring-1 ring-fuchsia/30";
  if (action.endsWith("_failed") || action.endsWith("_unrecorded") || action.endsWith(".delete") || action === "team.remove") {
    return "bg-danger/15 text-danger ring-1 ring-danger/30";
  }
  if (action.startsWith("auth.") || action.startsWith("account.") || action.startsWith("team.")) return "bg-volt/10 text-volt ring-1 ring-volt/25";
  return "bg-surface-2 text-text ring-1 ring-border";
}

/** "YYYY-MM-DD" in the server's time zone (same convention as the dashboard, see _lib/dates.ts). */
function parseDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || d.getDate() !== Number(m[3]) ? null : d;
}

function detailsRecord(details: Prisma.JsonValue): Prisma.JsonObject | null {
  return details && typeof details === "object" && !Array.isArray(details) ? details : null;
}

function targetHref(type: string | null, id: string | null, details: Prisma.JsonValue): string | null {
  if (!type || !id) return null;
  switch (type) {
    case "order":
      return `/admin/orders/${id}`;
    case "product":
      return `/admin/products/${id}`;
    case "category":
      return `/admin/categories/${id}`;
    case "admin":
      return "/admin/team";
    case "coupon":
      return `/admin/coupons/${id}`;
    case "review":
      return "/admin/reviews";
    case "inventory": {
      const productId = detailsRecord(details)?.productId;
      return typeof productId === "string" ? `/admin/products/${productId}/inventory` : null;
    }
    default:
      return null;
  }
}

const targetLabel: Record<string, string> = {
  order: "طلب",
  product: "منتج",
  category: "فئة",
  admin: "عضو",
  inventory: "مخزون",
  coupon: "كوبون",
  review: "تقييم",
  customer: "عميل",
};

function Details({ value }: { value: Prisma.JsonValue }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  const compact = JSON.stringify(value);
  if (compact.length <= 90) {
    return (
      <code dir="ltr" className="block break-all text-start font-mono text-[11px] text-muted">
        {compact}
      </code>
    );
  }
  return (
    <details dir="ltr" className="text-start">
      <summary className="cursor-pointer break-all font-mono text-[11px] text-muted hover:text-text">{compact.slice(0, 90)}…</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-[11px] text-text">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminAccess("SUPER_ADMIN");
  const sp = await searchParams;
  const adminFilter = firstParam(sp.admin).toLowerCase();
  const actionRaw = firstParam(sp.action).toLowerCase();
  const actionFilter = /^[a-z0-9_.-]{1,64}$/.test(actionRaw) ? actionRaw : "";
  const fromRaw = firstParam(sp.from);
  const toRaw = firstParam(sp.to);
  const from = parseDay(fromRaw);
  const to = parseDay(toRaw);
  const page = pageParam(sp.page);

  const where: Prisma.AuditLogWhereInput = {
    ...(adminFilter && { adminEmail: adminFilter }),
    ...(actionFilter && { action: { startsWith: actionFilter } }),
    ...((from || to) && { createdAt: { ...(from && { gte: from }), ...(to && { lt: addDays(to, 1) }) } }),
  };

  const [total, rows, admins] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        adminEmail: true,
        action: true,
        targetType: true,
        targetId: true,
        details: true,
        ip: true,
        createdAt: true,
        admin: { select: { name: true } },
      },
    }),
    prisma.admin.findMany({ orderBy: { name: "asc" }, select: { name: true, email: true } }),
  ]);

  const filtered = Boolean(adminFilter || actionFilter || from || to);
  const params = {
    admin: adminFilter || undefined,
    action: actionFilter || undefined,
    from: from ? fromRaw : undefined,
    to: to ? toRaw : undefined,
  };
  const prefixHref = (prefix: string) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, action: prefix })) if (v) qs.set(k, v);
    return `/admin/audit?${qs.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="سجل النشاط"
        description="كل ما يفعله أعضاء الفريق في لوحة التحكم، الأحدث أولاً. لا يُسجَّل فيه أي كود أو كلمة مرور."
      />

      <form method="get" className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_auto_auto_auto]" role="search">
        <div>
          <label htmlFor="f-admin" className="label">
            العضو
          </label>
          <select id="f-admin" name="admin" defaultValue={adminFilter} className="input">
            <option value="">الكل</option>
            {admins.map((a) => (
              <option key={a.email} value={a.email}>
                {a.name} — {a.email}
              </option>
            ))}
            <option value={SYSTEM}>النظام / غير مسجّل الدخول</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-action" className="label">
            الإجراء (يبدأ بـ)
          </label>
          <input
            id="f-action"
            name="action"
            defaultValue={actionFilter}
            list="audit-prefixes"
            dir="ltr"
            placeholder="order."
            maxLength={64}
            className="input text-start font-mono"
          />
          <datalist id="audit-prefixes">
            {PREFIXES.map((p) => (
              <option key={p} value={p} />
            ))}
            {Object.keys(actionLabel).map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="f-from" className="label">
            من تاريخ
          </label>
          <input id="f-from" name="from" type="date" defaultValue={from ? fromRaw : ""} className="input" dir="ltr" />
        </div>
        <div>
          <label htmlFor="f-to" className="label">
            إلى تاريخ
          </label>
          <input id="f-to" name="to" type="date" defaultValue={to ? toRaw : ""} className="input" dir="ltr" />
        </div>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-ghost">
            تصفية
          </button>
          {filtered && (
            <Link href="/admin/audit" className="btn text-muted hover:text-text">
              مسح
            </Link>
          )}
        </div>
      </form>

      <nav aria-label="تصفية سريعة حسب النوع" className="mb-4 flex flex-wrap gap-1.5">
        {PREFIXES.slice(0, 7).map((p) => (
          <Link
            key={p}
            href={prefixHref(p)}
            aria-current={actionFilter === p ? "page" : undefined}
            className={`rounded-full px-3 py-1 font-mono text-xs transition-colors ${
              actionFilter === p ? "bg-volt text-bg" : "bg-surface-2 text-muted ring-1 ring-border hover:text-text"
            }`}
            dir="ltr"
          >
            {p}
          </Link>
        ))}
      </nav>

      <section className="card overflow-hidden" aria-label="سجل النشاط">
        {rows.length === 0 ? (
          <EmptyState title={filtered ? "لا توجد سجلات مطابقة" : "لا يوجد نشاط مسجّل بعد"} body={filtered ? "غيّر عوامل التصفية أو امسحها." : undefined} />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>الوقت</th>
                <th>العضو</th>
                <th>الإجراء</th>
                <th>الهدف</th>
                <th>التفاصيل</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = targetHref(r.targetType, r.targetId, r.details);
                const target = r.targetType ? (
                  <>
                    <span className="text-muted">{targetLabel[r.targetType] ?? r.targetType}</span>{" "}
                    {r.targetId && (
                      <span className="font-display" dir="ltr">
                        #{shortId(r.targetId)}
                      </span>
                    )}
                  </>
                ) : null;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="whitespace-nowrap text-xs text-muted" title={r.createdAt.toISOString()}>
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="max-w-52">
                      {r.adminEmail === SYSTEM ? (
                        <span className="text-xs text-muted">النظام</span>
                      ) : (
                        <>
                          {r.admin?.name && <span className="block truncate text-sm">{r.admin.name}</span>}
                          <span className="block truncate text-end text-xs text-muted" dir="ltr">
                            {r.adminEmail}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <span className={`badge whitespace-nowrap ${actionTone(r.action)}`}>{actionLabel[r.action] ?? r.action}</span>
                      <code dir="ltr" className="mt-1 block text-start font-mono text-[10px] text-muted">
                        {r.action}
                      </code>
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {target ? (
                        href ? (
                          <Link href={href} className="hover:text-volt" title={r.targetId ?? undefined}>
                            {target}
                          </Link>
                        ) : (
                          <span title={r.targetId ?? undefined}>{target}</span>
                        )
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="max-w-80 min-w-48">
                      <Details value={r.details} />
                    </td>
                    <td className="whitespace-nowrap font-mono text-[11px] text-muted" dir="ltr">
                      {r.ip ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        <Pagination pathname="/admin/audit" params={params} page={page} pageSize={PAGE_SIZE} total={total} />
      </section>
    </>
  );
}
