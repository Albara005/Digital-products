import type { Metadata } from "next";
import { IconArrow, IconChat, IconClock, IconHeadset, IconMail } from "@/components/store/icons";
import Link from "@/components/store/link";
import { SUPPORT_EMAIL, WHATSAPP_URL } from "@/components/store/site";
import { PageHeader } from "@/components/store/ui";
import type { Locale } from "@/i18n/config";
import { alternates } from "@/i18n/metadata";
import { getLocale } from "@/i18n/server";

type ContactCopy = {
  title: string;
  metaDescription: string;
  description: string;
  whatsapp: string;
  whatsappText: string;
  whatsappCta: string;
  email: string;
  emailCta: string;
  ticket: string;
  ticketText: string;
  ticketCta: string;
  hours: string;
  hoursText: string;
  before: string;
  beforeText: string;
  faq: string;
};

const copy: Record<Locale, ContactCopy> = {
  ar: {
    title: "تواصل معنا",
    metaDescription: "فريق دعم Nitro Store متاح على مدار الساعة عبر البريد الإلكتروني وواتساب.",
    description: "فريقنا جاهز لمساعدتك في أي وقت. لتسريع الرد، اذكر رقم الطلب والبريد الذي استخدمته عند الشراء.",
    whatsapp: "واتساب",
    whatsappText: "الأسرع للرد على استفسارات الطلبات.",
    whatsappCta: "ابدأ المحادثة",
    email: "البريد الإلكتروني",
    emailCta: "أرسل رسالة",
    ticket: "تذكرة دعم",
    ticketText: "مشكلة في طلب؟ افتح تذكرة واختر الطلب المعني، وتابع ردودنا من حسابك أو من رابط خاص يصلك بالبريد.",
    ticketCta: "تواصل مع الدعم بخصوص طلب",
    hours: "أوقات الدعم",
    hoursText: "على مدار الساعة طوال أيام الأسبوع. نرد عادةً خلال دقائق.",
    before: "قبل التواصل",
    beforeText: "قد تجد إجابتك أسرع في",
    faq: "الأسئلة الشائعة",
  },
  en: {
    title: "Contact us",
    metaDescription: "The Nitro Store support team is available around the clock by email and WhatsApp.",
    description: "Our team is ready to help any time. To speed things up, include your order number and the email you used at checkout.",
    whatsapp: "WhatsApp",
    whatsappText: "The fastest way to get answers about your orders.",
    whatsappCta: "Start a chat",
    email: "Email",
    emailCta: "Send a message",
    ticket: "Support ticket",
    ticketText: "Problem with an order? Open a ticket, pick the order, and follow our replies from your account or a private link we email you.",
    ticketCta: "Contact support about an order",
    hours: "Support hours",
    hoursText: "24/7, every day of the week. We usually reply within minutes.",
    before: "Before you get in touch",
    beforeText: "You might find your answer faster in our",
    faq: "FAQ",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()];
  return { title: c.title, description: c.metaDescription, alternates: await alternates("/contact") };
}

export default async function ContactPage() {
  return <ContactContent c={copy[await getLocale()]} />;
}

function ContactContent({ c }: { c: ContactCopy }) {
  const channels = [
    {
      icon: IconChat,
      title: c.whatsapp,
      text: c.whatsappText,
      textDir: undefined,
      cta: c.whatsappCta,
      href: WHATSAPP_URL,
      external: true,
      primary: true,
    },
    {
      icon: IconMail,
      title: c.email,
      text: SUPPORT_EMAIL,
      textDir: "ltr" as const,
      cta: c.emailCta,
      href: `mailto:${SUPPORT_EMAIL}`,
      external: false,
      primary: false,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Contact"
        title={c.title}
        description={c.description}
      />
      <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
        <section className="card mb-4 flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-volt/20">
              <IconHeadset className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold">{c.ticket}</h2>
              <p className="mt-1 text-sm leading-7 text-muted">{c.ticketText}</p>
            </div>
          </div>
          <Link href="/support" className="btn-primary shrink-0 self-start sm:self-center">
            {c.ticketCta}
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
              <p className="font-bold">{c.hours}</p>
              <p className="mt-1 text-sm leading-7 text-muted">{c.hoursText}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-5">
            <IconArrow className="mt-0.5 size-5 shrink-0 text-volt" />
            <div>
              <p className="font-bold">{c.before}</p>
              <p className="mt-1 text-sm leading-7 text-muted">
                {c.beforeText} <Link href="/faq" className="text-text underline decoration-volt underline-offset-4">{c.faq}</Link>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
