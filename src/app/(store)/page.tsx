import type { Metadata } from "next";
import Image from "next/image";
import {
  IconArrow,
  IconBolt,
  IconBox,
  IconClock,
  IconHeadset,
  IconLock,
  IconShieldCheck,
} from "@/components/store/icons";
import Link from "@/components/store/link";
import { ProductGrid } from "@/components/store/product-card";
import { categoryHref } from "@/components/store/site";
import { EmptyState, SectionHeading } from "@/components/store/ui";
import { alternates } from "@/i18n/metadata";
import { type Dictionary, getDictionary } from "@/i18n/server";
import { getFeaturedProducts, getHomeCategories } from "./_lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { alternates: await alternates("/") };
}

export default async function HomePage() {
  const [categories, featured, t] = await Promise.all([getHomeCategories(), getFeaturedProducts(8), getDictionary()]);

  return (
    <>
      <Hero t={t} />
      <TrustStrip t={t} />

      <section id="categories" className="mx-auto max-w-7xl scroll-mt-32 px-4 pt-16 sm:px-6 sm:pt-24">
        <SectionHeading
          index="01"
          eyebrow="Categories"
          title={t.home.categoriesTitle}
          description={t.home.categoriesText}
        />
        {categories.length > 0 ? (
          <ul className="mx-auto mt-10 flex max-w-5xl flex-wrap justify-center gap-y-5 sm:gap-y-8">
            {categories.map((c, i) => (
              <li key={c.id} className="w-1/3 px-1.5 sm:px-3 lg:px-5">
                <CategoryTile category={c} index={i} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-8">
            <EmptyState
              icon={<IconBox className="size-7" />}
              title={t.home.emptyTitle}
              description={t.home.emptyText}
            >
              <Link href="/contact" className="btn-ghost">
                {t.common.contact}
              </Link>
            </EmptyState>
          </div>
        )}
      </section>

      {featured.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 sm:pt-24">
          <SectionHeading
            index="02"
            eyebrow="Featured"
            title={t.home.featuredTitle}
            description={t.home.featuredText}
          />
          <div className="mt-8">
            <ProductGrid products={featured} priorityCount={4} />
          </div>
        </section>
      ) : null}

      <HowItWorks t={t} />
    </>
  );
}

type HomeCategory = Awaited<ReturnType<typeof getHomeCategories>>[number];

/** Round category artwork (admin upload, name usually drawn in); a branded emblem until one is uploaded. */
function CategoryTile({ category: c, index }: { category: HomeCategory; index: number }) {
  return (
    <Link
      href={categoryHref(c.slug)}
      className="group relative block aspect-square rounded-full outline-none focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-4 focus-visible:ring-offset-bg"
    >
      <span
        aria-hidden="true"
        className="absolute inset-[8%] rounded-full bg-volt/15 opacity-50 blur-2xl transition duration-300 group-hover:opacity-100"
      />
      {c.imageUrl ? (
        <>
          <Image
            src={c.imageUrl}
            alt=""
            fill
            unoptimized
            sizes="(min-width: 1024px) 300px, 33vw"
            className="object-contain transition duration-300 group-hover:-translate-y-1 group-hover:scale-[1.04]"
          />
          <span className="sr-only">{c.name}</span>
        </>
      ) : (
        <span className="absolute inset-0 transition duration-300 group-hover:-translate-y-1 group-hover:scale-[1.04]">
          <span
            aria-hidden="true"
            className="absolute inset-[5%] rounded-full border-2 border-volt/35 bg-[radial-gradient(circle,rgba(212,255,61,0.14),rgba(20,20,20,0.9)_62%)] shadow-[0_0_40px_-12px_rgba(212,255,61,0.55)] transition group-hover:border-volt/80"
          />
          <span aria-hidden="true" className="absolute inset-[15%] rounded-full border border-dashed border-volt/25" />
          <span
            aria-hidden="true"
            dir="ltr"
            className="absolute inset-0 grid place-items-center pb-[12%] font-display text-[clamp(1.75rem,9vw,4.5rem)] leading-none font-bold tracking-tighter text-transparent [-webkit-text-stroke:1.5px_var(--color-volt)]"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="absolute inset-x-[3%] bottom-[6%] truncate rounded-full bg-volt px-2 py-1 text-center text-[11px] font-bold text-bg shadow-[0_8px_24px_-8px_rgba(212,255,61,0.7)] sm:py-1.5 sm:text-sm lg:text-base">
            {c.name}
          </span>
        </span>
      )}
    </Link>
  );
}

function Hero({ t }: { t: Dictionary }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border bg-bg">
      {/* Backdrop: volt glow + fading grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(55%_70%_at_20%_30%,rgba(212,255,61,0.16),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.06] [background-image:linear-gradient(var(--color-volt)_1px,transparent_1px),linear-gradient(90deg,var(--color-volt)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(70%_80%_at_50%_40%,black,transparent)]"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-6 lg:py-20">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-volt/30 bg-volt/10 px-3 py-1 text-xs font-bold text-volt">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-volt opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-volt" />
            </span>
            {t.home.live}
          </p>

          <h1 className="mt-6 text-4xl leading-[1.15] font-bold sm:text-5xl lg:text-6xl">
            {t.home.heroLine1}
            <br />
            <span className="relative inline-block text-volt [text-shadow:0_0_40px_rgba(212,255,61,0.35)]">
              {t.home.heroLine2}
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-8 text-muted sm:text-lg">
            {t.home.heroText}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="#categories" className="btn-primary h-12 px-6 text-base">
              {t.home.shopNow}
              <IconArrow className="size-4" />
            </Link>
            <Link href="#how-it-works" className="btn-ghost h-12 px-6 text-base">
              {t.home.howItWorks}
            </Link>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[IconBolt, IconLock, IconClock].map((Icon, i) => ({ icon: Icon, ...t.home.stats[i] })).map(({ icon: Icon, k, v }) => (
              <div key={k} className="rounded-xl border border-border bg-surface/70 p-3 backdrop-blur">
                <Icon className="size-4 text-volt" />
                <dt className="mt-2 text-xs text-muted">{k}</dt>
                <dd className="text-sm font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

/** Brand artwork (transparent): the Nitro crew with a delivered gift card. */
function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative -mx-4 select-none sm:mx-auto sm:w-full sm:max-w-2xl lg:-me-10 lg:max-w-none xl:-me-24">
      <div className="absolute inset-[12%] -z-[5] rounded-full bg-volt/15 blur-3xl" />
      <Image
        src="/brand/hero-crew.webp"
        alt=""
        width={1518}
        height={934}
        priority
        sizes="(min-width: 1280px) 820px, (min-width: 1024px) 60vw, 100vw"
        className="h-auto w-full drop-shadow-[0_24px_40px_rgba(0,0,0,0.6)]"
      />
    </div>
  );
}

function TrustStrip({ t }: { t: Dictionary }) {
  const items = [IconBolt, IconLock, IconShieldCheck, IconHeadset].map((icon, i) => ({ icon, ...t.home.trust[i] }));
  return (
    <section aria-label={t.home.trustLabel} className="border-b border-border bg-surface/50">
      <ul className="mx-auto grid max-w-7xl grid-cols-2 lg:grid-cols-4">
        {items.map(({ icon: Icon, title, text }, i) => (
          <li
            key={title}
            className={`flex items-start gap-3 px-4 py-5 sm:px-6 ${i % 2 === 1 ? "border-s border-border" : ""} ${
              i >= 2 ? "border-t border-border lg:border-t-0" : ""
            } ${i === 2 ? "lg:border-s" : ""}`}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-volt/10 text-volt ring-1 ring-volt/20">
              <Icon className="size-4.5" />
            </span>
            <span>
              <span className="block text-sm font-bold">{title}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted">{text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks({ t }: { t: Dictionary }) {
  const steps = t.home.steps.map((step, i) => ({ n: String(i + 1).padStart(2, "0"), ...step }));
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-32 px-4 pt-16 sm:px-6 sm:pt-24">
      <SectionHeading index="03" eyebrow="How it works" title={t.home.stepsTitle} />
      <ol className="mt-8 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.n} className="card relative overflow-hidden p-6">
            <span
              aria-hidden="true"
              dir="ltr"
              className="absolute -top-4 end-3 font-display text-[6.5rem] leading-none font-bold tracking-tighter text-volt/[0.07]"
            >
              {s.n}
            </span>
            <span
              dir="ltr"
              className={`relative grid size-10 place-items-center rounded-full font-display text-sm font-bold ${
                i === 2 ? "bg-volt text-bg shadow-[0_0_30px_rgba(212,255,61,0.5)]" : "border border-volt/40 text-volt"
              }`}
            >
              {s.n}
            </span>
            <h3 className="relative mt-5 text-xl font-bold">{s.title}</h3>
            <p className="relative mt-2 text-sm leading-7 text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
