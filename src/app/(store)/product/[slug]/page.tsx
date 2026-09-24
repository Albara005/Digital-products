import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MAX_LINE_QUANTITY } from "@/lib/cart";
import { siteUrl } from "@/lib/email";
import { IconBolt, IconHeadset, IconLock, IconShieldCheck, IconSparkles, IconStar } from "@/components/store/icons";
import { ProductGrid } from "@/components/store/product-card";
import { ProductMedia } from "@/components/store/product-media";
import { PurchasePanel } from "@/components/store/purchase-panel";
import { ReviewList } from "@/components/store/review-list";
import { categoryHref, decodeSlug, formatWarranty, productHref, truncate } from "@/components/store/site";
import { Stars, formatRating, reviewCountLabel } from "@/components/store/stars";
import { EmptyState, SectionHeading, TypeBadge } from "@/components/store/ui";
import { getProductBySlug, getRelatedProducts } from "../../_lib/queries";
import { type RatingBreakdown, getApprovedReviews, getRatingBreakdown } from "../../_lib/reviews";

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

  const [related, rating, firstReviews] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id, 4),
    getRatingBreakdown(product.id),
    getApprovedReviews(product.id, 0),
  ]);
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

  const jsonLd = productJsonLd(product, rating);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-10">
      <script
        type="application/ld+json"
        // Escaping "<" keeps product text from ever closing the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
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

          {rating.count > 0 ? (
            <a
              href="#reviews"
              className="mt-3 inline-flex items-center gap-2 rounded-lg text-sm text-muted transition hover:text-text"
            >
              <Stars value={rating.average} className="size-4" />
              <span dir="ltr" className="font-display font-bold text-text tabular-nums">
                {formatRating(rating.average)}
              </span>
              <span className="underline decoration-border underline-offset-4">({reviewCountLabel(rating.count)})</span>
            </a>
          ) : null}

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

      <section id="reviews" aria-label="تقييمات العملاء" className="scroll-mt-32 pt-16 sm:pt-24">
        <SectionHeading eyebrow="Reviews" title="تقييمات العملاء" description="تقييمات من مشترين موثّقين استلموا طلباتهم." />
        {rating.count === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={<IconStar className="size-7" />}
              title="لا توجد تقييمات بعد"
              description="بعد استلام طلبك يمكنك تقييم المنتج من صفحة الطلب، وسيظهر تقييمك هنا بعد المراجعة."
            />
          </div>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
            <RatingSummaryCard rating={rating} />
            <ReviewList productId={product.id} initial={firstReviews.reviews} initialHasMore={firstReviews.hasMore} />
          </div>
        )}
      </section>

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

function RatingSummaryCard({ rating }: { rating: RatingBreakdown }) {
  return (
    <div className="card p-5 lg:sticky lg:top-32">
      <div className="flex items-center gap-4">
        <p dir="ltr" className="font-display text-5xl font-bold text-volt tabular-nums">
          {formatRating(rating.average)}
        </p>
        <div>
          <Stars value={rating.average} className="size-5" />
          <p className="mt-1 text-xs text-muted">{reviewCountLabel(rating.count)}</p>
        </div>
      </div>
      <ul className="mt-5 space-y-2" aria-label="توزيع التقييمات">
        {[5, 4, 3, 2, 1].map((stars) => {
          const n = rating.distribution[stars - 1];
          const pct = rating.count ? Math.round((n / rating.count) * 100) : 0;
          return (
            <li key={stars} className="flex items-center gap-3 text-xs">
              <span className="flex w-8 shrink-0 items-center gap-1 text-muted">
                <span dir="ltr" className="font-display font-bold text-text">
                  {stars}
                </span>
                <IconStar filled className="size-3 text-volt" />
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-volt" style={{ width: `${pct}%` }} />
              </span>
              <span dir="ltr" className="w-9 shrink-0 text-end font-display text-muted tabular-nums">
                {pct}%
              </span>
              <span className="sr-only">
                {stars} نجوم: {n}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type ProductForJsonLd = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

/** schema.org Product for rich results; aggregateRating only when there are approved reviews. */
function productJsonLd(product: ProductForJsonLd, rating: RatingBreakdown) {
  const base = siteUrl();
  const url = `${base}${productHref(product.slug)}`;
  const currency = product.variants[0]?.currency ?? "USD";
  const prices = product.variants.filter((v) => v.currency === currency).map((v) => v.priceCents / 100);
  const inStock = product.type === "SERVICE" || product.variants.some((v) => v.available > 0);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url,
    sku: product.id,
    category: product.category.name,
    ...(product.description ? { description: truncate(product.description, 500) } : {}),
    ...(product.imageUrl ? { image: new URL(product.imageUrl, `${base}/`).href } : {}),
    ...(prices.length > 0
      ? {
          offers: {
            "@type": "AggregateOffer",
            priceCurrency: currency,
            lowPrice: Math.min(...prices).toFixed(2),
            highPrice: Math.max(...prices).toFixed(2),
            offerCount: prices.length,
            availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url,
          },
        }
      : {}),
    ...(rating.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: formatRating(rating.average),
            reviewCount: rating.count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}
