import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { OrderStatus, WalletTransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { orderPagePath, siteUrl } from "@/lib/email";
import { getCheckoutOptions } from "@/lib/payments";
import {
  REFERRAL_WALLET_NOTE,
  ensureReferralCode,
  getReferralSettings,
  getReferralSummary,
  settleReferralRewards,
} from "@/lib/referrals";
import { countWalletTransactions, listWalletTransactions } from "@/lib/wallet";
import { AutoRefresh } from "@/components/store/auto-refresh";
import {
  IconAlert,
  IconArrow,
  IconBag,
  IconChat,
  IconCheck,
  IconClock,
  IconGift,
  IconLogout,
  IconReceipt,
  IconRefresh,
  IconSparkles,
  IconWallet,
} from "@/components/store/icons";
import Link from "@/components/store/link";
import { LocalTime } from "@/components/store/local-time";
import { ReferralCard, type ReferralCardData } from "@/components/store/referral-card";
import { Pager, pageParam } from "@/components/store/pagination";
import { WALLET_CURRENCY, firstParam } from "@/components/store/site";
import { type PaymentProviderOption, TopupForm } from "@/components/store/topup-form";
import { EmptyState } from "@/components/store/ui";
import { type Locale, localized, localizePath } from "@/i18n/config";
import { type Dictionary, getDictionary, getLocale } from "@/i18n/server";
import { signOutAction } from "../login/actions";
import { getSignedInCustomer } from "../_lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getDictionary()).account.metaTitle,
    robots: { index: false, follow: false },
  };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ORDERS_PAGE_SIZE = 8;
const WALLET_PAGE_SIZE = 10;

const statusTone: Record<OrderStatus, string> = {
  PENDING: "bg-surface-2 text-muted ring-border",
  PAID: "bg-volt/10 text-volt ring-volt/30",
  FULFILLED: "bg-success/10 text-success ring-success/30",
  FAILED: "bg-danger/10 text-danger ring-danger/30",
  REFUNDED: "bg-fuchsia/10 text-fuchsia ring-fuchsia/30",
};

const txIcon: Record<WalletTransactionType, typeof IconWallet> = {
  TOPUP: IconWallet,
  PURCHASE: IconBag,
  REFUND: IconRefresh,
  ADJUSTMENT: IconSparkles,
};

/** The referral rule in the shopper's language, e.g. "تحصل على 5% من قيمة أول طلب يدفعه صديقك…". */
function referralRule(settings: Awaited<ReturnType<typeof getReferralSettings>>, t: Dictionary) {
  const usd = (cents: number) => formatPrice(cents, WALLET_CURRENCY);
  const percent = settings.rewardType === "PERCENT";
  return t.referral.rule({
    percent: percent ? settings.rewardValue : null,
    fixed: percent ? null : usd(Math.trunc(settings.rewardValue)),
    max: percent && settings.maxRewardCents ? usd(settings.maxRewardCents) : null,
    min: settings.minOrderCents > 0 ? usd(settings.minOrderCents) : null,
  });
}

const shortId = (id: string) => id.slice(-8).toUpperCase();

/** The "invite your friends" card. A failure here hides the card instead of breaking the page. */
async function loadReferral(customerId: string, t: Dictionary, locale: Locale): Promise<ReferralCardData | null> {
  try {
    // Credits any reward whose order was fulfilled while the credit step failed
    await settleReferralRewards(customerId);
    const [settings, code, summary] = await Promise.all([
      getReferralSettings(),
      ensureReferralCode(customerId),
      getReferralSummary(customerId),
    ]);
    if (!settings.enabled && summary.invited === 0 && summary.earnedCents === 0) return null;
    return {
      link: settings.enabled ? `${siteUrl()}${localizePath("/", locale)}?ref=${code}` : null,
      rule: referralRule(settings, t),
      ...summary,
    };
  } catch (err) {
    console.error("[account] Could not load the referral card", err);
    return null;
  }
}

async function loadCheckoutOptions(t: Dictionary): Promise<{ providers: PaymentProviderOption[]; devMode: boolean }> {
  try {
    const options = await getCheckoutOptions();
    return {
      providers: options.providers.map((p) => ({ id: p.id, label: t.cartPage.providers[p.id] ?? p.label })),
      devMode: options.devMode,
    };
  } catch (err) {
    console.error("[account] Could not load payment options", err);
    return { providers: [], devMode: false };
  }
}

