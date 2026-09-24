import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type MailResult = "sent" | "skipped" | "failed";

type Mail = { to: string; subject: string; html: string; text: string; idempotencyKey?: string };

/** "resend" when RESEND_API_KEY is set, else "smtp" when SMTP_HOST/SMTP_USER/SMTP_PASS are set (e.g. Gmail), else null. */
export function mailProvider(): "resend" | "smtp" | null {
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  if (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()) return "smtp";
  return null;
}

function fromAddress() {
  const configured = process.env.EMAIL_FROM?.trim();
  if (configured) return configured;
  // Gmail only delivers mail "from" the authenticated account
  if (mailProvider() === "smtp") return `Nitro Store <${process.env.SMTP_USER!.trim()}>`;
  return "Nitro Store <onboarding@resend.dev>";
}

let transporter: Transporter | null = null;
function smtp(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST!.trim(),
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER!.trim(), pass: process.env.SMTP_PASS!.replace(/\s+/g, "") },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

/**
 * Sends one email through whichever provider is configured. Never throws.
 * "skipped" means no provider is configured; the caller decides what to log instead.
 */
export async function sendMail(mail: Mail): Promise<MailResult> {
  const provider = mailProvider();
  if (!provider) return "skipped";
  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
          "Content-Type": "application/json",
          ...(mail.idempotencyKey ? { "Idempotency-Key": mail.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: fromAddress(), to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.error(`[email] Resend rejected "${mail.subject}" to ${mail.to}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 300)}`);
        return "failed";
      }
      return "sent";
    }
    await smtp().sendMail({ from: fromAddress(), to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
    return "sent";
  } catch (err) {
    console.error(`[email] Failed to send "${mail.subject}" to ${mail.to} via ${provider}:`, err);
    return "failed";
  }
}
