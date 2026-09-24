import { getDictionary } from "@/i18n/server";
import { getShopperMoney } from "@/app/(store)/_lib/money";
import { convertUsdCents } from "@/lib/display-currency";
import { currencyDecimals } from "@/lib/payments/currency";
import { intlLocale } from "@/i18n/config";
import { IconUser } from "./icons";
import Link from "./link";

/** What the header knows about the visitor. `undefined` = unknown (pages rendered without a session). */
export type HeaderAccount = { walletBalanceCents: number; currency: string } | null | undefined;

/**
 * The wallet (USD cents) in the shopper's currency for the header pill: in full below 1,000 units,
 * compact above ("$1.3K") so it never crowds the bar.
 */
async function walletAmounts(usdCents: number) {
  const money = await getShopperMoney();
  const { currency, rate } = money.fx;
  const minor = convertUsdCents(usdCents, currency, rate);
  const full = money.fixed(minor, currency);
  const major = minor / 10 ** currencyDecimals(currency);
  const pill =
    Math.abs(major) < 1000
      ? full
      : new Intl.NumberFormat(currency === "USD" ? "en-US" : intlLocale(money.locale), {
          style: "currency",
          currency,
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(major);
  return { full, pill };
}

const base =
  "grid h-10 place-items-center rounded-lg border border-border bg-surface text-text transition hover:border-volt hover:text-volt";

export async function AccountButton({ account }: { account: HeaderAccount }) {
  const t = await getDictionary();
  if (account === undefined) {
    // No session info (e.g. the static 404 page): /account forwards signed-out visitors to /login.
    return (
      <Link href="/account" aria-label={t.headerNav.account} className={`${base} w-10`}>
        <IconUser className="size-5" />
      </Link>
    );
  }

  if (account === null) {
    return (
      <Link href="/login" aria-label={t.headerNav.signIn} title={t.headerNav.signIn} className={`${base} w-10`}>
        <IconUser className="size-5" />
      </Link>
    );
  }

  const { full: balance, pill } = await walletAmounts(account.walletBalanceCents);
  return (
    <Link
      href="/account"
      aria-label={t.headerNav.accountBalance(balance)}
      title={t.headerNav.account}
      className={`${base} relative min-w-10 grid-flow-col gap-1.5 px-2.5 min-[390px]:ps-2 min-[390px]:pe-1.5`}
    >
      <IconUser className="size-5" />
      <span
        dir="ltr"
        aria-hidden="true"
        className="hidden rounded-md bg-volt/10 px-1.5 py-0.5 font-display text-xs font-bold text-volt tabular-nums ring-1 ring-volt/25 ring-inset min-[390px]:inline"
      >
        {pill}
      </span>
      {/* Very narrow screens: a dot marks the signed-in state instead of the balance pill. */}
      <span
        aria-hidden="true"
        className="absolute -top-1 -end-1 size-2.5 rounded-full bg-volt ring-2 ring-bg min-[390px]:hidden"
      />
    </Link>
  );
}
