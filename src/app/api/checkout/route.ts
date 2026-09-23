import { z } from "zod";
import type Stripe from "stripe";
import type { ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/crypto";
import { getStripe, isStripeEnabled } from "@/lib/stripe";
import { fulfillOrder, markOrderPaid } from "@/lib/fulfillment";
import { orderPagePath, siteUrl } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LINES = 20;
const MAX_QUANTITY = 10;
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60_000; // per minute, per IP
// Stripe requires expires_at to be at least 30 minutes away; one extra minute absorbs clock skew
const SESSION_TTL_SECONDS = 31 * 60;

const bodySchema = z.object({
  email: z
    .string({ error: "البريد الإلكتروني مطلوب" })
    .trim()
    .toLowerCase()
    .max(254, { error: "البريد الإلكتروني طويل جداً" })
    .pipe(z.email({ error: "البريد الإلكتروني غير صالح" })),
  items: z
    .array(
      z.object({
        variantId: z.string({ error: "منتج غير صالح في السلة" }).trim().min(1, { error: "منتج غير صالح في السلة" }).max(64),
        quantity: z
          .number({ error: "الكمية غير صالحة" })
          .int({ error: "الكمية يجب أن تكون رقماً صحيحاً" })
          .min(1, { error: "أقل كمية هي 1" })
          .max(MAX_QUANTITY, { error: `أقصى كمية للمنتج الواحد هي ${MAX_QUANTITY}` }),
      }),
      { error: "السلة غير صالحة" },
    )
    .min(1, { error: "السلة فارغة" })
    .max(MAX_LINES, { error: `لا يمكن أن تحتوي السلة على أكثر من ${MAX_LINES} منتجاً` }),
}, { error: "بيانات الطلب غير صالحة" });

function jsonError(error: string, status: number, headers?: HeadersInit) {
  return Response.json({ error }, { status, headers });
}

// ---- Basic in-memory rate limit (per instance; good enough for a single Railway service) ----
type Bucket = { count: number; resetAt: number };
const rateLimitStore = globalThis as unknown as { __nitroCheckoutRateLimit?: Map<string, Bucket> };
const buckets = (rateLimitStore.__nitroCheckoutRateLimit ??= new Map<string, Bucket>());

function clientIp(req: Request): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

/** Returns seconds to wait when the IP is over the limit, otherwise 0. */
function rateLimit(ip: string): number {
  const now = Date.now();
  if (buckets.size > 5_000) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  }
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return 0;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

type Line = {
  variantId: string;
  quantity: number;
  productName: string;
  variantLabel: string;
  productType: ProductType;
  unitPriceCents: number;
  imageUrl: string | null;
};

export async function POST(req: Request) {
  const retryAfter = rateLimit(clientIp(req));
  if (retryAfter > 0) {
    return jsonError("طلبات كثيرة جداً، يرجى المحاولة بعد دقيقة", 429, { "Retry-After": String(retryAfter) });
  }

  const stripeEnabled = isStripeEnabled();
  if (!stripeEnabled && process.env.NODE_ENV === "production") {
    return jsonError("الدفع غير متاح حالياً، يرجى المحاولة لاحقاً", 503);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("طلب غير صالح", 400);
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "بيانات الطلب غير صالحة", 400);
  }
  const { email } = parsed.data;

  // Merge duplicate lines for the same variant
  const quantities = new Map<string, number>();
  for (const item of parsed.data.items) {
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  }

  try {
    const variants = await prisma.productVariant.findMany({
      where: { id: { in: [...quantities.keys()] } },
      include: { product: { select: { name: true, type: true, active: true, imageUrl: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    const lines: Line[] = [];
    for (const [variantId, quantity] of quantities) {
      const variant = byId.get(variantId);
      if (!variant) {
        return jsonError("أحد المنتجات في السلة لم يعد متوفراً، يرجى تحديث السلة", 400);
      }
      const { product } = variant;
      if (!product.active) {
        return jsonError(`المنتج "${product.name}" غير متاح حالياً، يرجى إزالته من السلة`, 400);
      }
      if (quantity > MAX_QUANTITY) {
        return jsonError(`أقصى كمية من "${product.name} - ${variant.label}" هي ${MAX_QUANTITY}`, 400);
      }
      lines.push({
        variantId,
        quantity,
        productName: product.name,
        variantLabel: variant.label,
        productType: product.type,
        unitPriceCents: variant.priceCents,
        imageUrl: product.imageUrl,
      });
    }

    const currencies = new Set(variants.map((v) => v.currency.toUpperCase()));
    if (currencies.size !== 1) {
      return jsonError("لا يمكن الدفع لمنتجات بعملات مختلفة في طلب واحد", 400);
    }
    const currency = [...currencies][0];

    // Stock check for delivered-from-stock products (SERVICE is delivered manually)
    const stockLines = lines.filter((line) => line.productType !== "SERVICE");
    if (stockLines.length > 0) {
      const counts = await prisma.inventoryItem.groupBy({
        by: ["variantId"],
        where: { variantId: { in: stockLines.map((line) => line.variantId) }, status: "AVAILABLE" },
        _count: { _all: true },
      });
      const available = new Map(counts.map((c) => [c.variantId, c._count._all]));
      for (const line of stockLines) {
        const inStock = available.get(line.variantId) ?? 0;
        if (line.quantity > inStock) {
          return jsonError(
            inStock === 0
              ? `المنتج "${line.productName} - ${line.variantLabel}" نفد من المخزون`
              : `الكمية المطلوبة من "${line.productName} - ${line.variantLabel}" غير متوفرة، المتوفر حالياً: ${inStock}`,
            409,
          );
        }
      }
    }

    const totalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);

    const customer = await prisma.customer.upsert({
      where: { email },
      create: { email },
      update: {},
      select: { id: true },
    });

    const order = await prisma.order.create({
      data: {
        accessToken: randomToken(),
        customerId: customer.id,
        status: "PENDING",
        totalCents,
        currency,
        items: {
          create: lines.map((line) => ({
            variantId: line.variantId,
            productName: line.productName,
            variantLabel: line.variantLabel,
            productType: line.productType,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
          })),
        },
      },
      select: { id: true, accessToken: true },
    });

    if (!stripeEnabled) {
      // Dev mode (never in production): no real charge, deliver immediately
      await markOrderPaid(order.id);
      try {
        await fulfillOrder(order.id);
      } catch (err) {
        console.error(`[checkout] Dev-mode fulfillment failed for order ${order.id}`, err);
      }
      return Response.json({ url: orderPagePath(order) });
    }

    const site = siteUrl();
    let session: Stripe.Checkout.Session;
    try {
      session = await getStripe().checkout.sessions.create(
        {
          mode: "payment",
          line_items: lines.map((line) => ({
            quantity: line.quantity,
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: line.unitPriceCents,
              product_data: {
                name: `${line.productName} - ${line.variantLabel}`,
                ...(line.imageUrl?.startsWith("https://") ? { images: [line.imageUrl] } : {}),
              },
            },
          })),
          customer_email: email,
          client_reference_id: order.id,
          metadata: { orderId: order.id },
          payment_intent_data: { metadata: { orderId: order.id } },
          success_url: `${site}${orderPagePath(order)}`,
          cancel_url: `${site}/cart`,
          expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
          locale: "auto",
        },
        { idempotencyKey: `checkout-session-${order.id}` },
      );
    } catch (err) {
      console.error(`[checkout] Stripe session creation failed for order ${order.id}`, err);
      await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED" } });
      return jsonError("تعذر بدء عملية الدفع، يرجى المحاولة مرة أخرى", 502);
    }

    if (!session.url) {
      await prisma.order.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "FAILED" } });
      return jsonError("تعذر بدء عملية الدفع، يرجى المحاولة مرة أخرى", 502);
    }

    await prisma.order.update({ where: { id: order.id }, data: { stripeSessionId: session.id } });
    return Response.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Unexpected error", err);
    return jsonError("حدث خطأ غير متوقع، يرجى المحاولة مرة أخرى", 500);
  }
}
