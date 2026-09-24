import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { IconBolt, IconMail, IconReceipt, IconWallet } from "@/components/store/icons";
import { SignInForm } from "@/components/store/sign-in-form";
import { firstParam, safeNextPath } from "@/components/store/site";
import { localizePath } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { getSignedInCustomer } from "../_lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getDictionary()).login.metaTitle,
    robots: { index: false, follow: false },
  };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const perkIcons = [IconReceipt, IconWallet, IconBolt];

export default async function LoginPage({ searchParams }: Props) {
  const next = safeNextPath(firstParam((await searchParams).next));
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  if (await getSignedInCustomer()) redirect(localizePath(next, locale));
  const perks = perkIcons.map((icon, i) => ({ icon, text: t.login.perks[i] }));

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center lg:gap-14">
      <section className="order-2 lg:order-1" aria-labelledby="login-perks">
        <p className="flex items-center gap-2 text-xs font-bold text-volt">
          <span className="h-px w-6 bg-volt" aria-hidden="true" />
          <span dir="ltr" className="font-display tracking-[0.2em] uppercase">
            Account
          </span>
        </p>
        <h2 id="login-perks" className="mt-3 text-2xl leading-tight font-bold sm:text-3xl">
          {t.login.heading}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-muted sm:text-base">{t.login.intro}</p>
        <ul className="mt-6 grid gap-3">
          {perks.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-volt/10 text-volt ring-1 ring-volt/20">
                <Icon className="size-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </section>

      <section className="order-1 lg:order-2" aria-labelledby="login-title">
        <div className="card relative overflow-hidden p-5 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_100%_0%,rgba(212,255,61,0.10),transparent_60%)]"
          />
          <div className="relative">
            <span className="grid size-11 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-volt/20">
              <IconMail className="size-5" />
            </span>
            <h1 id="login-title" className="mt-4 text-2xl font-bold">
              {t.login.title}
            </h1>
            <SignInForm next={next} />
          </div>
        </div>
      </section>
    </div>
  );
}
