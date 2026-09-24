import type { TicketAuthor, TicketStatus } from "@prisma/client";
import { IconHeadset, IconUser } from "../icons";
import { LocalTime } from "../local-time";

// Presentational pieces shared by the guest thread (/support/t/[id]) and the account thread.
// Message bodies are plain text: React escapes them, `whitespace-pre-wrap` keeps line breaks,
// and nothing is ever linkified or rendered as HTML.

const statusCopy: Record<TicketStatus, { label: string; tone: string }> = {
  OPEN: { label: "بانتظار الرد", tone: "bg-volt/10 text-volt ring-volt/30" },
  ANSWERED: { label: "تم الرد", tone: "bg-success/10 text-success ring-success/30" },
  CLOSED: { label: "مغلقة", tone: "bg-surface-2 text-muted ring-border" },
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const s = statusCopy[status];
  return <span className={`badge whitespace-nowrap ring-1 ring-inset ${s.tone}`}>{s.label}</span>;
}

export const shortTicketId = (id: string) => id.slice(-8).toUpperCase();

export type ThreadMessage = { id: string; author: TicketAuthor; body: string; createdAt: Date };

export function TicketMessages({ messages }: { messages: ThreadMessage[] }) {
  return (
    <ol className="space-y-4" aria-label="الرسائل">
      {messages.map((m) => {
        const staff = m.author === "ADMIN";
        return (
          <li key={m.id} className={`flex gap-3 ${staff ? "" : "flex-row-reverse"}`}>
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full ring-1 ${
                staff ? "bg-volt/10 text-volt ring-volt/25" : "bg-surface-2 text-muted ring-border"
              }`}
              aria-hidden="true"
            >
              {staff ? <IconHeadset className="size-4" /> : <IconUser className="size-4" />}
            </span>
            <div
              className={`min-w-0 max-w-[85%] rounded-2xl border p-4 ${
                staff ? "border-volt/25 bg-volt/[0.05]" : "border-border bg-surface"
              }`}
            >
              <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <span className={`font-bold ${staff ? "text-volt" : "text-text"}`}>{staff ? "فريق الدعم" : "أنت"}</span>
                <span aria-hidden="true">·</span>
                <LocalTime iso={m.createdAt.toISOString()} />
              </p>
              <p dir="auto" className="mt-2 text-sm leading-7 break-words whitespace-pre-wrap">
                {m.body}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
