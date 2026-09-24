"use client";

import { useId, useRef, useState } from "react";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { convertUsdCents, formatPlain, inputToUsdCents } from "@/lib/display-currency";
import type { AdminFx } from "../MoneyInput";
import { FormMessage } from "../ui";
import { useFormAction } from "../useFormAction";

/** "+12.50", "-5" (Unicode minus, Arabic-Indic digits) in the admin currency -> signed USD cents; mirrors the server. */
function parseSignedUsd(raw: string, fx: AdminFx): number | null {
  const v = raw
    .trim()
    .replace(/\s+/g, "")
    .replace(/[−–]/g, "-")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, ".");
  const cents = inputToUsdCents(v, fx.currency, fx.rate, { signed: true });
  return cents === null || cents === 0 || Math.abs(cents) > 1_000_000 ? null : cents;
}

/** SUPER_ADMIN wallet credit (+) / debit (−) with a mandatory reason and a confirm step. */
export function WalletAdjustForm({
  action,
  customerId,
  email,
  balanceCents,
  fx,
}: {
  action: FormAction;
  customerId: string;
  email: string;
  /** USD cents (the wallet's currency) */
  balanceCents: number;
  /** The admin currency the amount is typed in */
  fx: AdminFx;
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
        fx={fx}
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
  fx,
  submit,
}: {
  state: FormState;
  pending: boolean;
  email: string;
  balanceCents: number;
  fx: AdminFx;
  submit: () => void;
}) {
  // Amounts shown in the admin currency; the USD cents actually applied are shown next to them
  const shown = (usdCents: number) => formatPlain(convertUsdCents(usdCents, fx.currency, fx.rate, { precise: true }), fx.currency);
  const usd = (usdCents: number) => (fx.currency === "USD" ? shown(usdCents) : `${shown(usdCents)} (${formatPlain(usdCents, "USD")})`);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const cents = parseSignedUsd(amount, fx);
  const after = cents === null ? null : balanceCents + cents;

  const openConfirm = () => {
    if (cents === null) return setLocalError(`أدخل مبلغاً بعملة ${fx.currency} غير الصفر، مثل 10 للإضافة أو -5.50 للخصم.`);
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
          المبلغ ({fx.currency})
        </label>
        <input type="hidden" name="moneyCurrency" value={fx.currency} />
        <input
          id="w-amount"
          name="amount"
          dir="ltr"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="+10 / -5.50"
          className="input text-left font-display"
          aria-invalid={Boolean(state?.errors?.amount)}
          aria-describedby="w-amount-hint"
        />
        <p id="w-amount-hint" className="mt-1 text-xs text-muted">
          موجب لإضافة رصيد، وسالب (بعلامة -) للخصم. لا يمكن أن يصبح الرصيد سالباً.
        </p>
        {fx.currency !== "USD" && cents !== null ? (
          <p className="mt-1 text-[11px] text-muted">
            يُطبَّق على المحفظة (بالدولار):{" "}
            <span dir="ltr" className="font-display">
              = {formatPlain(cents, "USD")} USD
            </span>
          </p>
        ) : null}
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
