import { formatPrice } from "@/lib/format";
import { CopyButton } from "./copy-button";
import { IconChat, IconGift } from "./icons";
import { WALLET_CURRENCY } from "./site";

export type ReferralCardData = {
  /** Null while the program is switched off. */
  link: string | null;
  rule: string;
  invited: number;
  rewarded: number;
  pending: number;
  earnedCents: number;
};

/** "Invite your friends" card on /account: share link, rule and the customer's referral totals. */
export function ReferralCard({ data }: { data: ReferralCardData }) {
  const whatsapp = data.link
    ? `https://wa.me/?text=${encodeURIComponent(`تسوّق بطاقات الألعاب والاشتراكات من Nitro Store بتسليم فوري: ${data.link}`)}`
    : null;
  const stats = [
    { label: "أصدقاء دعوتهم", value: String(data.invited) },
    { label: "مكافآت مستحقة", value: String(data.rewarded) },
    { label: "إجمالي الأرباح", value: formatPrice(data.earnedCents, WALLET_CURRENCY) },
  ];

  return (
    <section id="referral" aria-labelledby="referral-title" className="card relative mt-4 scroll-mt-32 overflow-hidden p-5 sm:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_120%_at_0%_0%,rgba(212,255,61,0.08),transparent_60%)]"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-volt/10 text-volt ring-1 ring-volt/20">
            <IconGift className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="referral-title" className="font-bold">
              ادعُ أصدقاءك
            </h2>
            <p className="mt-0.5 text-sm leading-7 text-muted">{data.link ? data.rule : "برنامج الإحالة متوقف مؤقتاً."}</p>
          </div>
        </div>
      </div>

      {data.link ? (
        <div className="relative mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-bg p-2">
            <code dir="ltr" className="min-w-0 flex-1 truncate px-1 text-sm text-text">
              {data.link}
            </code>
            <CopyButton text={data.link} label="نسخ الرابط" />
          </div>
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn-ghost h-11 shrink-0">
              <IconChat className="size-4" />
              مشاركة عبر واتساب
            </a>
          ) : null}
        </div>
      ) : null}

      <dl className="relative mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-xs text-muted">{s.label}</dt>
            <dd dir="ltr" className="mt-1 text-end font-display text-lg font-bold tabular-nums">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>
      {data.pending > 0 ? (
        <p className="relative mt-3 text-xs text-muted">
          <span dir="ltr" className="font-display font-bold text-text">
            {data.pending}
          </span>{" "}
          مكافأة بانتظار تسليم طلب صديقك.
        </p>
      ) : null}
    </section>
  );
}
