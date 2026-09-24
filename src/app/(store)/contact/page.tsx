import type { Metadata } from "next";
import Link from "next/link";
import { IconArrow, IconChat, IconClock, IconHeadset, IconMail } from "@/components/store/icons";
import { SUPPORT_EMAIL, WHATSAPP_URL } from "@/components/store/site";
import { PageHeader } from "@/components/store/ui";

export const metadata: Metadata = {
  title: "تواصل معنا",
  description: "فريق دعم Nitro Store متاح على مدار الساعة عبر البريد الإلكتروني وواتساب.",
};

export default function ContactPage() {
  const channels = [
    {
      icon: IconChat,
      title: "واتساب",
      text: "الأسرع للرد على استفسارات الطلبات.",
      textDir: undefined,
      cta: "ابدأ المحادثة",
      href: WHATSAPP_URL,
      external: true,
      primary: true,
    },
    {
      icon: IconMail,
      title: "البريد الإلكتروني",
      text: SUPPORT_EMAIL,
      textDir: "ltr" as const,
      cta: "أرسل رسالة",
      href: `mailto:${SUPPORT_EMAIL}`,
      external: false,
      primary: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title="تواصل معنا"
        description="فريقنا جاهز لمساعدتك في أي وقت. لتسريع الرد، اذكر رقم الطلب والبريد الذي استخدمته عند الشراء."
      />
      <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
        <section className="card mb-4 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-volt/20">
              <IconHeadset className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold">تذكرة دعم</h2>
              <p className="mt-1 text-sm leading-7 text-muted">
                مشكلة في طلب؟ افتح تذكرة واختر الطلب المعني، وتابع ردودنا من حسابك أو من رابط خاص يصلك بالبريد.
              </p>
            </div>
          </div>
          <Link href="/support" className="btn-primary shrink-0 self-start sm:self-center">
            تواصل مع الدعم بخصوص طلب
            <IconArrow className="size-4" />
          </Link>
        </section>
        <ul className="grid gap-4 sm:grid-cols-2">
          {channels.map(({ icon: Icon, title, text, textDir, cta, href, external, primary }) => (
            <li key={title} className="card flex flex-col p-6">
              <span className="grid size-12 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-volt/20">
                <Icon className="size-6" />
              </span>
              <h2 className="mt-5 text-lg font-bold">{title}</h2>
              <p className="mt-1 text-sm text-muted">
                <span dir={textDir}>{text}</span>
              </p>
              <a
                href={href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`${primary ? "btn-primary" : "btn-ghost"} mt-6 self-start`}
              >
                {cta}
                <IconArrow className="size-4" />
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-xl border border-border p-5">
            <IconClock className="mt-0.5 size-5 shrink-0 text-volt" />
            <div>
              <p className="font-bold">أوقات الدعم</p>
              <p className="mt-1 text-sm leading-7 text-muted">على مدار الساعة طوال أيام الأسبوع. نرد عادةً خلال دقائق.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-5">
            <IconArrow className="mt-0.5 size-5 shrink-0 text-volt" />
            <div>
              <p className="font-bold">قبل التواصل</p>
              <p className="mt-1 text-sm leading-7 text-muted">
                قد تجد إجابتك أسرع في <Link href="/faq" className="text-text underline decoration-volt underline-offset-4">الأسئلة الشائعة</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
