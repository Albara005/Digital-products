"use client";

import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { PlusIcon } from "./icons";
import { FieldError, FormMessage } from "./ui";
import { useFormAction } from "./useFormAction";

export function AddAdminForm({ action }: { action: FormAction }) {
  const [state, onSubmit, pending] = useFormAction(action);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {/* Remount (clear) after each successful add */}
      <Fields key={state?.ok ? state.ts : "fields"} state={state} />
      <FormMessage state={state} />
      <button type="submit" className="btn-primary" disabled={pending}>
        <PlusIcon className="size-4" />
        {pending ? "جارٍ الإضافة…" : "إضافة عضو"}
      </button>
    </form>
  );
}

function Fields({ state }: { state: FormState }) {
  return (
    <>
      <div>
        <label htmlFor="adm-name" className="label">
          الاسم
        </label>
        <input id="adm-name" name="name" className="input" maxLength={80} required autoComplete="off" />
        <FieldError state={state} name="name" />
      </div>
      <div>
        <label htmlFor="adm-email" className="label">
          البريد الإلكتروني
        </label>
        <input id="adm-email" name="email" type="email" dir="ltr" className="input text-start" required autoComplete="off" />
        <FieldError state={state} name="email" />
      </div>
      <div>
        <label htmlFor="adm-pass" className="label">
          كلمة المرور المؤقتة
        </label>
        <input
          id="adm-pass"
          name="password"
          type="password"
          dir="ltr"
          minLength={10}
          className="input text-start"
          required
          autoComplete="new-password"
        />
        <p className="mt-1 text-xs text-muted">10 أحرف على الأقل. سلّمها للعضو بطريقة آمنة.</p>
        <FieldError state={state} name="password" />
      </div>
      <div>
        <label htmlFor="adm-role" className="label">
          الصلاحية
        </label>
        <select id="adm-role" name="role" className="input" defaultValue="STAFF">
          <option value="STAFF">موظف — الطلبات والمنتجات والمخزون</option>
          <option value="SUPER_ADMIN">مدير عام — كل شيء بما فيه الفريق</option>
        </select>
        <FieldError state={state} name="role" />
      </div>
    </>
  );
}
