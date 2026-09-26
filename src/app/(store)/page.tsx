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
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c, i) => (
              <li key={c.id} className="flex">
                <Link
                  href={categoryHref(c.slug)}
                  className="group card relative flex w-full items-center gap-4 overflow-hidden p-5 transition hover:border-volt/60"
                >
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_0%_50%,rgba(212,255,61,0.10),transparent_70%)] opacity-0 transition group-hover:opacity-100"
                  />
                  <span
                    dir="ltr"
                    className="relative font-display text-4xl leading-none font-bold tracking-tighter text-transparent [-webkit-text-stroke:1px_var(--color-volt)] sm:text-5xl"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className="block truncate text-lg font-bold">{c.name}</span>
                    <span className="mt-0.5 line-clamp-1 block text-sm text-muted">
                      {c.description || `${c.productCount} ${t.common.products(c.productCount)}`}
                    </span>
                  </span>
                  <span className="relative grid size-9 shrink-0 place-items-center rounded-full border border-border text-muted transition group-hover:border-volt group-hover:bg-volt group-hover:text-bg">
                    <IconArrow className="size-4" />
                  </span>
                </Link>
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

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:py-24">
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

/** Brand artwork: the Nitro crew with a delivered gift card. Its black background blends into the page. */
function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-xl select-none lg:max-w-none">
      {/* Solid backing so the grid doesn't show through the artwork's dark areas under mix-blend-lighten */}
      <div className="absolute inset-[4%] -z-[5] rounded-[45%] bg-bg blur-xl" />
      <Image
        src="/brand/hero-mascots.webp"
        alt=""
        width={1019}
        height={710}
        priority
        sizes="(min-width: 1280px) 560px, (min-width: 1024px) 45vw, 92vw"
        className="h-auto w-full mix-blend-lighten"
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
