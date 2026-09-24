import { formatPrice } from "@/lib/format";

export { StockIndicator, TypeBadge } from "./labels";
export { LOW_STOCK_THRESHOLD, type StockState, stockState } from "./stock";

/** Prices are Latin-digit, LTR runs isolated from the surrounding Arabic text. */
export function Price({
  cents,
  currency,
  className = "",
}: {
  cents: number;
  currency: string;
  className?: string;
}) {
  return (
    <span dir="ltr" className={`font-display font-bold tabular-nums ${className}`}>
      {formatPrice(cents, currency)}
    </span>
  );
}

export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  action,
}: {
  index?: string;
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="max-w-2xl">
        <p className="flex items-center gap-2 text-xs font-bold text-volt">
          <span className="h-px w-6 bg-volt" aria-hidden="true" />
          <span dir="ltr" className="font-display tracking-[0.2em] uppercase">
            {index ? `${index} / ` : ""}
            {eyebrow}
          </span>
        </p>
        <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-7 text-muted sm:text-base">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-volt/10 text-volt ring-1 ring-volt/20">{icon}</div>
      <h3 className="text-lg font-bold">{title}</h3>
      {description ? <p className="max-w-md text-sm leading-7 text-muted">{description}</p> : null}
      {children ? <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_85%_0%,rgba(212,255,61,0.10),transparent_60%)]"
      />
      <div className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="flex items-center gap-2 text-xs font-bold text-volt">
          <span className="h-px w-6 bg-volt" aria-hidden="true" />
          <span dir="ltr" className="font-display tracking-[0.2em] uppercase">
            {eyebrow}
          </span>
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">{description}</p> : null}
        {children}
      </div>
    </header>
  );
}
