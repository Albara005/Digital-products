"use client";

import { useState } from "react";
import Link from "next/link";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { type AdminFx, MoneyInput } from "../MoneyInput";
import { FieldError, FormMessage } from "../ui";
import { useFormAction } from "../useFormAction";

export type CouponScope = "all" | "category" | "product";

/** Form values as strings: money in the admin currency ("4.99"; stored as USD cents), dates as datetime-local in the shop's time zone. */
export type CouponFormData = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: string;
  maxDiscount: string;
  minSubtotal: string;
  maxUses: string;
  perCustomerLimit: string;
  startsAt: string;
  endsAt: string;
  scope: CouponScope;
  categoryId: string;
  productId: string;
  active: boolean;
  usedCount: number;
};

type Option = { id: string; name: string };

export function CouponForm({
  action,
  categories,
  products,
  coupon,
  fx,
}: {
  action: FormAction;
  categories: Option[];
  products: Option[];
  coupon?: CouponFormData;
  /** Admin currency the amounts are typed in */
  fx: AdminFx;
}) {
  const [state, form, pending] = useFormAction(action);

  return (
    <form {...form} noValidate className="flex max-w-3xl flex-col gap-6">
      {coupon && <input type="hidden" name="id" value={coupon.id} />}
      <CouponFields coupon={coupon} categories={categories} products={products} state={state} fx={fx} />
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "جارٍ الحفظ…" : coupon ? "حفظ التغييرات" : "إنشاء الكوبون"}
        </button>
        <Link href="/admin/coupons" className="btn-ghost">
          إلغاء
        </Link>
      </div>
    </form>
  );
}

