import type { Metadata } from "next";
import Link from "next/link";
import { IconChevronDown } from "@/components/store/icons";
import { PageHeader } from "@/components/store/ui";

export const metadata: Metadata = {
  title: "الأسئلة الشائعة",
  description: "كل ما تحتاج معرفته عن التسليم، الدفع، ضمان الحسابات والاسترجاع في Nitro Store.",
};

const groups: { title: string; items: { q: string; a: React.ReactNode }[] }[] = [
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
        a: "تُعرض الأسعار بالعملة الموضّحة بجانب كل منتج، وقد يطبّق بنكك رسوم تحويل عملة بحسب سياساته.",
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

export default function FaqPage() {
  return (
    <>
      <PageHeader
        eyebrow="FAQ"
        title="الأسئلة الشائعة"
        description="إجابات سريعة عن التسليم، الدفع، الضمان والاسترجاع. لم تجد سؤالك؟ فريق الدعم متاح على مدار الساعة."
      />
      <div className="mx-auto max-w-3xl space-y-10 px-4 pt-10 sm:px-6">
        {groups.map((group) => (
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
          <p className="font-semibold">لم تجد إجابة سؤالك؟</p>
          <Link href="/contact" className="btn-primary">
            تواصل معنا
          </Link>
        </div>
      </div>
    </>
  );
}
