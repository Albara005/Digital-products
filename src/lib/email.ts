import "server-only";
import { mailProvider, sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { type Locale, localized, localizePath } from "@/i18n/config";
import { emailCopy } from "@/i18n/emails";
import { getEmailLocale } from "@/i18n/server";

/** Public base URL of the store, without a trailing slash. */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
}

/** Path of the customer's order page. The token is the only thing that unlocks the delivered codes. */
export function orderPagePath(order: { id: string; accessToken: string }): string {
  return `/order/${order.id}?token=${encodeURIComponent(order.accessToken)}`;
}

export function orderPageUrl(order: { id: string; accessToken: string }, locale: Locale = "ar"): string {
  return `${siteUrl()}${localizePath(orderPagePath(order), locale)}`;
}

export function escapeHtml(value: string): string {
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
 * The language is the storefront's when the delivery happens inside the shopper's own request
 * (instant delivery at checkout); otherwise (webhooks, admin delivery) Arabic.
 * Never throws; failures are logged so fulfillment is not affected.
 */
export async function sendOrderDeliveredEmail(orderId: string, locale?: Locale): Promise<void> {
  try {
    const lang = locale ?? (await getEmailLocale());
    const c = emailCopy(lang);
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { email: true, name: true } },
        items: {
          select: {
            productName: true,
            variantLabel: true,
            quantity: true,
            variant: { select: { labelEn: true, product: { select: { nameEn: true } } } },
          },
        },
      },
    });
    if (!order) {
      console.warn(`[email] Order ${orderId} not found; delivery email not sent`);
      return;
    }

    const link = orderPageUrl(order, lang);
    if (!mailProvider()) {
      console.info(`[email] No email provider configured. Delivery link for order ${order.id} (${order.customer.email}): ${link}`);
      return;
    }

    const shortId = order.id.slice(-8).toUpperCase();
    const subject = c.order.subject(shortId);
    const items = order.items.map((item) => ({
      name: localized(lang, item.productName, item.variant.product.nameEn),
      label: localized(lang, item.variantLabel, item.variant.labelEn),
      quantity: item.quantity,
    }));
    const itemsHtml = items
      .map(
        (item) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;">${escapeHtml(item.name)} - ${escapeHtml(item.label)}</td>` +
          `<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:${c.qtyAlign};">× ${item.quantity}</td></tr>`,
      )
      .join("");
    const total = formatPrice(order.totalCents, order.currency, lang); // the order's own charged currency
    const greeting = c.order.greeting(order.customer.name ? escapeHtml(order.customer.name) : null);

    const html = `<!doctype html>
<html lang="${lang}" dir="${c.dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Tahoma,Arial,sans-serif;direction:${c.dir};text-align:${c.align};color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;" dir="${c.dir}">
        <tr><td style="font-size:22px;font-weight:bold;padding-bottom:16px;">Nitro Store</td></tr>
        <tr><td style="font-size:16px;line-height:1.8;">
          <p style="margin:0 0 12px;">${greeting}</p>
          <p style="margin:0 0 12px;">${c.order.thanks(shortId)}</p>
          <p style="margin:0 0 20px;">${c.order.security}</p>
        </td></tr>
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:8px;">${itemsHtml}</table>
          <p style="font-size:14px;margin:8px 0 24px;">${c.order.total}: <strong dir="ltr">${escapeHtml(total)}</strong></p>
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:#0a0a0a;color:#d4ff3d;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:16px;font-weight:bold;">${c.order.button}</a>
        </td></tr>
        <tr><td style="font-size:12px;color:#666;line-height:1.7;">
          <p style="margin:0 0 8px;">${c.order.fallback}</p>
          <p style="margin:0 0 16px;direction:ltr;text-align:left;word-break:break-all;"><a href="${escapeHtml(link)}" style="color:#0a0a0a;">${escapeHtml(link)}</a></p>
          <p style="margin:0;">${c.order.private}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = [
      c.order.greeting(order.customer.name),
      c.order.textReady(shortId),
      ...items.map((item) => `- ${item.name} - ${item.label} × ${item.quantity}`),
      `${c.order.total}: ${total}`,
      c.order.textView,
      link,
      c.order.private,
    ].join("\n");

    // The idempotency key guards against double emails (Resend only)
    await sendMail({ to: order.customer.email, subject, html, text, idempotencyKey: `order-delivered-${order.id}` });
  } catch (err) {
    console.error(`[email] Failed to send delivery email for order ${orderId}:`, err);
  }
}

/** Sign-in code for customer accounts. Returns false if sending failed so the caller can tell the user. */
export async function sendSignInCodeEmail(email: string, code: string, locale: Locale = "ar"): Promise<boolean> {
  const c = emailCopy(locale);
  if (!mailProvider()) {
    console.info(`[email] No email provider configured. Sign-in code for ${email}: ${code}`);
    return true;
  }
  const subject = c.code.subject(code);
  const html = `<!doctype html>
<html lang="${locale}" dir="${c.dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Tahoma,Arial,sans-serif;direction:${c.dir};text-align:${c.align};color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;" dir="${c.dir}">
        <tr><td style="font-size:22px;font-weight:bold;padding-bottom:16px;">Nitro Store</td></tr>
        <tr><td style="font-size:16px;line-height:1.8;">
          <p style="margin:0 0 16px;">${c.code.lead}</p>
          <p style="margin:0 0 16px;font-size:32px;font-weight:bold;letter-spacing:8px;direction:ltr;text-align:center;background:#0a0a0a;color:#d4ff3d;border-radius:8px;padding:16px;">${escapeHtml(code)}</p>
          <p style="margin:0;font-size:13px;color:#666;">${c.code.note}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return (await sendMail({ to: email, subject, html, text: c.code.text(code) })) !== "failed";
}
