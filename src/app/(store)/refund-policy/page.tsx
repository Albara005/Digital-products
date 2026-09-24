import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/store/content-page";
import Link from "@/components/store/link";
import { SUPPORT_EMAIL } from "@/components/store/site";
import { alternates } from "@/i18n/metadata";
import { getLocale } from "@/i18n/server";

const meta = {
  ar: {
    title: "سياسة الاسترجاع",
    description: "متى يمكن استرجاع المبلغ أو استبدال المنتج في Nitro Store: الأكواد الرقمية، الحسابات والخدمات.",
  },
  en: {
    title: "Refund Policy",
    description: "When you can get a refund or replacement at Nitro Store: digital codes, accounts and services.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return { ...meta[await getLocale()], alternates: await alternates("/refund-policy") };
}

export default async function RefundPolicyPage() {
  return (await getLocale()) === "en" ? <EnglishRefundPolicy /> : <ArabicRefundPolicy />;
}

function ArabicRefundPolicy() {
  return (
    <ContentPage
      eyebrow="Refund policy"
      title="سياسة الاسترجاع"
      description="المنتجات الرقمية تصبح قابلة للاستخدام لحظة تسليمها، لذلك تختلف سياسة استرجاعها عن المنتجات المادية."
    >
      <ContentSection n={1} title="الأكواد والبطاقات والاشتراكات">
        <p>
          <strong>الأكواد الرقمية غير قابلة للاسترجاع أو الاستبدال بعد عرضها</strong> على صفحة الطلب، لأنها تصبح صالحة
          للاستخدام فوراً ولا يمكن التحقق من عدم استخدامها.
        </p>
        <p>نستثني من ذلك الحالات التالية، بعد التحقق منها:</p>
        <ul>
          <li>الكود غير صالح أو مستخدم مسبقاً لحظة التسليم.</li>
          <li>استلام منتج أو فئة مختلفة عمّا طلبته.</li>
        </ul>
        <p>في هذه الحالات تواصل معنا خلال 24 ساعة من التسليم مع رقم الطلب ولقطة شاشة لرسالة الخطأ.</p>
      </ContentSection>

      <ContentSection n={2} title="الحسابات الجاهزة">
        <p>
          <strong>الحسابات مشمولة بالضمان خلال المدة الموضّحة في صفحة المنتج</strong>، وتبدأ من لحظة التسليم وتظهر على
          صفحة طلبك. إن لم يعمل الحساب كما هو موصوف خلال مدة الضمان نستبدله بحساب مماثل، أو نعيد المبلغ إن تعذّر
          الاستبدال.
        </p>
        <p>لا يشمل الضمان:</p>
        <ul>
          <li>المشاكل الناتجة عن تغيير بيانات الحساب بطريقة مخالفة للتعليمات المرفقة.</li>
          <li>مشاركة الحساب مع الغير أو مخالفة شروط المنصة المالكة له.</li>
          <li>الطلبات المقدّمة بعد انتهاء مدة الضمان.</li>
        </ul>
      </ContentSection>

      <ContentSection n={3} title="الخدمات">
        <p>
          يمكن إلغاء طلب الخدمة واسترجاع المبلغ كاملاً قبل بدء التنفيذ. بعد بدء التنفيذ أو إتمامه لا يمكن الاسترجاع، إلا
          إذا تعذّر علينا إكمال الخدمة كما هو موصوف.
        </p>
      </ContentSection>

      <ContentSection n={4} title="الطلبات غير المسلَّمة">
        <p>إذا تعذّر تسليم طلبك لأي سبب من جهتنا (مثل نفاد المخزون)، نعيد لك المبلغ كاملاً.</p>
      </ContentSection>

      <ContentSection n={5} title="كيف أطلب الاسترجاع أو الاستبدال؟">
        <ul>
          <li>
            راسلنا على{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
              {SUPPORT_EMAIL}
            </a>{" "}
            أو عبر <Link href="/contact">صفحة التواصل</Link>.
          </li>
          <li>اذكر رقم الطلب والبريد المستخدم، ووصفاً للمشكلة مع لقطة شاشة إن أمكن.</li>
          <li>نراجع الطلب ونرد عليك في أسرع وقت، وعادةً خلال 24 ساعة.</li>
          <li>تُعاد المبالغ المعتمدة إلى وسيلة الدفع الأصلية بالعملة التي دفعت بها، وقد يستغرق ظهورها في حسابك من 5 إلى 10 أيام عمل بحسب البنك.</li>
        </ul>
      </ContentSection>
    </ContentPage>
  );
}

function EnglishRefundPolicy() {
  return (
    <ContentPage
      eyebrow="Refund policy"
      title="Refund Policy"
      description="Digital products become usable the moment they're delivered, so our refund policy differs from that for physical goods."
    >
      <ContentSection n={1} title="Codes, gift cards and subscriptions">
        <p>
          <strong>Digital codes can&apos;t be refunded or exchanged once they&apos;ve been revealed</strong> on the order page,
          because they become usable immediately and there&apos;s no way to verify they haven&apos;t been used.
        </p>
        <p>The following cases are exceptions, once verified:</p>
        <ul>
          <li>The code was invalid or already used at the time of delivery.</li>
          <li>You received a different product or option than the one you ordered.</li>
        </ul>
        <p>In these cases, contact us within 24 hours of delivery with your order number and a screenshot of the error message.</p>
      </ContentSection>

      <ContentSection n={2} title="Ready-made accounts">
        <p>
          <strong>Accounts are covered by a warranty for the period shown on the product page</strong>, starting from delivery
          and displayed on your order page. If an account doesn&apos;t work as described during the warranty, we replace it
          with an equivalent account, or refund you if a replacement isn&apos;t possible.
        </p>
        <p>The warranty does not cover:</p>
        <ul>
          <li>Problems caused by changing the account details in a way that goes against the instructions provided.</li>
          <li>Sharing the account with others or breaking the terms of the platform that owns it.</li>
          <li>Requests made after the warranty period has ended.</li>
        </ul>
      </ContentSection>

      <ContentSection n={3} title="Services">
        <p>
          A service order can be cancelled for a full refund before work begins. Once work has started or been completed, it
          can&apos;t be refunded — unless we&apos;re unable to complete the service as described.
        </p>
      </ContentSection>

      <ContentSection n={4} title="Undelivered orders">
        <p>If we can&apos;t deliver your order for any reason on our side (such as stock running out), we refund you in full.</p>
      </ContentSection>

      <ContentSection n={5} title="How do I request a refund or replacement?">
        <ul>
          <li>
            Email us at{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
              {SUPPORT_EMAIL}
            </a>{" "}
            or use our <Link href="/contact">contact page</Link>.
          </li>
          <li>Include your order number, the email you used and a description of the problem, with a screenshot if possible.</li>
          <li>We review your request and reply as quickly as possible, usually within 24 hours.</li>
          <li>Approved refunds go back to the original payment method in the currency you paid in, and may take 5 to 10 business days to appear in your account depending on your bank.</li>
        </ul>
      </ContentSection>
    </ContentPage>
  );
}
