"use client";

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { btnSm } from "./ui";

type Variant = keyof typeof btnSm;

/**
 * One-click Server Action button (delete, retry, refund...). Optional confirm step
 * rendered as a native <dialog>; the result message is shown next to the button.
 */
export function ActionButton({
  action,
  fields,
  children,
  pendingLabel = "جارٍ التنفيذ…",
  variant = "ghost",
  confirm,
  disabled,
  title,
  showSuccess = true,
}: {
  action: FormAction;
  fields: Record<string, string>;
  children: ReactNode;
  pendingLabel?: string;
  variant?: Variant;
  confirm?: { title: string; body: ReactNode; confirmLabel: string; tone?: "danger" | "primary" };
  disabled?: boolean;
  title?: string;
  showSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (state?.ok) dialogRef.current?.close();
  }, [state]);

  const hidden = Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));

  const message =
    state?.message && (!state.ok || showSuccess) ? (
      <span role={state.ok ? "status" : "alert"} className={`text-xs ${state.ok ? "text-success" : "text-danger"}`}>
        {state.message}
      </span>
    ) : null;

  if (!confirm) {
    return (
      <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
        {hidden}
        <button type="submit" className={btnSm[variant]} disabled={disabled || pending} title={title}>
          {pending ? pendingLabel : children}
        </button>
        {message}
      </form>
    );
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={btnSm[variant]}
        disabled={disabled || pending}
        title={title}
        onClick={() => dialogRef.current?.showModal()}
      >
        {pending ? pendingLabel : children}
      </button>
      {state?.ok ? message : null}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(92vw,420px)] rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm"
      >
        <form action={formAction} className="flex flex-col gap-4 p-5">
          {hidden}
          <h2 id={titleId} className="text-lg font-bold">
            {confirm.title}
          </h2>
          <div className="text-sm leading-relaxed text-muted">{confirm.body}</div>
          {state?.ok === false && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
              {state.message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => dialogRef.current?.close()}
              disabled={pending}
              autoFocus={confirm.tone !== "primary"}
            >
              إلغاء
            </button>
            <button
              type="submit"
              className={confirm.tone === "primary" ? "btn-primary" : "btn bg-danger text-white hover:bg-danger/85"}
              disabled={pending}
            >
              {pending ? pendingLabel : confirm.confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
