import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { IconChat, IconClock, IconReceipt, IconUser } from "@/components/store/icons";
import Link from "@/components/store/link";
import { WHATSAPP_URL, firstParam } from "@/components/store/site";
import { NewTicketForm, type TicketFormMode } from "@/components/store/tickets/new-ticket-form";
import { PageHeader } from "@/components/store/ui";
import { localized } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import { isPlausibleOrderRef, tokenMatches } from "../_lib/order-access";
import { getSignedInCustomer } from "../_lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: t.support.metaTitle,
    description: t.support.metaDescription,
    // Links from an order page carry the order's access token
    referrer: "no-referrer",
  };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const shortId = (id: string) => id.slice(-8).toUpperCase();

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  return `${local.slice(0, 2)}${"•".repeat(Math.max(3, Math.min(local.length - 2, 6)))}@${domain}`;
}

async function orderFromLink(orderId: string | undefined, token: string | undefined) {
  if (!orderId || !isPlausibleOrderRef(orderId, token)) return null;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, accessToken: true, status: true, customer: { select: { email: true } } },
  });
  return order && tokenMatches(token, order.accessToken) ? order : null;
}

export default async function SupportPage({ searchParams }: Props) {
  const sp = await searchParams;
  const orderParam = firstParam(sp.order);
  const tokenParam = firstParam(sp.token);
  const [customer, t, locale] = await Promise.all([getSignedInCustomer(), getDictionary(), getLocale()]);

  let mode: TicketFormMode;
  if (customer) {
    const orders = await prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: {
        id: true,
        status: true,
        items: {
          orderBy: { id: "asc" },
          take: 1,
          select: { productName: true, variant: { select: { product: { select: { nameEn: true } } } } },
        },
      },
    });
    const options = orders.map((o) => {
      const item = o.items[0];
      const name = item ? localized(locale, item.productName, item.variant.product.nameEn) : t.support.orderFallback;
      return { id: o.id, label: `#${shortId(o.id)} — ${name} (${t.orderStatus[o.status]})` };
    });
    let defaultOrderId = orderParam && options.some((o) => o.id === orderParam) ? orderParam : null;
    if (orderParam && !defaultOrderId) {
      // An order bought with another email, opened from its private link
      const linked = await orderFromLink(orderParam, tokenParam);
      if (linked) {
        options.unshift({ id: linked.id, label: `#${shortId(linked.id)} (${t.orderStatus[linked.status]})` });
        defaultOrderId = linked.id;
      }
    }
    mode = { kind: "customer", email: customer.email, orders: options, defaultOrderId };
  } else {
    const linked = await orderFromLink(orderParam, tokenParam);
    mode =
      linked && tokenParam
        ? {
            kind: "guest-order",
            orderId: linked.id,
            orderToken: tokenParam,
            orderLabel: `#${shortId(linked.id)}`,
            maskedEmail: maskEmail(linked.customer.email),
          }
        : { kind: "guest" };
  }

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title={t.support.title}
        description={t.support.description}
      />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="new-ticket" className="card p-5 sm:p-7">
          <h2 id="new-ticket" className="mb-5 text-lg font-bold">
            {t.support.newTicket}
          </h2>
          <NewTicketForm mode={mode} />
        </section>

        <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          {customer ? (
            <Link href="/account/tickets" className="card flex items-center gap-3 p-4 transition hover:border-volt/50">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-volt/20">
                <IconReceipt className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">{t.support.myTickets}</span>
                <span className="block text-xs text-muted">{t.support.myTicketsText}</span>
              </span>
            </Link>
          ) : (
            <div className="card flex items-start gap-3 p-4">
              <IconUser className="mt-0.5 size-5 shrink-0 text-volt" />
              <p className="text-sm leading-7 text-muted">
                {t.support.haveAccount}{" "}
                <Link href="/login?next=/support" className="font-semibold text-text underline decoration-volt underline-offset-4">
                  {t.support.signIn}
                </Link>{" "}
                {t.support.signInText}
              </p>
            </div>
          )}
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <IconClock className="mt-0.5 size-5 shrink-0 text-volt" />
            <p className="text-sm leading-7 text-muted">{t.support.replyTime}</p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <IconChat className="mt-0.5 size-5 shrink-0 text-volt" />
            <p className="text-sm leading-7 text-muted">
              {t.support.quickQuestion}{" "}
              <Link href="/faq" className="text-text underline decoration-volt underline-offset-4">
                {t.support.faq}
              </Link>{" "}
              {t.support.or}{" "}
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-text underline decoration-volt underline-offset-4">
                {t.support.whatsapp}
              </a>
              .
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
