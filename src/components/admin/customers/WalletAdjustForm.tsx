"use client";

import { useId, useRef, useState } from "react";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { FormMessage } from "../ui";
import { useFormAction } from "../useFormAction";

function usd(cents: number) {
  const [whole, frac] = (Math.abs(cents) / 100).toFixed(2).split(".");
  return `${cents < 0 ? "-" : ""}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${frac}`;
}

/** Mirrors the server parser so the confirm dialog can show the effect; the server re-validates. */
function parseSignedCents(raw: string): number | null {
  const v = raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/[−–]/g, "-")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, ".");
  if (!/^[+-]?\d{1,5}(\.\d{1,2})?$/.test(v)) return null;
  const sign = v.startsWith("-") ? -1 : 1;
  const [whole, frac = ""] = v.replace(/^[+-]/, "").split(".");
  const cents = sign * (Number(whole) * 100 + Number((frac + "00").slice(0, 2)));
  return cents === 0 ? null : cents;
}

/** SUPER_ADMIN wallet credit (+) / debit (−) with a mandatory reason and a confirm step. */
export function WalletAdjustForm({
  action,
  customerId,
  email,
  balanceCents,
}: {
  action: FormAction;
  customerId: string;
  email: string;
  balanceCents: number;
}) {
  const [state, form, pending] = useFormAction(action);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form {...form} ref={formRef} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />
      {/* Remount (clear) the fields after each successful adjustment */}
      <Fields
        key={state?.ts ?? "fields"}
        state={state}
        pending={pending}
        email={email}
        balanceCents={balanceCents}
        submit={() => formRef.current?.requestSubmit()}
      />
    </form>
  );
}

function Fields({
  state,
  pending,
  email,
  balanceCents,
  submit,
}: {
  state: FormState;
  pending: boolean;
  email: string;
  balanceCents: number;
  submit: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const cents = parseSignedCents(amount);
  const after = cents === null ? null : balanceCents + cents;

  const openConfirm = () => {
    if (cents === null) return setLocalError("أدخل مبلغاً بالدولار غير الصفر، مثل 10 للإضافة أو -5.50 للخصم.");
    if (note.trim().length < 3) return setLocalError("اكتب سبب التعديل (3 أحرف على الأقل).");
    if (after !== null && after < 0) return setLocalError(`لا يمكن الخصم: الرصيد الحالي ${usd(balanceCents)} فقط.`);
    setLocalError(null);
    dialogRef.current?.showModal();
  };

  const confirm = () => {
    dialogRef.current?.close();
    submit();
  };

  return (
    <>
      <div>
        <label htmlFor="w-amount" className="label">
          المبلغ (USD)
        </label>
        <input
          id="w-amount"
          name="amount"
          dir="ltr"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="10 أو -5.50"
          className="input text-left font-display"
          aria-invalid={Boolean(state?.errors?.amount)}
          aria-describedby="w-amount-hint"
        />
        <p id="w-amount-hint" className="mt-1 text-xs text-muted">
          موجب لإضافة رصيد، وسالب (بعلامة -) للخصم. لا يمكن أن يصبح الرصيد سالباً.
        </p>
      </div>
      <div>
        <label htmlFor="w-note" className="label">
          السبب
        </label>
        <textarea
          id="w-note"
          name="note"
          rows={2}
          maxLength={200}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثال: تعويض عن كود لا يعمل في الطلب #…"
          className="input resize-y"
          aria-invalid={Boolean(state?.errors?.note)}
        />
        <p className="mt-1 text-xs text-muted">يظهر في سجل المحفظة وسجل النشاط.</p>
      </div>

      {localError ? (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {localError}
        </p>
      ) : (
        <FormMessage state={state} />
      )}

      <div>
        <button type="button" className="btn-primary" disabled={pending} onClick={openConfirm}>
          {pending ? "جارٍ التنفيذ…" : "تعديل الرصيد"}
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <div className="flex flex-col gap-4 p-5">
          <h2 id={titleId} className="text-lg font-bold">
            {cents !== null && cents > 0 ? "إضافة رصيد؟" : "خصم من الرصيد؟"}
          </h2>
          {cents !== null && after !== null && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">العميل</dt>
              <dd className="truncate text-end" dir="ltr">
                {email}
              </dd>
              <dt className="text-muted">{cents > 0 ? "إضافة" : "خصم"}</dt>
              <dd className={`text-end font-display font-semibold ${cents > 0 ? "text-success" : "text-danger"}`} dir="ltr">
                {cents > 0 ? "+" : ""}
                {usd(cents)}
              </dd>
              <dt className="text-muted">الرصيد بعد التعديل</dt>
              <dd className="text-end font-display" dir="ltr">
                {usd(balanceCents)} → {usd(after)}
              </dd>
              <dt className="text-muted">السبب</dt>
              <dd className="break-words text-end">{note.trim()}</dd>
            </dl>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => dialogRef.current?.close()} autoFocus>
              إلغاء
            </button>
            <button
              type="button"
              onClick={confirm}
              className={cents !== null && cents < 0 ? "btn bg-danger text-white hover:bg-danger/85" : "btn-primary"}
            >
              تأكيد
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
