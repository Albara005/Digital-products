"use client";

import type { FormAction } from "@/app/admin/_lib/form-state";
import { CodeInput } from "./CodeInput";
import { FormMessage } from "./ui";
import { useFormAction } from "./useFormAction";

/** Sign-in step 2: the TOTP code. */
export function TwoFactorForm({ action }: { action: FormAction }) {
  const [state, form, pending] = useFormAction(action);

  return (
    <form {...form} className="flex flex-col gap-4" noValidate>
      <CodeInput id="code" state={state} autoFocus />
      {state && !state.errors && <FormMessage state={state} />}
      <button type="submit" className="btn-primary mt-1 w-full" disabled={pending}>
        {pending ? "جارٍ التحقق…" : "تأكيد الدخول"}
      </button>
    </form>
  );
}
