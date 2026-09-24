import type { TicketStatus } from "@prisma/client";

const statusStyle: Record<TicketStatus, { label: string; className: string }> = {
  OPEN: { label: "مفتوحة", className: "bg-volt/15 text-volt ring-1 ring-volt/30" },
  ANSWERED: { label: "تم الرد", className: "bg-success/15 text-success ring-1 ring-success/30" },
  CLOSED: { label: "مغلقة", className: "bg-surface-2 text-muted ring-1 ring-border" },
};

export const ticketStatusLabel: Record<TicketStatus, string> = {
  OPEN: statusStyle.OPEN.label,
  ANSWERED: statusStyle.ANSWERED.label,
  CLOSED: statusStyle.CLOSED.label,
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const s = statusStyle[status];
  return <span className={`badge whitespace-nowrap ${s.className}`}>{s.label}</span>;
}
