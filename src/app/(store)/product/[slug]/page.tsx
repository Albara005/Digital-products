import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MAX_LINE_QUANTITY } from "@/lib/cart";
import { IconBolt, IconHeadset, IconLock, IconShieldCheck, IconSparkles } from "@/components/store/icons";
import { ProductGrid } from "@/components/store/product-card";
import { ProductMedia } from "@/components/store/product-media";
import { PurchasePanel } from "@/components/store/purchase-panel";
import { categoryHref, decodeSlug, formatWarranty, productHref, truncate } from "@/components/store/site";
import { SectionHeading, TypeBadge } from "@/components/store/ui";
import { getProductBySlug, getRelatedProducts } from "../../_lib/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(decodeSlug(slug));
  if (!product) return { title: "المنتج غير موجود" };
  const description = product.description
    ? truncate(product.description, 160)
    : `اشترِ ${product.name} من Nitro Store — دفع آمن وتسليم فوري على مدار الساعة.`;
  return {
    title: product.name,
    description,
    alternates: { canonical: productHref(product.slug) },
    openGraph: {
      title: product.name,
      description,
      type: "website",
      ...(product.imageUrl ? { images: [{ url: product.imageUrl, alt: product.name }] } : {}),
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(decodeSlug(slug));
  if (!product) notFound();

  const related = await getRelatedProducts(product.categoryId, product.id, 4);
  const isService = product.type === "SERVICE";
  const warranty = product.type === "ACCOUNT" && product.warrantyHours ? formatWarranty(product.warrantyHours) : null;

  const highlights = [
    isService
      ? { icon: IconSparkles, title: "تسليم يدوي", text: "ينفّذ فريقنا الخدمة بعد الدفع ونحدّث صفحة طلبك فور الانتهاء." }
      : { icon: IconBolt, title: "تسليم فوري", text: "يظهر المنتج على صفحة طلبك فور تأكيد الدفع." },
    warranty
      ? { icon: IconShieldCheck, title: `ضمان ${warranty}`, text: "يبدأ من لحظة التسليم؛ نستبدل الحساب أو نعيد المبلغ إن لم يعمل كما هو موصوف." }
      : { icon: IconLock, title: "دفع آمن", text: "بوابة دفع مشفّرة، ولا نخزّن بيانات بطاقتك." },
    { icon: IconHeadset, title: "دعم 24/7", text: "تواجه مشكلة؟ تواصل معنا وسنساعدك بسرعة." },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">
      <nav aria-label="مسار التنقل" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Link href="/" className="hover:text-volt">
          الرئيسية
        </Link>
        <span aria-hidden="true">/</span>
        <Link href={categoryHref(product.category.slug)} className="hover:text-volt">
          {product.category.name}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="line-clamp-1 text-text">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <div className="aspect-square overflow-hidden rounded-2xl border border-border">
            <ProductMedia
              name={product.name}
              type={product.type}
              imageUrl={product.imageUrl}
              size="lg"
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={product.type} />
            {warranty ? (
              <span className="badge gap-1 bg-surface-2 text-text ring-1 ring-border ring-inset">
                <IconShieldCheck className="size-3.5 text-volt" />
                ضمان {warranty}
              </span>
            ) : null}
            {isService ? (
              <span className="badge gap-1 bg-surface-2 text-text ring-1 ring-border ring-inset">
                <IconSparkles className="size-3.5 text-volt" />
                يُسلَّم يدوياً
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 text-3xl leading-tight font-bold sm:text-4xl">{product.name}</h1>

          <div className="mt-8">
            {product.variants.length > 0 ? (
              <PurchasePanel
                productType={product.type}
                variants={product.variants.map((v) => ({
                  id: v.id,
                  label: v.label,
                  priceCents: v.priceCents,
                  currency: v.currency,
                  // Enough to drive the UI (low-stock label, quantity cap) without publishing exact stock levels.
                  available: Math.min(v.available, MAX_LINE_QUANTITY),
                }))}
              />
            ) : (
              <p className="card p-5 text-sm text-muted">هذا المنتج غير متاح للشراء حالياً.</p>
            )}
          </div>

          <ul className="mt-8 grid gap-3">
            {highlights.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 rounded-xl border border-border bg-surface/60 p-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-volt/10 text-volt ring-1 ring-volt/20">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="mt-0.5 block text-xs leading-6 text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>

          {product.description ? (
            <section className="mt-10">
              <h2 className="text-lg font-bold">الوصف</h2>
              <p className="mt-3 text-sm leading-8 whitespace-pre-line text-muted sm:text-base">{product.description}</p>
            </section>
          ) : null}
        </div>
      </div>

      {related.length > 0 ? (
        <section className="pt-16 sm:pt-24">
          <SectionHeading
            eyebrow="More"
            title={`المزيد من ${product.category.name}`}
            action={
              <Link href={categoryHref(product.category.slug)} className="btn-ghost">
                عرض الكل
              </Link>
            }
          />
          <div className="mt-8">
            <ProductGrid products={related} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
