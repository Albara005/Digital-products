import { getDictionary } from "@/i18n/server";
import Link from "./link";
import { PageHeader } from "./ui";

/** Layout for static text pages (terms, policies). */
export async function ContentPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const t = await getDictionary();
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <article className="max-w-3xl space-y-10">{children}</article>
        <aside className="lg:sticky lg:top-32 lg:self-start">
          <div className="card p-5">
            <p className="text-sm font-bold">{t.content.related}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                { href: "/faq", label: t.footer.faq },
                { href: "/terms", label: t.footer.terms },
                { href: "/refund-policy", label: t.footer.refund },
                { href: "/contact", label: t.footer.contact },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-muted transition hover:text-volt">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}

export function ContentSection({ n, title, children }: { n?: number; title: string; children: React.ReactNode }) {
  return (
    <section className="scroll-mt-32">
      <h2 className="flex items-baseline gap-3 text-xl font-bold">
        {n !== undefined ? (
          <span dir="ltr" className="font-display text-sm font-bold text-volt">
            {String(n).padStart(2, "0")}
          </span>
        ) : null}
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-8 text-muted sm:text-base [&_a]:text-text [&_a]:underline [&_a]:decoration-volt [&_a]:underline-offset-4 [&_li]:ps-1 [&_strong]:text-text [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:ps-5 [&_ul]:marker:text-volt">
        {children}
      </div>
    </section>
  );
}
