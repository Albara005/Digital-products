"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ProductType } from "@prisma/client";
import { productTypeLabel, slugify } from "@/lib/format";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { PlusIcon, TrashIcon } from "./icons";
import { FieldError, FormMessage, btnSm } from "./ui";
import { useFormAction } from "./useFormAction";

export type ProductFormVariant = {
  id: string;
  label: string;
  price: string; // dollars, e.g. "9.99"
  sortOrder: number;
  orders: number;
  stock: number;
};

export type ProductFormData = {
  id: string;
  version: string; // updatedAt — remounts the fields with fresh data after each save
  name: string;
  slug: string;
  categoryId: string;
  type: ProductType;
  description: string;
  imageUrl: string;
  active: boolean;
  featured: boolean;
  warrantyHours: number | null;
  variants: ProductFormVariant[];
};

type Row = { key: string; id?: string; label: string; price: string; sortOrder: string; orders: number; stock: number };

const TYPES: ProductType[] = ["CARD", "SUBSCRIPTION", "ACCOUNT", "SERVICE"];
const typeHint: Record<ProductType, string> = {
  CARD: "أكواد تُسلَّم تلقائياً من المخزون فور الدفع.",
  SUBSCRIPTION: "أكواد أو مفاتيح اشتراك تُسلَّم تلقائياً من المخزون.",
  ACCOUNT: "حسابات جاهزة (بيانات دخول) تُسلَّم تلقائياً من المخزون.",
  SERVICE: "تُنفَّذ يدوياً من الفريق بعد الدفع — لا تحتاج مخزوناً.",
};

export function ProductForm({
  action,
  categories,
  product,
}: {
  action: FormAction;
  categories: { id: string; name: string }[];
  product?: ProductFormData;
}) {
  const [state, onSubmit, pending] = useFormAction(action);

  return (
    <form onSubmit={onSubmit} noValidate>
      {product && <input type="hidden" name="id" value={product.id} />}
      <ProductFields key={product?.version ?? "new"} product={product} categories={categories} state={state} />
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-col gap-3 border-t border-border bg-bg/90 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <FormMessage state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "جارٍ الحفظ…" : product ? "حفظ التغييرات" : "إنشاء المنتج"}
          </button>
          <Link href="/admin/products" className="btn-ghost">
            {product ? "رجوع" : "إلغاء"}
          </Link>
        </div>
      </div>
    </form>
  );
}

