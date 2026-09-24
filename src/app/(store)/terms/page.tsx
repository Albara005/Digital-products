import type { Metadata } from "next";
import { ContentPage, ContentSection } from "@/components/store/content-page";
import Link from "@/components/store/link";
import { SITE_NAME, SUPPORT_EMAIL } from "@/components/store/site";
import { alternates } from "@/i18n/metadata";
import { getLocale } from "@/i18n/server";

const meta = {
  ar: { title: "الشروط والأحكام", description: "الشروط والأحكام المنظِّمة لاستخدام Nitro Store وشراء المنتجات الرقمية." },
  en: { title: "Terms & Conditions", description: "The terms and conditions governing the use of Nitro Store and the purchase of digital products." },
};

export async function generateMetadata(): Promise<Metadata> {
  return { ...meta[await getLocale()], alternates: await alternates("/terms") };
}

export default async function TermsPage() {
  return (await getLocale()) === "en" ? <EnglishTerms /> : <ArabicTerms />;
}

function ArabicTerms() {
  return (
    <ContentPage
      eyebrow="Terms"
      title="الشروط والأحكام"
      description={`باستخدامك ${SITE_NAME} أو إتمامك لأي طلب، فإنك توافق على الشروط التالية.`}
    >
      <ContentSection n={1} title="عن المتجر">
        <p>
          {SITE_NAME} متجر إلكتروني لبيع المنتجات الرقمية: بطاقات الهدايا وشحن الألعاب، الاشتراكات، الحسابات الجاهزة
          والخدمات الرقمية. جميع المنتجات تُسلَّم إلكترونياً ولا يوجد شحن مادي.
        </p>
      </ContentSection>

      <ContentSection n={2} title="الطلبات والتسليم">
        <ul>
          <li>تُسلَّم الأكواد والحسابات المتوفرة تلقائياً على صفحة الطلب فور تأكيد الدفع، ويُرسل رابط الصفحة إلى بريدك.</li>
          <li>الخدمات تُنفَّذ يدوياً بعد الدفع، وقد يختلف وقت التنفيذ بحسب نوع الخدمة.</li>
          <li>أنت مسؤول عن صحة البريد الإلكتروني المُدخل، وعن الحفاظ على سرية رابط صفحة طلبك.</li>
          <li>يحق لنا إلغاء أي طلب واسترجاع قيمته في حال وجود خطأ في السعر أو نفاد المخزون أو الاشتباه بعملية احتيال.</li>
        </ul>
      </ContentSection>

      <ContentSection n={3} title="الأسعار والدفع">
        <ul>
          <li>الأسعار المعروضة نهائية بالعملة التي تختارها، وهي عملة الدفع نفسها، وقد تتغيّر دون إشعار مسبق قبل إتمام الطلب.</li>
          <li>تتم المدفوعات عبر بوابة دفع آمنة ومشفّرة، ولا نخزّن بيانات بطاقتك.</li>
          <li>أي رسوم يفرضها بنكك (مثل رسوم تحويل العملة) يتحمّلها العميل.</li>
        </ul>
      </ContentSection>

      <ContentSection n={4} title="استخدام المنتجات">
        <ul>
          <li>تحقّق من المنطقة والمنصة المناسبة قبل الشراء؛ بعض البطاقات مخصّصة لمنطقة أو متجر محدد.</li>
          <li>المنتجات للاستخدام الشخصي، ويخضع استخدامها لشروط المنصة أو الناشر المالك لها.</li>
          <li>العلامات التجارية وأسماء الألعاب والمنصات مملوكة لأصحابها، ولا ندّعي أي انتماء رسمي لها.</li>
        </ul>
      </ContentSection>

      <ContentSection n={5} title="الحسابات والضمان">
        <p>
          تُغطّى الحسابات الجاهزة بضمان للمدة الموضّحة في صفحة المنتج، تبدأ من لحظة التسليم. يلتزم العميل باتباع تعليمات
          الاستخدام المرفقة، ولا يشمل الضمان المشاكل الناتجة عن مخالفتها أو مخالفة شروط المنصة. تفاصيل الاستبدال
          والاسترجاع في <Link href="/refund-policy">سياسة الاسترجاع</Link>.
        </p>
      </ContentSection>

      <ContentSection n={6} title="حدود المسؤولية">
        <p>
          تقتصر مسؤوليتنا في جميع الأحوال على قيمة الطلب المدفوعة. لا نتحمّل مسؤولية أي ضرر ناتج عن مشاركة الأكواد أو
          بيانات الحسابات مع الغير، أو عن قرارات المنصات المالكة للمنتجات بعد التسليم.
        </p>
      </ContentSection>

      <ContentSection n={7} title="التعديلات والتواصل">
        <p>
          قد نحدّث هذه الشروط من وقت لآخر، ويُعمل بالنسخة المنشورة وقت إتمام طلبك. لأي استفسار راسلنا على{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
            {SUPPORT_EMAIL}
          </a>{" "}
          أو عبر <Link href="/contact">صفحة التواصل</Link>.
        </p>
      </ContentSection>
    </ContentPage>
  );
}

function EnglishTerms() {
  return (
    <ContentPage
      eyebrow="Terms"
      title="Terms & Conditions"
      description={`By using ${SITE_NAME} or placing any order, you agree to the following terms.`}
    >
      <ContentSection n={1} title="About the store">
        <p>
          {SITE_NAME} is an online store selling digital products: gift cards and game top-ups, subscriptions, ready-made
          accounts and digital services. All products are delivered electronically — nothing is shipped physically.
        </p>
      </ContentSection>

      <ContentSection n={2} title="Orders and delivery">
        <ul>
          <li>Codes and accounts in stock are delivered automatically on your order page as soon as payment is confirmed, and the page link is emailed to you.</li>
          <li>Services are carried out manually after payment; turnaround time depends on the type of service.</li>
          <li>You are responsible for entering a correct email address and for keeping your order page link private.</li>
          <li>We may cancel and refund any order in case of a pricing error, stock running out or suspected fraud.</li>
        </ul>
      </ContentSection>

      <ContentSection n={3} title="Prices and payment">
        <ul>
          <li>Prices are final in the currency you select, which is the currency you are charged in. Prices may change without notice before an order is placed.</li>
          <li>Payments are processed through a secure, encrypted payment gateway, and we never store your card details.</li>
          <li>Any fees charged by your bank (such as currency conversion fees) are the customer&apos;s responsibility.</li>
        </ul>
      </ContentSection>

      <ContentSection n={4} title="Using the products">
        <ul>
          <li>Check the region and platform before buying; some cards only work in a specific region or store.</li>
          <li>Products are for personal use, and their use is subject to the terms of the platform or publisher that owns them.</li>
          <li>Trademarks and the names of games and platforms belong to their respective owners; we claim no official affiliation with them.</li>
        </ul>
      </ContentSection>

      <ContentSection n={5} title="Accounts and warranty">
        <p>
          Ready-made accounts are covered by a warranty for the period shown on the product page, starting from delivery. The
          customer must follow the usage instructions provided; the warranty does not cover problems caused by ignoring them or
          by breaking the platform&apos;s terms. Replacement and refund details are in our{" "}
          <Link href="/refund-policy">Refund Policy</Link>.
        </p>
      </ContentSection>

      <ContentSection n={6} title="Limitation of liability">
        <p>
          Our liability is in all cases limited to the amount paid for the order. We are not responsible for any damage
          resulting from sharing codes or account details with others, or from decisions made after delivery by the platforms
          that own the products.
        </p>
      </ContentSection>

      <ContentSection n={7} title="Changes and contact">
        <p>
          We may update these terms from time to time; the version published when you place your order applies. For any
          questions, email us at{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
            {SUPPORT_EMAIL}
          </a>{" "}
          or use our <Link href="/contact">contact page</Link>.
        </p>
      </ContentSection>
    </ContentPage>
  );
}
