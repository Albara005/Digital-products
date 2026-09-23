import Link from "next/link";
import { IconBolt, IconHeadset, IconLock, IconShieldCheck } from "./icons";
import { Logo } from "./logo";
import { SITE_NAME, SUPPORT_EMAIL } from "./site";

const columns = [
  {
    title: "المساعدة",
    links: [
      { href: "/faq", label: "الأسئلة الشائعة" },
      { href: "/contact", label: "تواصل معنا" },
      { href: "/cart", label: "سلة المشتريات" },
    ],
  },
  {
    title: "السياسات",
    links: [
      { href: "/terms", label: "الشروط والأحكام" },
      { href: "/refund-policy", label: "سياسة الاسترجاع" },
    ],
  },
];

export function StoreFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-border bg-surface/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-sm text-sm leading-7 text-muted">
            بطاقات ألعاب، اشتراكات، حسابات وخدمات رقمية — دفع آمن وتسليم فوري للأكواد على مدار الساعة.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
            <li className="flex items-center gap-1.5">
              <IconBolt className="size-3.5 text-volt" /> تسليم فوري
            </li>
            <li className="flex items-center gap-1.5">
              <IconLock className="size-3.5 text-volt" /> دفع مشفّر
            </li>
            <li className="flex items-center gap-1.5">
              <IconShieldCheck className="size-3.5 text-volt" /> ضمان الحسابات
            </li>
            <li className="flex items-center gap-1.5">
              <IconHeadset className="size-3.5 text-volt" /> دعم 24/7
            </li>
          </ul>
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="text-sm font-bold text-text">{col.title}</h2>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted transition hover:text-volt">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <p
          aria-hidden="true"
          dir="ltr"
          className="pointer-events-none -mb-[0.22em] text-center font-display text-[24vw] leading-none font-bold tracking-tighter text-transparent select-none [-webkit-text-stroke:1px_rgba(212,255,61,0.16)] lg:text-[17rem]"
        >
          NITRO
        </p>
      </div>

      <div className="relative border-t border-border bg-bg/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            © <span dir="ltr">{year}</span> {SITE_NAME}. جميع الحقوق محفوظة.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" className="transition hover:text-volt">
            {SUPPORT_EMAIL}
          </a>
        </div>
      </div>
    </footer>
  );
}