function ProductFields({
  product,
  categories,
  state,
}: {
  product?: ProductFormData;
  categories: { id: string; name: string }[];
  state: FormState;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [type, setType] = useState<ProductType>(product?.type ?? "CARD");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    product?.variants.length
      ? product.variants.map((v) => ({
          key: v.id,
          id: v.id,
          label: v.label,
          price: v.price,
          sortOrder: String(v.sortOrder),
          orders: v.orders,
          stock: v.stock,
        }))
      : [{ key: "new-0", label: "", price: "", sortOrder: "0", orders: 0, stock: 0 }],
  );
  const nextKey = useRef(1);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addRow = () => {
    const key = `new-${nextKey.current++}`;
    setRows((rs) => [...rs, { key, label: "", price: "", sortOrder: String(rs.length), orders: 0, stock: 0 }]);
  };

  const serialized = JSON.stringify(
    rows.map((r) => ({ id: r.id, label: r.label, price: r.price, sortOrder: r.sortOrder || "0" })),
  );
  const err = (k: string) => state?.errors?.[k];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-6">
        <section className="card flex flex-col gap-4 p-5">
          <h2 className="font-semibold">المعلومات الأساسية</h2>
          <div>
            <label htmlFor="p-name" className="label">
              اسم المنتج
            </label>
            <input
              id="p-name"
              name="name"
              className="input"
              maxLength={120}
              value={name}
              required
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
            <FieldError state={state} name="name" />
          </div>
          <div>
            <label htmlFor="p-slug" className="label">
              الرابط (slug)
            </label>
            <input
              id="p-slug"
              name="slug"
              dir="ltr"
              className="input text-start"
              maxLength={120}
              value={slug}
              placeholder="يُولَّد من الاسم تلقائياً"
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              onBlur={() => setSlug((s) => slugify(s))}
            />
            <p className="mt-1 text-xs text-muted" dir="ltr">
              /product/{slug || "…"}
            </p>
            <FieldError state={state} name="slug" />
          </div>
          <div>
            <label htmlFor="p-desc" className="label">
              الوصف
            </label>
            <textarea
              id="p-desc"
              name="description"
              rows={6}
              maxLength={5000}
              className="input resize-y leading-relaxed"
              defaultValue={product?.description ?? ""}
              placeholder="ما الذي يحصل عليه العميل، طريقة الاستخدام، المنطقة…"
            />
            <FieldError state={state} name="description" />
          </div>
        </section>

        <section className="card p-5" aria-labelledby="variants-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="variants-title" className="font-semibold">
                الخيارات والأسعار
              </h2>
              <p className="text-xs text-muted">مثل: بطاقة 10$، اشتراك شهر، حساب عادي. السعر بالدولار.</p>
            </div>
            <button type="button" className={btnSm.ghost} onClick={addRow} disabled={rows.length >= 50}>
              <PlusIcon className="size-3.5" />
              إضافة خيار
            </button>
          </div>
          <input type="hidden" name="variants" value={serialized} />

          <div className="hidden grid-cols-[minmax(0,1fr)_120px_80px_36px] gap-2 px-1 pb-1.5 text-xs text-muted sm:grid">
            <span>الاسم</span>
            <span>السعر (USD)</span>
            <span>الترتيب</span>
            <span />
          </div>
          <ul className="flex flex-col gap-3 sm:gap-2">
            {rows.map((r, i) => {
              const locked = r.orders > 0 || r.stock > 0;
              const lockReason =
                r.orders > 0
                  ? `له ${r.orders} طلب سابق — لا يمكن حذفه (عطّل المنتج بدلاً من ذلك)`
                  : r.stock > 0
                    ? `يحتوي على ${r.stock} عنصر مخزون — احذف المخزون أولاً`
                    : "";
              return (
                <li key={r.key} className="rounded-lg border border-border bg-surface-2/40 p-2.5 sm:border-0 sm:bg-transparent sm:p-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2 sm:grid-cols-[minmax(0,1fr)_120px_80px_36px]">
                    <input
                      aria-label={`اسم الخيار ${i + 1}`}
                      className="input"
                      value={r.label}
                      maxLength={80}
                      placeholder="اسم الخيار"
                      onChange={(e) => update(r.key, { label: e.target.value })}
                    />
                    <button
                      type="button"
                      className={`${btnSm.subtle} h-full sm:order-last`}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      disabled={locked || rows.length === 1}
                      title={lockReason || (rows.length === 1 ? "يجب أن يبقى خيار واحد على الأقل" : "حذف الخيار")}
                      aria-label={`حذف الخيار ${i + 1}`}
                    >
                      <TrashIcon className="size-4" />
                    </button>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-sm text-muted">$</span>
                      <input
                        aria-label={`سعر الخيار ${i + 1} بالدولار`}
                        className="input pl-7! text-left font-display"
                        dir="ltr"
                        inputMode="decimal"
                        placeholder="9.99"
                        value={r.price}
                        onChange={(e) => update(r.key, { price: e.target.value.replace(/[^\d.]/g, "") })}
                      />
                    </div>
                    <input
                      aria-label={`ترتيب الخيار ${i + 1}`}
                      className="input text-start font-display"
                      dir="ltr"
                      type="number"
                      step={1}
                      value={r.sortOrder}
                      onChange={(e) => update(r.key, { sortOrder: e.target.value })}
                    />
                  </div>
                  {(r.orders > 0 || r.stock > 0) && (
                    <p className="mt-1 px-1 text-[11px] text-muted">
                      {r.orders > 0 && <span>{r.orders} طلب سابق</span>}
                      {r.orders > 0 && r.stock > 0 && " · "}
                      {r.stock > 0 && <span>{r.stock} عنصر في المخزون</span>}
                    </p>
                  )}
                  {(err(`variants.${i}.label`) || err(`variants.${i}.price`) || err(`variants.${i}.sortOrder`)) && (
                    <p className="mt-1 px-1 text-xs text-danger">
                      {err(`variants.${i}.label`) ?? err(`variants.${i}.price`) ?? err(`variants.${i}.sortOrder`)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <FieldError state={state} name="variants" />
        </section>
      </div>

      <div className="flex flex-col gap-6">
        <section className="card flex flex-col gap-3 p-5">
          <h2 className="font-semibold">الحالة</h2>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-checked:border-volt/50">
            <input type="checkbox" name="active" defaultChecked={product?.active ?? true} className="mt-0.5 size-4 accent-volt" />
            <span>
              <span className="block text-sm font-medium">نشط</span>
              <span className="block text-xs text-muted">يظهر في المتجر ويمكن شراؤه.</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-checked:border-volt/50">
            <input type="checkbox" name="featured" defaultChecked={product?.featured ?? false} className="mt-0.5 size-4 accent-volt" />
            <span>
              <span className="block text-sm font-medium">مميّز</span>
              <span className="block text-xs text-muted">يُعرض في أقسام المنتجات المميزة.</span>
            </span>
          </label>
        </section>

        <section className="card flex flex-col gap-4 p-5">
          <h2 className="font-semibold">التصنيف</h2>
          <div>
            <label htmlFor="p-cat" className="label">
              الفئة
            </label>
            <select id="p-cat" name="categoryId" className="input" defaultValue={product?.categoryId ?? ""} required>
              <option value="" disabled>
                اختر فئة…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <FieldError state={state} name="categoryId" />
          </div>
          <div>
            <label htmlFor="p-type" className="label">
              نوع المنتج
            </label>
            <select
              id="p-type"
              name="type"
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as ProductType)}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {productTypeLabel[t]}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted">{typeHint[type]}</p>
            <FieldError state={state} name="type" />
          </div>
          {type === "ACCOUNT" && (
            <div>
              <label htmlFor="p-warranty" className="label">
                مدة الضمان (بالساعات)
              </label>
              <input
                id="p-warranty"
                name="warrantyHours"
                type="number"
                min={0}
                max={8760}
                step={1}
                dir="ltr"
                className="input text-start font-display"
                defaultValue={product?.warrantyHours ?? ""}
                placeholder="مثال: 72"
              />
              <p className="mt-1 text-xs text-muted">اتركه فارغاً إن لم يكن هناك ضمان.</p>
              <FieldError state={state} name="warrantyHours" />
            </div>
          )}
        </section>

        <section className="card flex flex-col gap-3 p-5">
          <h2 className="font-semibold">الصورة</h2>
          <div>
            <label htmlFor="p-img" className="label">
              رابط الصورة
            </label>
            <input
              id="p-img"
              name="imageUrl"
              dir="ltr"
              className="input text-start"
              placeholder="https://… أو /products/…"
              value={imageUrl}
              maxLength={2000}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <FieldError state={state} name="imageUrl" />
          </div>
          <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border border-border bg-surface-2">
            {/^(https?:\/\/|\/(?!\/))/.test(imageUrl.trim()) ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied URL preview
              <img src={imageUrl.trim()} alt="معاينة الصورة" className="size-full object-cover" />
            ) : (
              <span className="text-xs text-muted">لا توجد صورة</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
