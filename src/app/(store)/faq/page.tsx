import type { Metadata } from "next";
import { IconChevronDown } from "@/components/store/icons";
import Link from "@/components/store/link";
import { PageHeader } from "@/components/store/ui";
import { type Locale } from "@/i18n/config";
import { alternates } from "@/i18n/metadata";
import { getLocale } from "@/i18n/server";

type FaqGroup = { title: string; items: { q: string; a: React.ReactNode }[] };

const arGroups: FaqGroup[] = [
  {
    title: "التسليم",
    items: [
      {
        q: "متى أستلم طلبي؟",
        a: "البطاقات والاشتراكات والحسابات المتوفرة في المخزون تُسلَّم تلقائياً خلال ثوانٍ من تأكيد الدفع، وتظهر مباشرة على صفحة طلبك. الخدمات تُنفَّذ يدوياً من فريقنا، وعادةً خلال ساعات قليلة، وستتحدّث صفحة الطلب فور الانتهاء.",
      },
      {
        q: "أين أجد الكود بعد الشراء؟",
        a: "بعد الدفع تنتقل تلقائياً إلى صفحة طلبك الخاصة، وفيها الأكواد وبيانات الحسابات مع زر نسخ. نرسل رابط هذه الصفحة أيضاً إلى بريدك الإلكتروني، فاحفظه في مكان آمن ولا تشاركه مع أحد.",
      },
      {
        q: "دفعت ولم يظهر الكود، ماذا أفعل؟",
        a: "انتظر دقيقة؛ فصفحة الطلب تتحدّث تلقائياً فور تأكيد الدفع. إن بقي الطلب «قيد التجهيز» لفترة أطول فهذا يعني أننا نجهّزه يدوياً وسيصلك قريباً. تحقّق أيضاً من مجلد الرسائل غير المرغوب فيها، وإن احتجت مساعدة تواصل معنا مع ذكر رقم الطلب.",
      },
      {
        q: "هل أحتاج إلى إنشاء حساب في المتجر؟",
        a: "لا. يكفي بريدك الإلكتروني عند إتمام الطلب لنرسل لك رابط صفحة الطلب.",
      },
    ],
  },
  {
    title: "الدفع",
    items: [
      {
        q: "ما طرق الدفع المتاحة؟",
        a: "ندعم البطاقات البنكية ووسائل الدفع الظاهرة في صفحة الدفع الآمنة. تتم العملية عبر بوابة دفع معتمدة ومشفّرة، ولا نطّلع على بيانات بطاقتك ولا نخزّنها.",
      },
      {
        q: "بأي عملة تُعرض الأسعار؟",
        a: "تُعرض الأسعار ويتم الدفع بالعملة المختارة أعلى الصفحة (تُحدَّد تلقائياً حسب بلدك، أو بالدولار الأمريكي افتراضياً). المبلغ الظاهر عند الدفع هو المبلغ المخصوم بالضبط، وقد يطبّق بنكك رسومه الخاصة.",
      },
    ],
  },
  {
    title: "الحسابات والضمان",
    items: [
      {
        q: "هل الحسابات مضمونة؟",
        a: "نعم. لكل حساب مدة ضمان موضّحة في صفحة المنتج تبدأ من لحظة التسليم. إن لم يعمل الحساب كما هو موصوف خلال مدة الضمان نستبدله أو نعيد لك المبلغ.",
      },
      {
        q: "ما الذي لا يشمله الضمان؟",
        a: "لا يشمل الضمان المشاكل الناتجة عن مخالفة تعليمات الاستخدام المرفقة، أو مشاركة الحساب، أو مخالفة شروط المنصة المالكة للحساب.",
      },
    ],
  },
  {
    title: "الاسترجاع",
    items: [
      {
        q: "هل يمكنني استرجاع المبلغ؟",
        a: (
          <>
            الأكواد الرقمية غير قابلة للاسترجاع بعد عرضها، لأنها تصبح قابلة للاستخدام فوراً. توجد استثناءات مثل الكود
            غير الصالح عند التسليم أو الحساب المعطّل خلال مدة الضمان. التفاصيل في{" "}
            <Link href="/refund-policy">سياسة الاسترجاع</Link>.
          </>
        ),
      },
      {
        q: "هل تعمل البطاقات في منطقتي؟",
        a: "بعض البطاقات مخصّصة لمنطقة أو متجر محدد. راجع وصف المنتج قبل الشراء، ولا يمكن استرجاع كود اشتُري لمنطقة غير مناسبة بعد عرضه.",
      },
    ],
  },
];

