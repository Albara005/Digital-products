"use client";

import { useMemo, useState } from "react";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { ACCOUNT_SEPARATOR, parseStockInput, type StockKind } from "@/app/admin/_lib/parse-stock";
import { PlusIcon } from "./icons";
import { FieldError, FormMessage } from "./ui";
import { useFormAction } from "./useFormAction";

const placeholders: Record<StockKind, string> = {
  CARD: "XXXX-XXXX-XXXX\nYYYY-YYYY-YYYY\nZZZZ-ZZZZ-ZZZZ",
  SUBSCRIPTION: "KEY-1111-AAAA\nKEY-2222-BBBB",
  ACCOUNT: `email: user1@example.com\npassword: pass-1\n${ACCOUNT_SEPARATOR}\nemail: user2@example.com\npassword: pass-2`,
};

export function InventoryAddForm({
  action,
  productId,
  kind,
  variants,
  defaultVariantId,
}: {
  action: FormAction;
  productId: string;
  kind: StockKind;
  variants: { id: string; label: string }[];
  defaultVariantId: string;
}) {
  const [state, form, pending] = useFormAction(action);

  return (
    <form {...form} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="productId" value={productId} />
      <div>
        <label htmlFor="inv-variant" className="label">
          الخيار
        </label>
        <select id="inv-variant" name="variantId" className="input" defaultValue={defaultVariantId} key={defaultVariantId}>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <FieldError state={state} name="variantId" />
      </div>
      <StockTextarea key={state?.ts ?? "stock"} kind={kind} state={state} />
      <FormMessage state={state} />
      <button type="submit" className="btn-primary" disabled={pending}>
        <PlusIcon className="size-4" />
        {pending ? "جارٍ التشفير والإضافة…" : "إضافة إلى المخزون"}
      </button>
    </form>
  );
}

function StockTextarea({ kind, state }: { kind: StockKind; state: FormState }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseStockInput(text, kind), [text, kind]);

  return (
    <div>
      <label htmlFor="inv-text" className="label">
        {kind === "ACCOUNT" ? "الحسابات" : "الأكواد"}
      </label>
      <p className="mb-2 text-xs leading-relaxed text-muted">
        {kind === "ACCOUNT" ? (
          <>
            افصل بين كل حساب والآخر بسطر يحتوي فقط على{" "}
            <code dir="ltr" className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text">
              {ACCOUNT_SEPARATOR}
            </code>
            . يمكن أن يمتد الحساب الواحد على عدة أسطر.
          </>
        ) : (
          "كل سطر غير فارغ = كود واحد. تُحذف المسافات الزائدة والأسطر الفارغة تلقائياً."
        )}
      </p>
      <textarea
        id="inv-text"
        name="text"
        dir="ltr"
        rows={kind === "ACCOUNT" ? 12 : 10}
        spellCheck={false}
        autoComplete="off"
        className="input resize-y text-start font-mono text-xs leading-relaxed"
        placeholder={placeholders[kind]}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" aria-live="polite">
        <span className="text-muted">
          سيتم إضافة <span className="font-display font-semibold text-text">{parsed.items.length}</span> عنصر
        </span>
        {parsed.duplicates.length > 0 && (
          <span className="text-danger">
            {parsed.duplicates.length} مكرر داخل الدفعة — يجب إزالته قبل الإضافة
          </span>
        )}
      </div>
      <FieldError state={state} name="text" />
    </div>
  );
}
