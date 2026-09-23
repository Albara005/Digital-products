"use client";

import type { FormAction } from "@/app/admin/_lib/form-state";
import { SendIcon } from "./icons";
import { FieldError, FormMessage } from "./ui";
import { useFormAction } from "./useFormAction";

export function ManualDeliveryForm({
  action,
  orderId,
  itemId,
  placeholder,
}: {
  action: FormAction;
  orderId: string;
  itemId: string;
  placeholder: string;
}) {
  const [state, onSubmit, pending] = useFormAction(action);
  const fieldId = `deliver-${itemId}`;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="itemId" value={itemId} />
      <label htmlFor={fieldId} className="text-xs font-medium text-muted">
        تسليم يدوي — يظهر هذا النص للعميل في صفحة طلبه (يُحفظ مشفّراً)
      </label>
      <textarea
        id={fieldId}
        name="note"
        rows={4}
        maxLength={20000}
        dir="auto"
        className="input resize-y font-mono text-xs leading-relaxed"
        placeholder={placeholder}
      />
      <FieldError state={state} name="note" />
      {state && !state.errors && <FormMessage state={state} />}
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          <SendIcon className="size-4 rtl:-scale-x-100" />
          {pending ? "جارٍ التسليم…" : "تسليم وإغلاق العنصر"}
        </button>
      </div>
    </form>
  );
}
