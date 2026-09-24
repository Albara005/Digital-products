import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSettings } from "@/lib/settings";
import { CurrencySettingsForm, ReferralSettingsForm, StoreSettingsForm } from "@/components/admin/settings/SettingsForms";
import { CheckIcon } from "@/components/admin/icons";
import { PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { getAdminMoney } from "../../_lib/money";
import { saveCurrencySettings, saveReferralSettings, saveStoreSettings } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "الإعدادات" };

const has = (name: string) => Boolean(process.env[name]?.trim());

type Integration = { name: string; on: boolean; description: string; warning?: string };

/** Only whether each variable is set is read here; values never leave the server. */
function integrations(): Integration[] {
  const stripe = has("STRIPE_SECRET_KEY");
  return [
    {
      name: "Stripe",
      on: stripe,
      description: "الدفع بالبطاقات الدولية (STRIPE_SECRET_KEY).",
      warning: stripe && !has("STRIPE_WEBHOOK_SECRET") ? "STRIPE_WEBHOOK_SECRET غير مضبوط: لن تُؤكَّد المدفوعات تلقائياً." : undefined,
    },
    { name: "Tap", on: has("TAP_SECRET_KEY"), description: "مدى وKNET وApple Pay والبطاقات الخليجية (TAP_SECRET_KEY)." },
    { name: "Resend", on: has("RESEND_API_KEY"), description: "إرسال رسائل التسليم ورموز الدخول بالبريد (RESEND_API_KEY)." },
    {
      name: "Telegram",
      on: has("TELEGRAM_BOT_TOKEN") && has("TELEGRAM_CHAT_ID"),
      description: "تنبيهات فورية للمالك (TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID).",
    },
    {
      name: "التحقق بخطوتين إلزامي",
      on: process.env.REQUIRE_ADMIN_2FA === "true",
      description: "يُلزم كل أعضاء الفريق بتفعيل التحقق بخطوتين (REQUIRE_ADMIN_2FA).",
    },
  ];
}

function Section({ id, title, description, children }: { id: string; title: string; description: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-5" aria-labelledby={id}>
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      <div className="mt-1 text-sm leading-relaxed text-muted">{description}</div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  await requireAdminAccess("SUPER_ADMIN");
  const [settings, money] = await Promise.all([getSettings(), getAdminMoney()]);
  // Referral amounts are stored in USD cents and edited in the admin currency
  const dollars = money.toInput;
  const { referral, store, currencies } = settings;
  const list = integrations();
  const gatewayOn = list.slice(0, 2).some((i) => i.on);

  return (
    <>
      <PageHeader title="الإعدادات" description="إعدادات المتجر التي يمكن تغييرها دون إعادة نشر. كل تغيير يُسجَّل في سجل النشاط." />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-6">
          <Section
            id="referral-title"
            title="برنامج الدعوة"
            description={
              <>
                لكل عميل رابط دعوة خاص. عندما يُتمّ عميل مدعوّ <strong className="text-text">أول طلب مدفوع</strong> له، يحصل صاحب
                الدعوة على مكافأة تُضاف إلى رصيد محفظته. المكافأة مرة واحدة لكل عميل مدعو.
              </>
            }
          >
            <ReferralSettingsForm
              action={saveReferralSettings}
              fx={money.fx}
              values={{
                enabled: referral.enabled,
                rewardType: referral.rewardType,
                rewardValue: referral.rewardType === "PERCENT" ? String(referral.rewardValue) : dollars(referral.rewardValue),
                maxReward: referral.maxRewardCents === null ? "" : dollars(referral.maxRewardCents),
                minOrder: dollars(referral.minOrderCents),
              }}
            />
          </Section>

          <Section id="store-title" title="المتجر" description="تنبيهات تشغيلية عامة.">
            <StoreSettingsForm action={saveStoreSettings} lowStockThreshold={store.lowStockThreshold} />
          </Section>

          <Section
            id="currencies-title"
            title="العملات"
            description="تُحدَّد عملة العميل تلقائياً حسب بلده ويمكنه تغييرها من رأس المتجر. تُستخدم أسعار الصرف هنا للأسعار المعروضة وللمبالغ المدفوعة فعلياً."
          >
            <CurrencySettingsForm action={saveCurrencySettings} enabled={currencies.enabled} rates={currencies.rates} />
          </Section>
        </div>

        <Section
          id="integrations-title"
          title="التكاملات"
          description="تُضبط من متغيّرات البيئة على الخادم (للقراءة فقط). لا تُعرض المفاتيح هنا أبداً."
        >
          <ul className="flex flex-col divide-y divide-border">
            {list.map((i) => (
              <li key={i.name} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{i.name}</p>
                  <p className="text-xs leading-relaxed text-muted">{i.description}</p>
                  {i.warning && <p className="mt-1 text-xs text-fuchsia">{i.warning}</p>}
                </div>
                {i.on ? (
                  <span className="badge shrink-0 gap-1 bg-success/15 text-success ring-1 ring-success/30">
                    <CheckIcon className="size-3" />
                    مفعّل
                  </span>
                ) : (
                  <span className="badge shrink-0 bg-surface-2 text-muted ring-1 ring-border">غير مفعّل</span>
                )}
              </li>
            ))}
          </ul>
          {!gatewayOn && (
            <p className="mt-4 rounded-lg bg-fuchsia/10 px-3 py-2 text-xs leading-relaxed text-text">
              لا توجد بوابة دفع مفعّلة. خارج بيئة الإنتاج تُعتبر الطلبات مدفوعة فوراً (وضع التطوير)، وفي الإنتاج لا يمكن الدفع.
            </p>
          )}
        </Section>
      </div>
    </>
  );
}
