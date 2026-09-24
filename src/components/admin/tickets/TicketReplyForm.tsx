"use client";

import { useState } from "react";
import type { FormAction } from "@/app/admin/_lib/form-state";
import { MAX_TICKET_BODY } from "@/components/store/site";
import { SendIcon } from "../icons";
import { FieldError, FormMessage } from "../ui";
import { useFormAction } from "../useFormAction";

/** Admin reply box; clears itself after a successful send (remount on the success stamp). */
export function TicketReplyForm({ action, ticketId }: { action: FormAction; ticketId: string }) {
  const [state, form, pending] = useFormAction(action);
  return (
    <form {...form} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="ticketId" value={ticketId} />
      <label htmlFor="ticket-reply" className="text-xs font-medium text-muted">
        الرد على العميل — يصله إشعار بالبريد (بدون نص الرسالة) ويقرأ الرد من رابط التذكرة
      </label>
      <ReplyField key={state?.ts ?? "initial"} />
      <FieldError state={state} name="body" />
      {state && !state.errors && <FormMessage state={state} />}
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          <SendIcon className="size-4 rtl:-scale-x-100" />
          {pending ? "جارٍ الإرسال…" : "إرسال الرد"}
        </button>
      </div>
    </form>
  );
}

function ReplyField() {
  const [value, setValue] = useState("");
  return (
    <>
      <textarea
        id="ticket-reply"
        name="body"
        rows={5}
        maxLength={MAX_TICKET_BODY}
        dir="auto"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="input resize-y leading-relaxed"
        placeholder="اكتب ردك…"
      />
      <p className="text-end font-display text-[11px] text-muted tabular-nums" dir="ltr">
        {value.length}/{MAX_TICKET_BODY}
      </p>
    </>
  );
}
