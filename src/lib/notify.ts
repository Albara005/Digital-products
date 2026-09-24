import "server-only";

export type NotifyEvent =
  | "order.paid"
  | "order.needs_manual_delivery"
  | "stock.low"
  | "ticket.new"
  | "ticket.reply"
  | "review.new"
  | "refund.done"
  | "topup.paid";

/**
 * Sends a short Arabic message to the store owner's Telegram chat. Never throws and never blocks
 * the caller for long. No-op when TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are unset.
 * Never include codes, credentials or customer secrets in `text`.
 */
export async function notifyAdmin(event: NotifyEvent, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) {
    if (process.env.NODE_ENV !== "production") console.info(`[notify:${event}] ${text}`);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) console.error(`[notify] Telegram rejected ${event}: ${res.status}`);
  } catch (err) {
    console.error(`[notify] Telegram send failed for ${event}:`, err);
  }
}
