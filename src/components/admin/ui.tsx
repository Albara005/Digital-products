import Link from "next/link";
import type { ReactNode } from "react";
import type { OrderStatus, ProductType } from "@prisma/client";
import { orderStatusLabel, productTypeLabel } from "@/lib/format";
import type { FormState } from "@/app/admin/_lib/form-state";
import { AlertIcon, CheckIcon, ChevronRightIcon } from "./icons";

// Compact button styles for dense tables/toolbars (mirrors btn-* from globals.css at a smaller size).
const smBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const btnSm = {
  primary: `${smBase} bg-volt text-bg hover:bg-volt-dim`,
  ghost: `${smBase} border border-border text-text hover:border-volt hover:text-volt`,
  danger: `${smBase} border border-danger/40 text-danger hover:bg-danger/10`,
  subtle: `${smBase} text-muted hover:bg-surface-2 hover:text-text`,
} as const;

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs text-muted hover:text-volt">
            <ChevronRightIcon className="size-3.5" />
            {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const statusStyle: Record<OrderStatus, string> = {
  PENDING: "bg-surface-2 text-muted ring-1 ring-border",
  PAID: "bg-volt/15 text-volt ring-1 ring-volt/30",
  FULFILLED: "bg-success/15 text-success ring-1 ring-success/30",
  FAILED: "bg-danger/15 text-danger ring-1 ring-danger/30",
  REFUNDED: "bg-fuchsia/15 text-fuchsia ring-1 ring-fuchsia/30",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge whitespace-nowrap ${statusStyle[status]}`}>{orderStatusLabel[status]}</span>;
}

export function ProductTypeBadge({ type }: { type: ProductType }) {
  return <span className="badge whitespace-nowrap bg-surface-2 text-text ring-1 ring-border">{productTypeLabel[type]}</span>;
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        state.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
      }`}
    >
      {state.ok ? <CheckIcon className="mt-0.5 size-4 shrink-0" /> : <AlertIcon className="mt-0.5 size-4 shrink-0" />}
      <span>{state.message}</span>
    </p>
  );
}

export function FieldError({ state, name }: { state: FormState; name: string }) {
  const error = state?.errors?.[name];
  if (!error) return null;
  return <p className="mt-1 text-xs text-danger">{error}</p>;
}

export function Callout({ tone = "info", children }: { tone?: "info" | "warn" | "success"; children: ReactNode }) {
  const styles = {
    info: "border-border bg-surface-2 text-muted",
    warn: "border-fuchsia/30 bg-fuchsia/10 text-text",
    success: "border-success/30 bg-success/10 text-text",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

/** Table wrapper: horizontal scroll on narrow screens, consistent density. */
export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-start [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted [&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_tbody_tr:hover]:bg-surface-2/60">
        {children}
      </table>
    </div>
  );
}

export function shortId(id: string) {
  return id.slice(-8).toUpperCase();
}
