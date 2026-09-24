import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";
import { totpUri } from "@/lib/totp";
import { AccountNameForm, ChangePasswordForm, PasswordAndCodeForm } from "@/components/admin/AccountForms";
import { ActionButton } from "@/components/admin/ActionButton";
import { CopyButton } from "@/components/admin/CopyButton";
import { CheckIcon, LogoutIcon, ShieldIcon } from "@/components/admin/icons";
import { Callout, PageHeader } from "@/components/admin/ui";
import { isTwoFactorRequired, requireAdminAccess } from "../../_lib/guard";
import { RECOVERY_CODE_COUNT, countUnusedRecoveryCodes, readTotpSecret } from "../../_lib/two-factor";
import {
  cancelTotpSetup,
  changeOwnPassword,
  confirmTotpSetup,
  disableOwnTotp,
  regenerateRecoveryCodes,
  revokeOtherSessions,
  startTotpSetup,
  updateOwnName,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "حسابي والأمان" };

const roleLabel = { SUPER_ADMIN: "مدير عام", STAFF: "موظف" } as const;

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="card p-5" aria-labelledby={id}>
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AccountPage({ searchParams }: PageProps<"/admin/account">) {
  // Reachable without 2FA even when REQUIRE_ADMIN_2FA=true: this is where it gets enabled.
  const session = await requireAdminAccess(undefined, { allowWithoutTwoFactor: true });

  const admin = await prisma.admin.findUnique({
    where: { id: session.adminId },
    select: { email: true, name: true, role: true, createdAt: true, passwordChangedAt: true, totpSecret: true, totpEnabledAt: true },
  });
  if (!admin) notFound();
  const { recoveryUsed } = await searchParams;
  const recoveryLeft = admin.totpEnabledAt ? await countUnusedRecoveryCodes(session.adminId) : 0;

  // Setup in progress: the secret exists but no code has confirmed it yet. Shown only in this state.
  let setup: { secret: string; qr: string } | null = null;
  if (!admin.totpEnabledAt && admin.totpSecret) {
    const secret = readTotpSecret(admin.totpSecret);
    if (secret) {
      const qr = await QRCode.toDataURL(totpUri(secret, admin.email), {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 208,
        color: { dark: "#0a0a0a", light: "#ffffff" },
      });
      setup = { secret, qr };
    }
  }
  const required = isTwoFactorRequired();

  return (
    <>
      <PageHeader title="حسابي والأمان" description="بيانات دخولك إلى لوحة التحكم وطرق حمايتها." />

      {!admin.totpEnabledAt && required && (
        <div className="mb-6">
          <Callout tone="warn">
            <strong>التحقق بخطوتين إلزامي لأعضاء الفريق.</strong> فعّله أدناه لمتابعة استخدام لوحة التحكم.
          </Callout>
        </div>
      )}

      {recoveryUsed && admin.totpEnabledAt && (
        <div className="mb-6">
          <Callout tone={recoveryLeft <= 3 ? "warn" : "info"}>
            دخلت برمز استرداد، ولم يعد صالحاً. تبقّى لك <strong>{recoveryLeft}</strong> من {RECOVERY_CODE_COUNT}.
            {recoveryLeft <= 3 && " أنشئ رموزاً جديدة من قسم «رموز الاسترداد» أدناه."}
          </Callout>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Section id="profile-title" title="الملف الشخصي">
            <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">البريد</dt>
              <dd className="min-w-0 break-all text-end" dir="ltr">
                {admin.email}
              </dd>
              <dt className="text-muted">الصلاحية</dt>
              <dd className="text-end">
                <span
                  className={`badge ${
                    admin.role === "SUPER_ADMIN" ? "bg-fuchsia/15 text-fuchsia" : "bg-surface-2 text-muted ring-1 ring-border"
                  }`}
                >
                  {roleLabel[admin.role]}
                </span>
              </dd>
              <dt className="text-muted">عضو منذ</dt>
              <dd className="text-end">{formatDate(admin.createdAt)}</dd>
            </dl>
            <AccountNameForm action={updateOwnName} name={admin.name} />
            <p className="mt-3 text-xs text-muted">لتغيير البريد أو الصلاحية تواصل مع المدير العام.</p>
          </Section>

          <Section
            id="password-title"
            title="كلمة المرور"
            description={
              admin.passwordChangedAt
                ? `آخر تغيير: ${formatDate(admin.passwordChangedAt)}. تغييرها يسجّل خروج كل الأجهزة الأخرى.`
                : "تغييرها يسجّل خروج كل الأجهزة الأخرى، وتبقى متصلاً على هذا الجهاز."
            }
          >
            <ChangePasswordForm action={changeOwnPassword} />
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section
            id="totp-title"
            title="التحقق بخطوتين"
            description="رمز من 6 أرقام من تطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 1Password…) يُطلب بعد كلمة المرور."
          >
            {admin.totpEnabledAt ? (
              <div className="flex flex-col gap-4">
                <p className="flex items-center gap-2 text-sm">
                  <span className="badge gap-1 bg-success/15 text-success ring-1 ring-success/30">
                    <CheckIcon className="size-3" />
                    مفعّل
                  </span>
                  <span className="text-muted">منذ {formatDate(admin.totpEnabledAt)}</span>
                </p>
                <div className="rounded-lg border border-border px-4 py-3">
                  <p className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">رموز الاسترداد</span>
                    <span
                      className={`badge ${
                        recoveryLeft === 0
                          ? "bg-danger/15 text-danger ring-1 ring-danger/30"
                          : recoveryLeft <= 3
                            ? "bg-fuchsia/15 text-fuchsia ring-1 ring-fuchsia/30"
                            : "bg-surface-2 text-muted ring-1 ring-border"
                      }`}
                    >
                      <span className="font-display">{recoveryLeft}</span>&nbsp;متبقٍّ من {RECOVERY_CODE_COUNT}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {recoveryLeft === 0
                      ? "لا توجد رموز صالحة: إن فقدت هاتفك لن تتمكن من الدخول. أنشئ رموزاً الآن."
                      : "تُستخدم بدل رمز التطبيق إن فقدت هاتفك، وكل رمز مرة واحدة."}
                  </p>
                  <details className="mt-3 border-t border-border pt-3" open={recoveryLeft === 0 ? true : undefined}>
                    <summary className="cursor-pointer select-none text-sm font-medium text-muted hover:text-text">
                      إنشاء رموز جديدة
                    </summary>
                    <div className="pt-4">
                      <p className="mb-4 text-xs leading-relaxed text-muted">
                        تتوقف كل الرموز السابقة فوراً. أدخل رمزاً من التطبيق وكلمة المرور للتأكيد.
                      </p>
                      <PasswordAndCodeForm
                        action={regenerateRecoveryCodes}
                        idPrefix="recovery"
                        submitLabel="إنشاء رموز جديدة"
                        pendingLabel="جارٍ الإنشاء…"
                        email={admin.email}
                      />
                    </div>
                  </details>
                </div>
                <details className="group rounded-lg border border-border">
                  <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-muted hover:text-text">
                    تعطيل التحقق بخطوتين
                  </summary>
                  <div className="border-t border-border px-4 py-4">
                    <p className="mb-4 text-xs leading-relaxed text-muted">
                      يصبح حسابك محمياً بكلمة المرور وحدها وتُحذف رموز الاسترداد. أدخل رمزاً من التطبيق وكلمة المرور للتأكيد.
                    </p>
                    <PasswordAndCodeForm
                      action={disableOwnTotp}
                      idPrefix="totp-off"
                      submitLabel="تعطيل التحقق بخطوتين"
                      pendingLabel="جارٍ التعطيل…"
                      danger
                    />
                  </div>
                </details>
              </div>
            ) : setup ? (
              <div className="flex flex-col gap-5">
                <ol className="flex flex-col gap-4 text-sm">
                  <li>
                    <p className="mb-3 font-medium">١. امسح الرمز بتطبيق المصادقة</p>
                    <div className="flex flex-wrap items-start gap-4">
                      {/* Data URL generated on the server; next/image adds nothing for it */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={setup.qr}
                        alt="رمز QR لإضافة الحساب إلى تطبيق المصادقة"
                        width={208}
                        height={208}
                        className="size-52 rounded-lg bg-white p-1 ring-1 ring-border"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="mb-2 text-xs text-muted">أو أدخل المفتاح يدوياً (نوع: حسب الوقت):</p>
                        {/* Lowercase so "o" can't be misread as "0" (base32 has no 0/1); apps accept either case */}
                        <p
                          dir="ltr"
                          className="mb-2 break-all rounded-md border border-border bg-bg px-3 py-2 text-start font-mono text-sm tracking-wider"
                        >
                          {setup.secret.toLowerCase().match(/.{1,4}/g)?.join(" ")}
                        </p>
                        <CopyButton text={setup.secret} label="نسخ المفتاح" />
                      </div>
                    </div>
                  </li>
                  <li>
                    <p className="mb-3 font-medium">٢. أدخل الرمز الظاهر في التطبيق مع كلمة المرور</p>
                    <PasswordAndCodeForm
                      action={confirmTotpSetup}
                      email={admin.email}
                      idPrefix="totp-on"
                      submitLabel="تأكيد وتفعيل"
                      pendingLabel="جارٍ التحقق…"
                    />
                  </li>
                </ol>
                <div className="border-t border-border pt-4">
                  <ActionButton action={cancelTotpSetup} fields={{}} variant="subtle" showSuccess={false}>
                    إلغاء الإعداد
                  </ActionButton>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <p className="flex items-center gap-2 text-sm">
                  <span className="badge bg-surface-2 text-muted ring-1 ring-border">غير مفعّل</span>
                  <span className="text-muted">كلمة المرور وحدها تحمي حسابك الآن.</span>
                </p>
                <ActionButton action={startTotpSetup} fields={{}} variant="primary" pendingLabel="جارٍ الإعداد…" showSuccess={false}>
                  <ShieldIcon className="size-3.5" />
                  تفعيل التحقق بخطوتين
                </ActionButton>
              </div>
            )}
          </Section>

          <Section
            id="sessions-title"
            title="الأجهزة المتصلة"
            description={`بدأت جلستك الحالية ${formatDate(new Date(session.issuedAtMs))}. تنتهي كل جلسة تلقائياً بعد 12 ساعة.`}
          >
            <ActionButton
              action={revokeOtherSessions}
              fields={{}}
              variant="danger"
              confirm={{
                title: "تسجيل الخروج من كل الأجهزة الأخرى؟",
                body: "ستنتهي كل جلساتك المفتوحة على أجهزة ومتصفحات أخرى فوراً، وتبقى متصلاً على هذا الجهاز.",
                confirmLabel: "تسجيل الخروج منها",
              }}
            >
              <LogoutIcon className="size-3.5 rtl:-scale-x-100" />
              تسجيل الخروج من كل الأجهزة الأخرى
            </ActionButton>
          </Section>
        </div>
      </div>
    </>
  );
}
