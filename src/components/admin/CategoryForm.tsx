"use client";

import { useState } from "react";
import Link from "next/link";
import { slugify } from "@/lib/format";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { FieldError, FormMessage } from "./ui";
import { useFormAction } from "./useFormAction";

type CategoryDefaults = {
  id: string;
  name: string;
  nameEn: string | null;
  slug: string;
  description: string | null;
  descriptionEn: string | null;
  sortOrder: number;
};

export function CategoryForm({ action, category }: { action: FormAction; category?: CategoryDefaults }) {
  const [state, form, pending] = useFormAction(action);

  return (
    <form {...form} className="flex flex-col gap-4" noValidate>
      {category && <input type="hidden" name="id" value={category.id} />}
      {/* Remount (clear) the fields after each successful create */}
      <CategoryFields key={category ? category.id : (state?.ts ?? "new")} category={category} state={state} />
      <FormMessage state={state} />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "جارٍ الحفظ…" : category ? "حفظ التغييرات" : "إضافة الفئة"}
        </button>
        {category && (
          <Link href="/admin/categories" className="btn-ghost">
            إلغاء
          </Link>
        )}
      </div>
    </form>
  );
}

function CategoryFields({
  category,
  state,
}: {
  category?: CategoryDefaults;
  state: FormState;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  // New categories follow the name until the slug is edited by hand; existing slugs never auto-change.
  const [slugTouched, setSlugTouched] = useState(Boolean(category));

  return (
    <>
      <div>
        <label htmlFor="cat-name" className="label">
          الاسم
        </label>
        <input
          id="cat-name"
          name="name"
          className="input"
          value={name}
          maxLength={80}
          required
          onChange={(e) => {
            setName(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
        <FieldError state={state} name="name" />
      </div>
      <div>
        <label htmlFor="cat-slug" className="label">
          الرابط (slug)
        </label>
        <input
          id="cat-slug"
          name="slug"
          dir="ltr"
          className="input text-start"
          value={slug}
          maxLength={80}
          placeholder="يُولَّد من الاسم تلقائياً"
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          onBlur={() => setSlug((s) => slugify(s))}
        />
        <FieldError state={state} name="slug" />
      </div>
      <div>
        <label htmlFor="cat-desc" className="label">
          الوصف <span className="text-xs font-normal">(اختياري)</span>
        </label>
        <textarea
          id="cat-desc"
          name="description"
          rows={3}
          maxLength={1000}
          className="input resize-y"
          defaultValue={category?.description ?? ""}
        />
        <FieldError state={state} name="description" />
      </div>
      <div>
        <label htmlFor="cat-name-en" className="label">
          English name <span className="text-xs font-normal">(اختياري)</span>
        </label>
        <input
          id="cat-name-en"
          name="nameEn"
          dir="ltr"
          lang="en"
          className="input text-start"
          maxLength={80}
          defaultValue={category?.nameEn ?? ""}
          placeholder="Game Cards"
        />
        <p className="mt-1 text-xs text-muted">يظهر في المتجر الإنجليزي؛ إن تُرك فارغاً يظهر الاسم العربي.</p>
        <FieldError state={state} name="nameEn" />
      </div>
      <div>
        <label htmlFor="cat-desc-en" className="label">
          English description <span className="text-xs font-normal">(اختياري)</span>
        </label>
        <textarea
          id="cat-desc-en"
          name="descriptionEn"
          dir="ltr"
          lang="en"
          rows={3}
          maxLength={1000}
          className="input resize-y text-start"
          defaultValue={category?.descriptionEn ?? ""}
        />
        <FieldError state={state} name="descriptionEn" />
      </div>
      <div>
        <label htmlFor="cat-sort" className="label">
          ترتيب العرض
        </label>
        <input
          id="cat-sort"
          name="sortOrder"
          type="number"
          step={1}
          dir="ltr"
          className="input text-start font-display"
          defaultValue={category?.sortOrder ?? 0}
        />
        <p className="mt-1 text-xs text-muted">الأصغر يظهر أولاً.</p>
        <FieldError state={state} name="sortOrder" />
      </div>
    </>
  );
}
