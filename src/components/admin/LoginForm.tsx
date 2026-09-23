"use client";

import type { FormAction } from "@/app/admin/_lib/form-state";
import { FieldError, FormMessage } from "./ui";
import { useFormAction } from "./useFormAction";

export function LoginForm({ action }: { action: FormAction }) {
  const [state, onSubmit, pending] = useFormAction(action);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div>
        <label htmlFor="email" className="label">
          البريد الإلكتروني
        </label>
        <input
          id="email"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="username"
          required
          autoFocus
          className="input text-start"
          aria-invalid={Boolean(state?.errors?.email)}
        />
        <FieldError state={state} name="email" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          كلمة المرور
        </label>
        <input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          required
          className="input text-start"
          aria-invalid={Boolean(state?.errors?.password)}
        />
        <FieldError state={state} name="password" />
      </div>
      {state && !state.errors && <FormMessage state={state} />}
      <button type="submit" className="btn-primary mt-1 w-full" disabled={pending}>
        {pending ? "جارٍ التحقق…" : "تسجيل الدخول"}
      </button>
    </form>
  );
}
