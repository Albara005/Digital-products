import { getDictionary } from "@/i18n/server";
import Link from "./link";
import { SearchForm } from "./search-form";

export async function NotFoundView() {
  const t = await getDictionary();
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_30%,rgba(212,255,61,0.12),transparent_70%)]"
      />
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center sm:py-28">
        <p
          dir="ltr"
          aria-hidden="true"
          className="font-display text-[8rem] leading-none font-bold tracking-tighter text-transparent [-webkit-text-stroke:2px_var(--color-volt)] [text-shadow:0_0_60px_rgba(212,255,61,0.35)] sm:text-[11rem]"
        >
          404
        </p>
        <h1 className="mt-6 text-2xl font-bold sm:text-3xl">{t.notFound.title}</h1>
        <p className="mt-3 max-w-md text-sm leading-7 text-muted sm:text-base">
          {t.notFound.text}
        </p>
        <SearchForm size="lg" className="mt-8 w-full max-w-lg" />
        <Link href="/" className="btn-ghost mt-4">
          {t.common.backHome}
        </Link>
      </div>
    </section>
  );
}
