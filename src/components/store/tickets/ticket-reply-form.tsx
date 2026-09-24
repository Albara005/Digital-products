"use client";

import { startTransition, useActionState, useId, useState } from "react";
import type { TicketStatus } from "@prisma/client";
import { type TicketActionState, closeTicketAction, replyTicketAction } from "@/app/(store)/support/actions";
import { useT } from "@/i18n/client";
import { IconAlert, IconCheck, IconSpinner } from "../icons";
import { MAX_TICKET_BODY } from "../site";

/** Reply box (reopens a closed ticket) and a close button. `token` is set on the guest link page. */
export function TicketReplyForm({ ticketId, token, status }: { ticketId: string; token: string | null; status: TicketStatus }) {
  const id = useId();
  const t = useT();
  const [state, dispatch, pending] = useActionState<TicketActionState, FormData>(replyTicketAction, null);
  const [closeState, closeDispatch, closing] = useActionState<TicketActionState, FormData>(closeTicketAction, null);
  const [body, setBody] = useState("");
  const [sentAt, setSentAt] = useState<number | undefined>(undefined);

  // A successful reply clears the box; an error keeps what the customer typed.
  if (state?.ok && state.ts !== sentAt) {
    setSentAt(state.ts);
    setBody("");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  const hidden = (
    <>
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="token" value={token ?? ""} />
    </>
  );
  // Whichever of the two forms answered last
  const message = state && (!closeState || state.ts >= closeState.ts) ? state : closeState;

  return (
    <div className="space-y-3">
      <form action={dispatch} onSubmit={onSubmit} className="space-y-3">
        {hidden}
        <label htmlFor={`${id}-body`} className="label">
          {status === "CLOSED" ? t.ticketReply.reopenLabel : t.ticketReply.replyLabel}
        </label>
        <textarea
          id={`${id}-body`}
          name="body"
          rows={4}
          required
          maxLength={MAX_TICKET_BODY}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t.ticketReply.placeholder}
          className="input resize-y leading-7"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span dir="ltr" className="font-display text-[11px] text-muted tabular-nums">
            {body.length}/{MAX_TICKET_BODY}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" disabled={pending || closing} className="btn-primary h-10">
              {pending ? (
                <>
                  <IconSpinner className="size-4" />
                  {t.ticketReply.sending}
                </>
              ) : status === "CLOSED" ? (
                t.ticketReply.sendReopen
              ) : (
                t.ticketReply.send
              )}
            </button>
          </div>
        </div>
      </form>

      {status !== "CLOSED" ? (
        <form action={closeDispatch} className="flex justify-end">
          {hidden}
          <button
            type="submit"
            disabled={pending || closing}
            className="text-xs text-muted underline decoration-border underline-offset-4 transition hover:text-text hover:decoration-volt disabled:opacity-50"
          >
            {closing ? t.ticketReply.closing : t.ticketReply.close}
          </button>
        </form>
      ) : null}

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`flex items-start gap-2 text-sm ${message.ok ? "text-success" : "text-danger"}`}
        >
          {message.ok ? <IconCheck className="mt-0.5 size-4 shrink-0" /> : <IconAlert className="mt-0.5 size-4 shrink-0" />}
          {message.message}
        </p>
      ) : null}
    </div>
  );
}
