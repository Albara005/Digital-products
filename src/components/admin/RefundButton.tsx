"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { UndoIcon } from "./icons";
import { btnSm } from "./ui";

export type RefundOption = { method: "ORIGINAL" | "WALLET"; title: string; amount: string; note?: string; disabled?: string };

/**
 * Refund with a choice of destination. Kept mounted after the order turns REFUNDED (`canRefund`
 * false) so the result message survives the page refresh that follows the action.
 */
export function RefundButton({
  action,
  orderId,
  total,
  options,
  canRefund,
}: {
  action: FormAction;
  orderId: string;
  total: string;
  options: RefundOption[];
  canRefund: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const firstEnabled = options.find((o) => !o.disabled)?.method;

  useEffect(() => {
    if (state?.ok) dialogRef.current?.close();
  }, [state]);

  return (
    <div className="flex flex-col items-start gap-2">
      {canRefund && (
        <button type="button" className={btnSm.danger} disabled={pending} onClick={() => dialogRef.current?.showModal()}>
          <UndoIcon className="size-3.5" />
          {pending ? "جارٍ الاسترجاع…" : "استرجاع المبلغ"}
        </button>
      )}
      {state?.ok && (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-xs leading-relaxed text-success">
          {state.message}
        </p>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(92vw,460px)] rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <form action={formAction} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="orderId" value={orderId} />
          <div>
            <h2 id={titleId} className="text-lg font-bold">
              استرجاع الطلب
            </h2>
            <p className="mt-1 text-sm text-muted">
              قيمة الطلب{" "}
              <strong className="font-display text-text" dir="ltr">
                {total}
              </strong>
              . تتغير حالته إلى «مسترجع» وتعود الوحدات المحجوزة غير المسلّمة إلى المخزون. لا يمكن التراجع.
            </p>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="label">إلى أين يعود المبلغ؟</legend>
            {options.map((o) => (
              <label
                key={o.method}
                className={`flex items-start gap-3 rounded-xl border border-border px-3.5 py-3 transition-colors ${
                  o.disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-volt/60 has-[:checked]:border-volt has-[:checked]:bg-volt/5"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={o.method}
                  defaultChecked={o.method === firstEnabled}
                  disabled={Boolean(o.disabled)}
                  className="mt-1 accent-volt"
                />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{o.title}</span>
                    <span className="font-display font-bold" dir="ltr">
                      {o.amount}
                    </span>
                  </span>
                  {(o.disabled || o.note) && <span className="mt-0.5 block text-xs text-muted">{o.disabled ?? o.note}</span>}
                </span>
              </label>
            ))}
          </fieldset>

          {state?.ok === false && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {state.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => dialogRef.current?.close()} disabled={pending} autoFocus>
              إلغاء
            </button>
            <button type="submit" className="btn bg-danger text-white hover:bg-danger/85" disabled={pending || !firstEnabled}>
              {pending ? "جارٍ الاسترجاع…" : "تأكيد الاسترجاع"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