export default async function AccountPage({ searchParams }: Props) {
  const sp = await searchParams;
  const [customer, t, locale] = await Promise.all([getSignedInCustomer(), getDictionary(), getLocale()]);
  if (!customer) redirect(localizePath("/login?next=/account", locale));

  const topupReturn = firstParam(sp.topup);
  const ordersPage = pageParam(sp.orders);
  const walletPage = pageParam(sp.wallet);
  const mine = { customerId: customer.id };

  const [orderCount, orders, txCount, transactions, latestTopup, options, referral, answeredTickets] = await Promise.all([
    prisma.order.count({ where: mine }),
    prisma.order.findMany({
      where: mine,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (ordersPage - 1) * ORDERS_PAGE_SIZE,
      take: ORDERS_PAGE_SIZE,
      select: {
        id: true,
        accessToken: true,
        status: true,
        totalCents: true,
        currency: true,
        createdAt: true,
        items: {
          orderBy: { id: "asc" },
          take: 2,
          select: {
            productName: true,
            variantLabel: true,
            quantity: true,
            variant: { select: { labelEn: true, product: { select: { nameEn: true } } } },
          },
        },
        _count: { select: { items: true } },
      },
    }),
    countWalletTransactions(customer.id),
    listWalletTransactions(customer.id, { take: WALLET_PAGE_SIZE, skip: (walletPage - 1) * WALLET_PAGE_SIZE }),
    topupReturn === "ok"
      ? prisma.walletTopup.findFirst({
          where: mine,
          orderBy: { createdAt: "desc" },
          select: { status: true, amountCents: true, currency: true },
        })
      : null,
    loadCheckoutOptions(t),
    loadReferral(customer.id, t, locale),
    prisma.ticket.count({ where: { ...mine, status: "ANSWERED" } }),
  ]);

  // Order links in the wallet history carry access tokens: only this customer's own orders get one.
  const txOrderIds = [...new Set(transactions.map((tx) => tx.orderId).filter((id): id is string => !!id))];
  const txOrders = txOrderIds.length
    ? await prisma.order.findMany({ where: { id: { in: txOrderIds }, ...mine }, select: { id: true, accessToken: true } })
    : [];
  const txOrderById = new Map(txOrders.map((o) => [o.id, o]));

  const listParams = { orders: ordersPage > 1 ? String(ordersPage) : undefined, wallet: walletPage > 1 ? String(walletPage) : undefined };
  const balance = customer.walletBalanceCents;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 sm:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-bold text-volt">
            <span className="h-px w-6 bg-volt" aria-hidden="true" />
            <span dir="ltr" className="font-display tracking-[0.2em] uppercase">
              My account
            </span>
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{t.account.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <bdi dir="ltr" className="max-w-full min-w-0 truncate font-medium text-text">
              {customer.email}
            </bdi>
            <span aria-hidden="true">·</span>
            <span>
              {t.account.memberSince} <LocalTime iso={customer.createdAt.toISOString()} dateOnly />
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/account/tickets" className="btn-ghost h-10">
            <IconChat className="size-4" />
            {t.account.tickets}
            {answeredTickets > 0 ? (
              <span
                className="rounded-full bg-volt px-1.5 font-display text-[11px] font-bold text-bg"
                title={t.account.newReplies}
              >
                {answeredTickets}
              </span>
            ) : null}
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="btn-ghost h-10">
              <IconLogout className="size-4" />
              {t.account.signOut}
            </button>
          </form>
        </div>
      </header>

      {topupReturn === "ok" ? (
        <TopupBanner topup={latestTopup} t={t} />
      ) : topupReturn === "cancelled" ? (
        <Banner tone="muted" icon={<IconAlert className="size-5" />} dismiss={t.account.hide}>
          <span className="font-bold">{t.account.topupCancelled}</span> {t.account.topupCancelledText}
        </Banner>
      ) : null}

      <div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section aria-labelledby="wallet-balance" className="card relative flex flex-col overflow-hidden p-5 sm:p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_100%_at_100%_0%,rgba(212,255,61,0.12),transparent_60%)]"
          />
          <div className="relative flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-volt/20">
              <IconWallet className="size-5" />
            </span>
            <h2 id="wallet-balance" className="font-bold">
              {t.account.walletBalance}
            </h2>
          </div>
          <p dir="ltr" className="relative mt-5 text-end font-display text-4xl font-bold text-volt tabular-nums sm:text-5xl">
            {formatPrice(balance, WALLET_CURRENCY)}
          </p>
          <p className="relative mt-3 text-sm leading-7 text-muted">
            {t.account.walletHint}
          </p>
          <dl className="relative mt-auto grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted">{t.account.orders}</dt>
              <dd dir="ltr" className="mt-1 text-end font-display text-lg font-bold tabular-nums">
                {orderCount}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">{t.account.walletMoves}</dt>
              <dd dir="ltr" className="mt-1 text-end font-display text-lg font-bold tabular-nums">
                {txCount}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="wallet-topup" className="card p-5 sm:p-6">
          <h2 id="wallet-topup" className="text-lg font-bold">
            {t.account.topupTitle}
          </h2>
          <p className="mt-1 mb-5 text-sm text-muted">{t.account.topupText}</p>
          <TopupForm providers={options.providers} devMode={options.devMode} currency={WALLET_CURRENCY} />
        </section>
      </div>

      {referral ? <ReferralCard data={referral} /> : null}

      <section id="orders" aria-labelledby="orders-title" className="mt-12 scroll-mt-32">
        <div className="flex items-end justify-between gap-3">
          <h2 id="orders-title" className="text-xl font-bold">
            {t.account.myOrders}
          </h2>
          {orderCount > 0 ? (
            <span className="text-xs text-muted">
              <span dir="ltr" className="font-display font-bold text-text">
                {orderCount}
              </span>{" "}
              {t.account.orderWord}
            </span>
          ) : null}
        </div>

        {orders.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<IconReceipt className="size-7" />}
              title={orderCount > 0 ? t.account.noOrdersPage : t.account.noOrders}
              description={t.account.noOrdersText}
            >
              <Link href={orderCount > 0 ? "/account#orders" : "/"} className="btn-primary">
                {orderCount > 0 ? t.account.firstPage : t.account.startShopping}
              </Link>
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.map((order) => {
              const [first, second] = order.items.map((item) => ({
                ...item,
                productName: localized(locale, item.productName, item.variant.product.nameEn),
                variantLabel: localized(locale, item.variantLabel, item.variant.labelEn),
              }));
              const more = order._count.items - order.items.length;
              return (
                <li key={order.id}>
                  {/* Links carry the order's access token: only this signed-in owner's orders are listed. */}
                  <Link
                    href={orderPagePath(order)}
                    prefetch={false}
                    className="group card flex items-center gap-3 p-4 transition hover:border-volt/50 sm:gap-4 sm:p-5"
                  >
                    <span className="hidden size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted ring-1 ring-border sm:grid">
                      <IconReceipt className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span dir="ltr" className="font-display text-sm font-bold">
                          #{shortId(order.id)}
                        </span>
                        <span className={`badge ring-1 ring-inset ${statusTone[order.status]}`}>
                          {t.orderStatus[order.status]}
                        </span>
                      </span>
                      <span className="mt-1.5 block truncate text-sm">
                        {first ? (
                          <>
                            <bdi>{first.productName}</bdi>
                            <span className="text-muted"> · {first.variantLabel}</span>
                            {first.quantity > 1 ? (
                              <span dir="ltr" className="font-display text-muted">
                                {" "}
                                ×{first.quantity}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {second ? (
                          <span className="text-muted">
                            {" "}
                            + <bdi>{second.productName}</bdi>
                          </span>
                        ) : null}
                        {more > 0 ? <span className="text-muted">{t.account.more(more)}</span> : null}
                      </span>
                      <span className="mt-1 block text-xs text-muted">
                        <LocalTime iso={order.createdAt.toISOString()} />
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span dir="ltr" className="font-display text-base font-bold tabular-nums">
                        {formatPrice(order.totalCents, order.currency)}
                      </span>
                      <span
                        aria-hidden="true"
                        className="grid size-8 place-items-center rounded-full border border-border text-muted transition group-hover:border-volt group-hover:bg-volt group-hover:text-bg"
                      >
                        <IconArrow className="size-4" />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <Pager
          pathname="/account"
          param="orders"
          params={listParams}
          page={ordersPage}
          pageSize={ORDERS_PAGE_SIZE}
          total={orderCount}
          hash="orders"
          label={t.account.ordersPages}
        />
      </section>

      <section id="wallet" aria-labelledby="wallet-title" className="mt-12 scroll-mt-32">
        <div className="flex items-end justify-between gap-3">
          <h2 id="wallet-title" className="text-xl font-bold">
            {t.account.walletHistory}
          </h2>
        </div>

        {transactions.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<IconWallet className="size-7" />}
              title={txCount > 0 ? t.account.noMovesPage : t.account.noMoves}
              description={t.account.noMovesText}
            />
          </div>
        ) : (
          <ul className="card mt-4 divide-y divide-border overflow-hidden">
            {transactions.map((tx) => {
              const copy =
                tx.type === "ADJUSTMENT" && tx.note === REFERRAL_WALLET_NOTE
                  ? { label: t.account.referralReward, icon: IconGift }
                  : { label: t.account.tx[tx.type], icon: txIcon[tx.type] };
              const Icon = copy.icon;
              const credit = tx.amountCents >= 0;
              const order = tx.orderId ? txOrderById.get(tx.orderId) : undefined;
              return (
                <li key={tx.id} className="flex items-center gap-3 p-4">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-xl ring-1 ${
                      credit ? "bg-success/10 text-success ring-success/25" : "bg-surface-2 text-muted ring-border"
                    }`}
                  >
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{copy.label}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <LocalTime iso={tx.createdAt.toISOString()} />
                      {order ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <Link href={orderPagePath(order)} prefetch={false} className="text-text underline decoration-border underline-offset-4 hover:text-volt hover:decoration-volt">
                            {t.account.order}{" "}
                            <span dir="ltr" className="font-display">
                              #{shortId(order.id)}
                            </span>
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className={`font-display text-base font-bold tabular-nums ${credit ? "text-success" : "text-danger"}`}>
                      <span dir="ltr">
                        {credit ? "+" : "−"}
                        {formatPrice(Math.abs(tx.amountCents), WALLET_CURRENCY)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {t.account.balance}{" "}
                      <span dir="ltr" className="font-display tabular-nums">
                        {formatPrice(tx.balanceAfterCents, WALLET_CURRENCY)}
                      </span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pager
          pathname="/account"
          param="wallet"
          params={listParams}
          page={walletPage}
          pageSize={WALLET_PAGE_SIZE}
          total={txCount}
          hash="wallet"
          label={t.account.walletPages}
        />
      </section>
    </div>
  );
}

function Banner({
  tone,
  icon,
  children,
  dismiss,
  extra,
}: {
  tone: "success" | "volt" | "muted" | "danger";
  icon: React.ReactNode;
  children: React.ReactNode;
  /** Label of the "hide" link, when the banner can be dismissed. */
  dismiss?: string;
  extra?: React.ReactNode;
}) {
  const tones = {
    success: "border-success/40 bg-success/10 text-success",
    volt: "border-volt/40 bg-volt/10 text-volt",
    muted: "border-border bg-surface-2 text-text",
    danger: "border-danger/40 bg-danger/10 text-danger",
  };
  return (
    <div role="status" className={`mt-6 flex flex-wrap items-start gap-3 rounded-xl border p-4 text-sm leading-7 ${tones[tone]}`}>
      <span className="mt-1 shrink-0">{icon}</span>
      <p className="min-w-0 flex-1">{children}</p>
      {extra}
      {dismiss ? (
        <Link href="/account" className="text-xs text-muted underline underline-offset-4 hover:text-text">
          {dismiss}
        </Link>
      ) : null}
    </div>
  );
}

function TopupBanner({
  topup,
  t,
}: {
  topup: { status: "PENDING" | "PAID" | "FAILED"; amountCents: number; currency: string } | null;
  t: Dictionary;
}) {
  if (topup?.status === "PENDING") {
    return (
      <Banner tone="volt" icon={<IconClock className="size-5" />} extra={<AutoRefresh intervalMs={3000} maxMs={90_000} />}>
        <span className="font-bold">{t.account.topupPending}</span> {t.account.willAdd ? <>{t.account.willAdd} </> : null}
        <span dir="ltr" className="font-display font-bold">
          {formatPrice(topup.amountCents, topup.currency)}
        </span>{" "}
        {t.account.toBalanceSoon}
      </Banner>
    );
  }
  if (topup?.status === "FAILED") {
    return (
      <Banner tone="danger" icon={<IconAlert className="size-5" />} dismiss={t.account.hide}>
        <span className="font-bold">{t.account.topupFailed}</span> {t.account.topupFailedText}
      </Banner>
    );
  }
  return (
    <Banner tone="success" icon={topup ? <IconCheck className="size-5" /> : <IconGift className="size-5" />} dismiss={t.account.hide}>
      <span className="font-bold">{t.account.topupOk}</span>{" "}
      {topup ? (
        <>
          {t.account.added ? <>{t.account.added} </> : null}
          <span dir="ltr" className="font-display font-bold">
            {formatPrice(topup.amountCents, topup.currency)}
          </span>{" "}
          {t.account.toWallet}
        </>
      ) : (
        t.account.willShow
      )}
    </Banner>
  );
}