const enGroups: FaqGroup[] = [
  {
    title: "Delivery",
    items: [
      {
        q: "When will I receive my order?",
        a: "Gift cards, subscriptions and accounts that are in stock are delivered automatically within seconds of payment being confirmed, and appear right away on your order page. Services are carried out manually by our team, usually within a few hours, and your order page updates as soon as they're done.",
      },
      {
        q: "Where do I find my code after purchase?",
        a: "After payment you're taken straight to your private order page, which shows your codes and account details with a copy button. We also email you a link to this page — keep it somewhere safe and don't share it with anyone.",
      },
      {
        q: "I paid but my code hasn't appeared. What should I do?",
        a: "Give it a minute — the order page refreshes automatically as soon as payment is confirmed. If the order stays “Processing” for longer, we're preparing it manually and it will arrive shortly. Check your spam folder too, and if you need help, contact us with your order number.",
      },
      {
        q: "Do I need to create an account?",
        a: "No. Your email address at checkout is all we need to send you the link to your order page.",
      },
    ],
  },
  {
    title: "Payment",
    items: [
      {
        q: "Which payment methods do you accept?",
        a: "We accept bank cards and the payment methods shown on our secure checkout page. Payments go through a certified, encrypted payment gateway — we never see or store your card details.",
      },
      {
        q: "What currency are prices shown in?",
        a: "Prices are shown and charged in the currency selected at the top of the page (detected from your country, or US dollars by default). The amount you see at checkout is exactly the amount charged; your bank may apply its own fees.",
      },
    ],
  },
  {
    title: "Accounts & warranty",
    items: [
      {
        q: "Are the accounts guaranteed?",
        a: "Yes. Every account comes with a warranty period shown on its product page, starting from delivery. If an account doesn't work as described during the warranty, we replace it or refund you.",
      },
      {
        q: "What isn't covered by the warranty?",
        a: "The warranty doesn't cover problems caused by not following the usage instructions provided, sharing the account, or breaking the terms of the platform that owns the account.",
      },
    ],
  },
  {
    title: "Refunds",
    items: [
      {
        q: "Can I get a refund?",
        a: (
          <>
            Digital codes can&apos;t be refunded once they&apos;ve been revealed, because they become usable immediately. There are
            exceptions, such as a code that is invalid on delivery or an account that stops working during its warranty. See
            the details in our <Link href="/refund-policy">Refund Policy</Link>.
          </>
        ),
      },
      {
        q: "Will the cards work in my region?",
        a: "Some cards are tied to a specific region or store. Check the product description before you buy — a code bought for the wrong region can't be refunded once it has been revealed.",
      },
    ],
  },
];

const copy: Record<Locale, { title: string; metaDescription: string; description: string; groups: FaqGroup[]; notFound: string; contact: string }> = {
  ar: {
    title: "الأسئلة الشائعة",
    metaDescription: "كل ما تحتاج معرفته عن التسليم، الدفع، ضمان الحسابات والاسترجاع في Nitro Store.",
    description: "إجابات سريعة عن التسليم، الدفع، الضمان والاسترجاع. لم تجد سؤالك؟ فريق الدعم متاح على مدار الساعة.",
    groups: arGroups,
    notFound: "لم تجد إجابة سؤالك؟",
    contact: "تواصل معنا",
  },
  en: {
    title: "Frequently asked questions",
    metaDescription: "Everything you need to know about delivery, payment, account warranties and refunds at Nitro Store.",
    description: "Quick answers about delivery, payment, warranties and refunds. Can't find your question? Our support team is available around the clock.",
    groups: enGroups,
    notFound: "Didn't find your answer?",
    contact: "Contact us",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const c = copy[await getLocale()];
  return { title: c.title, description: c.metaDescription, alternates: await alternates("/faq") };
}

export default async function FaqPage() {
  const c = copy[await getLocale()];
  return (
    <>
      <PageHeader eyebrow="FAQ" title={c.title} description={c.description} />
      <div className="mx-auto max-w-3xl space-y-10 px-4 pt-10 sm:px-6">
        {c.groups.map((group) => (
          <section key={group.title}>
            <h2 className="text-sm font-bold text-volt">{group.title}</h2>
            <div className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
              {group.items.map((item) => (
                <details key={item.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 font-semibold transition hover:text-volt sm:p-5 [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <IconChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180 group-open:text-volt" />
                  </summary>
                  <div className="px-4 pb-5 text-sm leading-8 text-muted sm:px-5 sm:text-base [&_a]:text-text [&_a]:underline [&_a]:decoration-volt [&_a]:underline-offset-4">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="font-semibold">{c.notFound}</p>
          <Link href="/contact" className="btn-primary">
            {c.contact}
          </Link>
        </div>
      </div>
    </>
  );
}
