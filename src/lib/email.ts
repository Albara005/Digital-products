import "server-only";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";

/** Public base URL of the store, without a trailing slash. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/** Path of the customer's order page. The token is the only thing that unlocks the delivered codes. */
export function orderPagePath(order: { id: string; accessToken: string }): string {
  return `/order/${order.id}?token=${encodeURIComponent(order.accessToken)}`;
}

export function orderPageUrl(order: { id: string; accessToken: string }): string {
  return `${siteUrl()}${orderPagePath(order)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Tells the customer their order is ready. The email carries only the private order link:
 * codes and credentials are revealed on the order page, never in the mailbox.
 * Never throws; failures are logged so fulfillment is not affected.
 */
export async function sendOrderDeliveredEmail(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { email: true, name: true } },
        items: { select: { productName: true, variantLabel: true, quantity: true } },
      },
    });
    if (!order) {
      console.warn(`[email] Order ${orderId} not found; delivery email not sent`);
      return;
    }

    const link = orderPageUrl(order);
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      console.info(`[email] RESEND_API_KEY not set. Delivery link for order ${order.id} (${order.customer.email}): ${link}`);
      return;
    }

    const shortId = order.id.slice(-8).toUpperCase();
    const subject = `طلبك رقم #${shortId} جاهز - Nitro Store`;
    const itemsHtml = order.items
      .map(
        (item) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(item.productName)} - ${escapeHtml(item.variantLabel)}</td>` +
          `<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:left;">× ${item.quantity}</td></tr>`,
      )
      .join("");
    const total = formatPrice(order.totalCents, order.currency);
    const greeting = order.customer.name ? `مرحباً ${escapeHtml(order.customer.name)}،` : "مرحباً،";

    const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;" dir="rtl">
        <tr><td style="font-size:22px;font-weight:bold;padding-bottom:16px;">Nitro Store</td></tr>
        <tr><td style="font-size:16px;line-height:1.8;">
          <p style="margin:0 0 12px;">${greeting}</p>
          <p style="margin:0 0 12px;">شكراً لشرائك! تم تجهيز طلبك رقم <strong>#${shortId}</strong> وأصبح جاهزاً للاستلام.</p>
          <p style="margin:0 0 20px;">لأمان مشترياتك، لا نرسل الأكواد أو بيانات الحسابات عبر البريد. اضغط على الزر أدناه لعرضها في صفحة طلبك الخاصة.</p>
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:8px;">${itemsHtml}</table>
          <p style="font-size:14px;margin:8px 0 24px;">الإجمالي: <strong dir="ltr">${escapeHtml(total)}</strong></p>
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;">عرض طلبي واستلام المنتجات</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#666;line-height:1.7;">
          <p style="margin:0 0 8px;">إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:</p>
          <p style="margin:0 0 16px;direction:ltr;text-align:left;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#6d28d9;">${escapeHtml(link)}</a></p>
          <p style="margin:0;">هذا الرابط خاص بك، لا تشاركه مع أحد.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      greeting,
      `تم تجهيز طلبك رقم #${shortId} وأصبح جاهزاً للاستلام.`,
      ...order.items.map((item) => `- ${item.productName} - ${item.variantLabel} × ${item.quantity}`),
      `الإجمالي: ${total}`,
      "اعرض الأكواد وبيانات الحسابات من صفحة طلبك الخاصة:",
      link,
      "هذا الرابط خاص بك، لا تشاركه مع أحد.",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // Resend drops duplicates with the same key, a second guard against double emails
        "Idempotency-Key": `order-delivered-${order.id}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM?.trim() || "Nitro Store <onboarding@resend.dev>",
        to: [order.customer.email],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend rejected delivery email for order ${order.id}: ${res.status} ${body.slice(0, 500)}`);
    }
  } catch (err) {
    console.error(`[email] Failed to send delivery email for order ${orderId}:`, err);
  }
}
