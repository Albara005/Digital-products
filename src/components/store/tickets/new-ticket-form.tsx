"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { type NewTicketState, createTicketAction } from "@/app/(store)/support/actions";
import { useLocalePath, useT } from "@/i18n/client";
import { CopyButton } from "../copy-button";
import { IconAlert, IconArrow, IconCheck, IconSpinner } from "../icons";
import Link from "../link";
import { MAX_TICKET_BODY, MAX_TICKET_SUBJECT } from "../site";

export type TicketFormMode =
  | { kind: "customer"; email: string; orders: { id: string; label: string }[]; defaultOrderId: string | null }
  | { kind: "guest" }
  /** A guest who came from an order page: the order (and its email) are verified by its token. */
  | { kind: "guest-order"; orderId: string; orderToken: string; orderLabel: string; maskedEmail: string };

export function NewTicketForm({ mode }: { mode: TicketFormMode }) {
  const id = useId();
  const t = useT();
  const localePath = useLocalePath();
  const [state, dispatch, pending] = useActionState<NewTicketState, FormData>(createTicketAction, null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [orderId, setOrderId] = useState(mode.kind === "customer" ? (mode.defaultOrderId ?? "") : "");

  // Dispatch from onSubmit once hydrated so React doesn't reset the fields after an error.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  if (state?.ok && state.link) {
    // Only rendered after a submission, so reading window here never affects hydration
    const url = new URL(localePath(state.link), window.location.href).toString();
    return (
      <div role="status" className="space-y-4">
        <p className="flex items-center gap-2 text-lg font-bold text-success">
          <IconCheck className="size-5 shrink-0" />
          {t.ticketForm.sent}
        </p>
        <p className="text-sm leading-7 text-muted">{t.ticketForm.saveLink}</p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg p-2">
          <code dir="ltr" className="min-w-0 flex-1 truncate px-1 text-xs text-muted">
            {url}
          </code>
          <CopyButton text={url} label={t.copy.copyLink} />
        </div>
        <Link href={state.link} className="btn-primary">
          {t.ticketForm.openTicket}
          <IconArrow className="size-4" />
        </Link>
      </div>
    );
  }

  const error = state && !state.ok ? state : null;

  return (
    <form action={dispatch} onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode.kind === "guest-order" ? (
        <>
          <input type="hidden" name="orderId" value={mode.orderId} />
          <input type="hidden" name="orderToken" value={mode.orderToken} />
          <p className="rounded-lg border border-volt/25 bg-volt/[0.06] p-3 text-sm leading-7">
            {t.ticketForm.aboutOrder}{" "}
            <span dir="ltr" className="font-display font-bold">
              {mode.orderLabel}
            </span>
            {t.ticketForm.replyToOrderEmail}{" "}
            <bdi dir="ltr" className="font-semibold">
              {mode.maskedEmail}
            </bdi>
            .
          </p>
        </>
      ) : null}

      {mode.kind === "guest" ? (
        <div>
          <label htmlFor={`${id}-email`} className="label">
            {t.ticketForm.yourEmail}
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error?.field === "email" ? true : undefined}
            placeholder="you@example.com"
            className="input h-11 text-start"
          />
          <p className="mt-1.5 text-xs text-muted">{t.ticketForm.emailHint}</p>
        </div>
      ) : null}

      {mode.kind === "customer" ? (
        <div>
          <label htmlFor={`${id}-order`} className="label">
            {t.ticketForm.order} <span className="font-normal">{t.ticketForm.optional}</span>
          </label>
          <select
            id={`${id}-order`}
            name="orderId"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            aria-invalid={error?.field === "orderId" ? true : undefined}
            className="input h-11"
          >
            <option value="">{t.ticketForm.noOrder}</option>
            {mode.orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted">
            {t.ticketForm.replyToAccount}{" "}
            <bdi dir="ltr" className="font-semibold text-text">
              {mode.email}
            </bdi>
            .
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor={`${id}-subject`} className="label">
          {t.ticketForm.subject}
        </label>
        <input
          id={`${id}-subject`}
          name="subject"
          type="text"
          required
          minLength={3}
          maxLength={MAX_TICKET_SUBJECT}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          aria-invalid={error?.field === "subject" ? true : undefined}
          placeholder={t.ticketForm.subjectPlaceholder}
          className="input h-11"
        />
      </div>

      <div>
        <label htmlFor={`${id}-body`} className="label">
          {t.ticketForm.message}
        </label>
        <textarea
          id={`${id}-body`}
          name="body"
          rows={6}
          required
          maxLength={MAX_TICKET_BODY}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={error?.field === "body" ? true : undefined}
          placeholder={t.ticketForm.messagePlaceholder}
          className="input resize-y leading-7"
        />
        <p className="mt-1 text-end text-[11px] text-muted">
          <span dir="ltr" className="font-display tabular-nums">
            {body.length}/{MAX_TICKET_BODY}
          </span>
        </p>
      </div>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary h-12 w-full text-base sm:w-auto">
        {pending ? (
          <>
            <IconSpinner className="size-4" />
            {t.ticketForm.sending}
          </>
        ) : (
          <>
            {t.ticketForm.submit}
            <IconArrow className="size-4" />
          </>
        )}
      </button>
    </form>
  );
}
