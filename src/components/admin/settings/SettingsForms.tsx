"use client";

import { useState } from "react";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { FieldError, FormMessage } from "../ui";
import { useFormAction } from "../useFormAction";

/** Referral settings as form strings: money in dollars ("9.99"), percentage as a whole number. */
export type ReferralFormValues = {
  enabled: boolean;
  rewardType: "PERCENT" | "FIXED";
  rewardValue: string;
  maxReward: string;
  minOrder: string;
};

function usd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function toCents(v: string): number | null {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(v.trim())) return null;
  const [whole, frac = ""] = v.trim().split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

function MoneyInput({
  id,
  name,
  defaultValue,
  placeholder,
  state,
  onChange,
}: {
  id: string;
  name: string;
  defaultValue: string;
  placeholder?: string;
  state: FormState;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted">$</span>
      <input
        id={id}
        name={name}
        dir="ltr"
        inputMode="decimal"
        defaultValue={defaultValue}
        placeholder={placeholder}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="input pl-7! text-left font-display"
        aria-invalid={Boolean(state?.errors?.[name])}
      />
    </div>
  );
}

export function ReferralSettingsForm({ action, values }: { action: FormAction; values: ReferralFormValues }) {
  const [state, form, pending] = useFormAction(action);
  const [type, setType] = useState(values.rewardType);
  const [rewardValue, setRewardValue] = useState(values.rewardValue);
  const [maxReward, setMaxReward] = useState(values.maxReward);
  const [minOrder, setMinOrder] = useState(values.minOrder);

  // Live example so the admin sees what a referrer actually earns
  const exampleOrder = Math.max(5000, toCents(minOrder) ?? 0);
  let example: string | null = null;
  if (type === "PERCENT" && /^\d{1,3}$/.test(rewardValue.trim())) {
    const raw = Math.floor((exampleOrder * Number(rewardValue)) / 100);
    const cap = maxReward.trim() === "" ? null : toCents(maxReward);
    const reward = cap === null ? raw : Math.min(raw, cap);
    example = `طلب أول بقيمة ${usd(exampleOrder)} ← مكافأة ${usd(reward)} في محفظة صاحب الدعوة${cap !== null && raw > cap ? " (بعد تطبيق الحد الأقصى)" : ""}.`;
  } else if (type === "FIXED") {
    const cents = toCents(rewardValue);
    if (cents !== null) example = `أي طلب أول بقيمة ${usd(toCents(minOrder) ?? 0)} أو أكثر ← مكافأة ${usd(cents)}.`;
  }

  return (
    <form {...form} noValidate className="flex flex-col gap-5">
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-checked:border-volt/50">
        <input type="checkbox" name="enabled" defaultChecked={values.enabled} className="mt-0.5 size-4 accent-volt" />
        <span>
          <span className="block text-sm font-medium">تفعيل مكافآت الدعوة</span>
          <span className="block text-xs leading-relaxed text-muted">
            عند إيقافها لا تُحتسب مكافآت جديدة للطلبات القادمة، ولا تتأثر المكافآت السابقة.
          </span>
        </span>
      </label>

      <fieldset>
        <legend className="label">نوع المكافأة</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["PERCENT", "نسبة من الطلب الأول", "نسبة مئوية من إجمالي أول طلب مدفوع للعميل المدعو"],
              ["FIXED", "مبلغ ثابت", "نفس المبلغ لكل دعوة ناجحة مهما كانت قيمة الطلب"],
            ] as const
          ).map(([value, title, hint]) => (
            <label
              key={value}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                type === value ? "border-volt bg-volt/5" : "border-border hover:border-muted"
              }`}
            >
              <input
                type="radio"
                name="rewardType"
                value={value}
                checked={type === value}
                onChange={() => setType(value)}
                className="mt-0.5 accent-volt"
              />
              <span>
                <span className="block font-medium">{title}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="ref-value" className="label">
            {type === "PERCENT" ? "النسبة (%)" : "مبلغ المكافأة"}
          </label>
          {type === "PERCENT" ? (
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted">%</span>
              <input
                id="ref-value"
                name="rewardValue"
                dir="ltr"
                inputMode="numeric"
                value={rewardValue}
                onChange={(e) => setRewardValue(e.target.value)}
                className="input pl-7! text-left font-display"
                aria-invalid={Boolean(state?.errors?.rewardValue)}
              />
            </div>
          ) : (
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted">$</span>
              <input
                id="ref-value"
                name="rewardValue"
                dir="ltr"
                inputMode="decimal"
                value={rewardValue}
                onChange={(e) => setRewardValue(e.target.value)}
                className="input pl-7! text-left font-display"
                aria-invalid={Boolean(state?.errors?.rewardValue)}
              />
            </div>
          )}
          <FieldError state={state} name="rewardValue" />
        </div>
        <div>
          <label htmlFor="ref-max" className="label">
            الحد الأقصى للمكافأة
          </label>
          <MoneyInput id="ref-max" name="maxReward" defaultValue={values.maxReward} placeholder="بلا حد" state={state} onChange={setMaxReward} />
          <p className="mt-1 text-xs text-muted">{type === "PERCENT" ? "اتركه فارغاً لعدم وضع حد." : "لا يُستخدم مع المبلغ الثابت."}</p>
          <FieldError state={state} name="maxReward" />
        </div>
        <div>
          <label htmlFor="ref-min" className="label">
            أقل قيمة للطلب الأول
          </label>
          <MoneyInput id="ref-min" name="minOrder" defaultValue={values.minOrder} placeholder="0" state={state} onChange={setMinOrder} />
          <p className="mt-1 text-xs text-muted">الطلبات الأقل منها لا تمنح مكافأة.</p>
          <FieldError state={state} name="minOrder" />
        </div>
      </div>

      {example && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">مثال: {example}</p>}

      <FormMessage state={state} />
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "جارٍ الحفظ…" : "حفظ إعدادات الدعوة"}
        </button>
      </div>
    </form>
  );
}

export function StoreSettingsForm({ action, lowStockThreshold }: { action: FormAction; lowStockThreshold: number }) {
  const [state, form, pending] = useFormAction(action);
  return (
    <form {...form} noValidate className="flex flex-col gap-4">
      <div>
        <label htmlFor="low-stock" className="label">
          حد المخزون المنخفض
        </label>
        <input
          id="low-stock"
          name="lowStockThreshold"
          type="number"
          min={0}
          max={10000}
          step={1}
          dir="ltr"
          defaultValue={lowStockThreshold}
          className="input max-w-40 text-start font-display"
          aria-invalid={Boolean(state?.errors?.lowStockThreshold)}
        />
        <p className="mt-1 text-xs leading-relaxed text-muted">
          يُعتبر الخيار «منخفض المخزون» إذا قلّ عدد عناصره المتاحة عن هذا الرقم، ويُنبَّه عليه في لوحة التحكم.
        </p>
        <FieldError state={state} name="lowStockThreshold" />
      </div>
      <FormMessage state={state} />
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </form>
  );
}