function CouponFields({
  coupon,
  categories,
  products,
  state,
  fx,
}: {
  coupon?: CouponFormData;
  categories: Option[];
  products: Option[];
  state: FormState;
  fx: AdminFx;
}) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [type, setType] = useState<"PERCENT" | "FIXED">(coupon?.type ?? "PERCENT");
  const [scope, setScope] = useState<CouponScope>(coupon?.scope ?? "all");

  return (
    <>
      <section className="card flex flex-col gap-4 p-5">
        <h2 className="font-semibold">الكود وقيمة الخصم</h2>
        <div>
          <label htmlFor="c-code" className="label">
            الكود
          </label>
          <input
            id="c-code"
            name="code"
            dir="ltr"
            className="input text-start font-display uppercase tracking-wider"
            maxLength={32}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ""))}
            placeholder="WELCOME10"
            autoComplete="off"
            required
          />
          <p className="mt-1 text-xs text-muted">حروف إنجليزية وأرقام و - أو _ . يُدخله العميل بأي حالة أحرف.</p>
          {coupon && coupon.usedCount > 0 && (
            <p className="mt-1 text-xs text-fuchsia">استُخدم هذا الكود {coupon.usedCount} مرة؛ تغييره يوقف الكود القديم.</p>
          )}
          <FieldError state={state} name="code" />
        </div>

        <fieldset>
          <legend className="label">نوع الخصم</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["PERCENT", "نسبة مئوية", "مثل 10% من قيمة المنتجات المشمولة"],
                ["FIXED", "مبلغ ثابت", "مبلغ يُخصم من الطلب (يُحوَّل لعملة العميل)"],
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
                  name="type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  className="mt-1 accent-volt"
                />
                <span>
                  <span className="block font-medium">{title}</span>
                  <span className="block text-xs text-muted">{hint}</span>
                </span>
              </label>
            ))}
          </div>
          <FieldError state={state} name="type" />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="c-value" className="label">
              {type === "PERCENT" ? "النسبة (%)" : `مبلغ الخصم (${fx.currency})`}
            </label>
            {type === "PERCENT" ? (
              <input
                key="percent"
                id="c-value"
                name="value"
                inputMode="decimal"
                dir="ltr"
                className="input text-start font-display"
                defaultValue={coupon?.type === "PERCENT" ? coupon.value : ""}
                placeholder="10"
                required
              />
            ) : (
              <MoneyInput
                key="fixed"
                id="c-value"
                name="value"
                fx={fx}
                defaultValue={coupon?.type === "FIXED" ? coupon.value : ""}
                placeholder="5.00"
                invalid={Boolean(state?.errors?.value)}
              />
            )}
            <FieldError state={state} name="value" />
          </div>
          {type === "PERCENT" && (
            <div>
              <label htmlFor="c-max" className="label">
                الحد الأقصى للخصم ({fx.currency}) <span className="text-xs font-normal">(اختياري)</span>
              </label>
              <MoneyInput
                id="c-max"
                name="maxDiscount"
                fx={fx}
                defaultValue={coupon?.maxDiscount ?? ""}
                placeholder="5.00"
                invalid={Boolean(state?.errors?.maxDiscount)}
              />
              <FieldError state={state} name="maxDiscount" />
            </div>
          )}
        </div>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="font-semibold">الشروط والحدود</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="c-min" className="label">
              حد أدنى للمشتريات ({fx.currency})
            </label>
            <MoneyInput
              id="c-min"
              name="minSubtotal"
              fx={fx}
              defaultValue={coupon?.minSubtotal ?? ""}
              placeholder="بدون"
              invalid={Boolean(state?.errors?.minSubtotal)}
            />
            <FieldError state={state} name="minSubtotal" />
          </div>
          <div>
            <label htmlFor="c-uses" className="label">
              عدد الاستخدامات الكلي
            </label>
            <input
              id="c-uses"
              name="maxUses"
              inputMode="numeric"
              dir="ltr"
              className="input text-start font-display"
              defaultValue={coupon?.maxUses ?? ""}
              placeholder="غير محدود"
            />
            <FieldError state={state} name="maxUses" />
          </div>
          <div>
            <label htmlFor="c-per" className="label">
              لكل عميل
            </label>
            <input
              id="c-per"
              name="perCustomerLimit"
              inputMode="numeric"
              dir="ltr"
              className="input text-start font-display"
              defaultValue={coupon?.perCustomerLimit ?? ""}
              placeholder="غير محدود"
            />
            <FieldError state={state} name="perCustomerLimit" />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted">
          الحد الأدنى يُحسب على المنتجات المشمولة بالكوبون. الطلبات الفاشلة لا تُحتسب من الاستخدامات.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="c-start" className="label">
              يبدأ في <span className="text-xs font-normal">(اختياري)</span>
            </label>
            <input
              id="c-start"
              name="startsAt"
              type="datetime-local"
              dir="ltr"
              className="input text-start"
              defaultValue={coupon?.startsAt ?? ""}
            />
            <FieldError state={state} name="startsAt" />
          </div>
          <div>
            <label htmlFor="c-end" className="label">
              ينتهي في <span className="text-xs font-normal">(اختياري)</span>
            </label>
            <input
              id="c-end"
              name="endsAt"
              type="datetime-local"
              dir="ltr"
              className="input text-start"
              defaultValue={coupon?.endsAt ?? ""}
            />
            <FieldError state={state} name="endsAt" />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted">التواريخ بتوقيت المتجر.</p>
      </section>

      <section className="card flex flex-col gap-4 p-5">
        <h2 className="font-semibold">النطاق</h2>
        <div>
          <label htmlFor="c-scope" className="label">
            يُطبَّق على
          </label>
          <select
            id="c-scope"
            name="scope"
            className="input"
            value={scope}
            onChange={(e) => setScope(e.target.value as CouponScope)}
          >
            <option value="all">كل المنتجات</option>
            <option value="category">فئة محددة</option>
            <option value="product">منتج محدد</option>
          </select>
        </div>
        {scope === "category" && (
          <div>
            <label htmlFor="c-cat" className="label">
              الفئة
            </label>
            <select id="c-cat" name="categoryId" className="input" defaultValue={coupon?.categoryId ?? ""}>
              <option value="">اختر فئة…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError state={state} name="categoryId" />
          </div>
        )}
        {scope === "product" && (
          <div>
            <label htmlFor="c-prod" className="label">
              المنتج
            </label>
            <select id="c-prod" name="productId" className="input" defaultValue={coupon?.productId ?? ""}>
              <option value="">اختر منتجاً…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <FieldError state={state} name="productId" />
          </div>
        )}
        <p className="text-xs text-muted">مع نطاق محدد، يُخصم فقط من المنتجات المطابقة في السلة.</p>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={coupon?.active ?? true} className="size-4 accent-volt" />
          <span>الكوبون مفعّل</span>
        </label>
      </section>
    </>
  );
}
