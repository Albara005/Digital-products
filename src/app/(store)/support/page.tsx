import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { orderStatusLabel } from "@/lib/format";
import { IconChat, IconClock, IconReceipt, IconUser } from "@/components/store/icons";
import { WHATSAPP_URL, firstParam } from "@/components/store/site";
import { NewTicketForm, type TicketFormMode } from "@/components/store/tickets/new-ticket-form";
import { PageHeader } from "@/components/store/ui";
import { isPlausibleOrderRef, tokenMatches } from "../_lib/order-access";
import { getSignedInCustomer } from "../_lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "الدعم الفني",
  description: "افتح تذكرة دعم وتابع ردود فريق Nitro Store.",
  // Links from an order page carry the order's access token
  referrer: "no-referrer",
};

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
  const customer = await getSignedInCustomer();

  let mode: TicketFormMode;
  if (customer) {
    const orders = await prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { id: true, status: true, items: { orderBy: { id: "asc" }, take: 1, select: { productName: true } } },
    });
    const options = orders.map((o) => ({
      id: o.id,
      label: `#${shortId(o.id)} — ${o.items[0]?.productName ?? "طلب"} (${orderStatusLabel[o.status]})`,
    }));
    let defaultOrderId = orderParam && options.some((o) => o.id === orderParam) ? orderParam : null;
    if (orderParam && !defaultOrderId) {
      // An order bought with another email, opened from its private link
      const linked = await orderFromLink(orderParam, tokenParam);
      if (linked) {
        options.unshift({ id: linked.id, label: `#${shortId(linked.id)} (${orderStatusLabel[linked.status]})` });
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
        title="الدعم الفني"
        description="افتح تذكرة وسيرد عليك فريقنا في أقرب وقت. تصلك رسالة على بريدك عند كل رد، ويمكنك متابعة المحادثة في أي وقت."
      />
      <div className="mx-auto grid max-w-5xl gap-6 px-4 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-labelledby="new-ticket" className="card p-5 sm:p-7">
          <h2 id="new-ticket" className="mb-5 text-lg font-bold">
            تذكرة جديدة
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
                <span className="block text-sm font-bold">تذاكري</span>
                <span className="block text-xs text-muted">تابع تذاكرك السابقة وردود الدعم</span>
              </span>
            </Link>
          ) : (
            <div className="card flex items-start gap-3 p-4">
              <IconUser className="mt-0.5 size-5 shrink-0 text-volt" />
              <p className="text-sm leading-7 text-muted">
                لديك حساب؟{" "}
                <Link href="/login?next=/support" className="font-semibold text-text underline decoration-volt underline-offset-4">
                  سجّل الدخول
                </Link>{" "}
                لتربط التذكرة بطلباتك وتتابع كل تذاكرك من حسابك.
              </p>
            </div>
          )}
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <IconClock className="mt-0.5 size-5 shrink-0 text-volt" />
            <p className="text-sm leading-7 text-muted">نرد عادةً خلال ساعات قليلة، على مدار الأسبوع.</p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <IconChat className="mt-0.5 size-5 shrink-0 text-volt" />
            <p className="text-sm leading-7 text-muted">
              لسؤال سريع جرّب{" "}
              <Link href="/faq" className="text-text underline decoration-volt underline-offset-4">
                الأسئلة الشائعة
              </Link>{" "}
              أو{" "}
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-text underline decoration-volt underline-offset-4">
                واتساب
              </a>
              .
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
