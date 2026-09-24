import "server-only";
import type { Locale } from "./config";

// Customer email copy (order delivered, sign-in code, ticket created/reply) in both languages.
// Values that go into HTML are escaped by the caller before they reach these templates, except
// where noted (`*Html` parameters are already-escaped HTML).

type EmailCopy = {
  dir: "rtl" | "ltr";
  align: "right" | "left";
  /** Alignment of the quantity column in the order table (the side opposite the text). */
  qtyAlign: "left" | "right";
  order: {
    subject: (shortId: string) => string;
    greeting: (nameHtml: string | null) => string;
    thanks: (shortId: string) => string;
    security: string;
    total: string;
    button: string;
    fallback: string;
    private: string;
    textReady: (shortId: string) => string;
    textView: string;
  };
  code: {
    subject: (code: string) => string;
    lead: string;
    note: string;
    text: (code: string) => string;
  };
  ticket: {
    subject: (kind: "created" | "reply", shortId: string) => string;
    leadHtml: (kind: "created" | "reply", shortId: string) => string;
    leadText: (kind: "created" | "reply", shortId: string) => string;
    cta: (kind: "created" | "reply") => string;
    hello: string;
    subjectLabel: string;
    privacy: string;
    textRead: string;
  };
  fallback: string;
  private: string;
};

const ar: EmailCopy = {
  dir: "rtl",
  align: "right",
  qtyAlign: "left",
  order: {
    subject: (shortId) => `طلبك رقم #${shortId} جاهز - Nitro Store`,
    greeting: (nameHtml) => (nameHtml ? `مرحباً ${nameHtml}،` : "مرحباً،"),
    thanks: (shortId) => `شكراً لشرائك! تم تجهيز طلبك رقم <strong>#${shortId}</strong> وأصبح جاهزاً للاستلام.`,
    security: "لأمان مشترياتك، لا نرسل الأكواد أو بيانات الحسابات عبر البريد. اضغط على الزر أدناه لعرضها في صفحة طلبك الخاصة.",
    total: "الإجمالي",
    button: "عرض طلبي واستلام المنتجات",
    fallback: "إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:",
    private: "هذا الرابط خاص بك، لا تشاركه مع أحد.",
    textReady: (shortId) => `تم تجهيز طلبك رقم #${shortId} وأصبح جاهزاً للاستلام.`,
    textView: "اعرض الأكواد وبيانات الحسابات من صفحة طلبك الخاصة:",
  },
  code: {
    subject: (code) => `رمز الدخول: ${code} - Nitro Store`,
    lead: "رمز الدخول إلى حسابك:",
    note: "صالح لمدة 10 دقائق. إذا لم تطلب هذا الرمز فتجاهل الرسالة، ولا تشاركه مع أحد.",
    text: (code) => `رمز الدخول إلى حسابك في Nitro Store: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`,
  },
  ticket: {
    subject: (kind, shortId) =>
      kind === "reply" ? `رد جديد على تذكرتك #${shortId} - Nitro Store` : `استلمنا تذكرتك #${shortId} - Nitro Store`,
    leadHtml: (kind, shortId) =>
      kind === "reply"
        ? `ردّ فريق الدعم على تذكرتك رقم <strong>#${shortId}</strong>.`
        : `استلمنا تذكرتك رقم <strong>#${shortId}</strong> وسنرد عليك في أقرب وقت.`,
    leadText: (kind, shortId) =>
      kind === "reply" ? `ردّ فريق الدعم على تذكرتك رقم #${shortId}.` : `استلمنا تذكرتك رقم #${shortId} وسنرد عليك في أقرب وقت.`,
    cta: (kind) => (kind === "reply" ? "عرض الرد" : "متابعة التذكرة"),
    hello: "مرحباً،",
    subjectLabel: "الموضوع:",
    privacy: "لحماية بياناتك لا نرسل محتوى الرسائل عبر البريد. اضغط الزر أدناه لقراءة المحادثة والرد عليها.",
    textRead: "اقرأ المحادثة ورد عليها من هنا:",
  },
  fallback: "إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:",
  private: "هذا الرابط خاص بك، لا تشاركه مع أحد.",
};

const en: EmailCopy = {
  dir: "ltr",
  align: "left",
  qtyAlign: "right",
  order: {
    subject: (shortId) => `Your order #${shortId} is ready - Nitro Store`,
    greeting: (nameHtml) => (nameHtml ? `Hi ${nameHtml},` : "Hi,"),
    thanks: (shortId) => `Thanks for your purchase! Your order <strong>#${shortId}</strong> is ready to collect.`,
    security:
      "To keep your purchase safe, we never send codes or account details by email. Use the button below to view them on your private order page.",
    total: "Total",
    button: "View my order and products",
    fallback: "If the button doesn't work, copy this link into your browser:",
    private: "This link is private — don't share it with anyone.",
    textReady: (shortId) => `Your order #${shortId} is ready to collect.`,
    textView: "View your codes and account details on your private order page:",
  },
  code: {
    subject: (code) => `Your sign-in code: ${code} - Nitro Store`,
    lead: "Your sign-in code:",
    note: "Valid for 10 minutes. If you didn't request this code, you can ignore this email — and never share it with anyone.",
    text: (code) => `Your Nitro Store sign-in code: ${code}\nValid for 10 minutes. Never share it with anyone.`,
  },
  ticket: {
    subject: (kind, shortId) =>
      kind === "reply" ? `New reply to your ticket #${shortId} - Nitro Store` : `We received your ticket #${shortId} - Nitro Store`,
    leadHtml: (kind, shortId) =>
      kind === "reply"
        ? `Our support team has replied to your ticket <strong>#${shortId}</strong>.`
        : `We've received your ticket <strong>#${shortId}</strong> and will get back to you as soon as possible.`,
    leadText: (kind, shortId) =>
      kind === "reply"
        ? `Our support team has replied to your ticket #${shortId}.`
        : `We've received your ticket #${shortId} and will get back to you as soon as possible.`,
    cta: (kind) => (kind === "reply" ? "View reply" : "Follow your ticket"),
    hello: "Hi,",
    subjectLabel: "Subject:",
    privacy: "To protect your data, we don't send message contents by email. Use the button below to read the conversation and reply.",
    textRead: "Read the conversation and reply here:",
  },
  fallback: "If the button doesn't work, copy this link into your browser:",
  private: "This link is private — don't share it with anyone.",
};

export function emailCopy(locale: Locale): EmailCopy {
  return locale === "en" ? en : ar;
}
