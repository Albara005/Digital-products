"use client";

import { useState } from "react";
import type { FormAction } from "@/app/admin/_lib/form-state";
import { CodeInput } from "./CodeInput";
import { FieldError, FormMessage } from "./ui";
import { useFormAction } from "./useFormAction";

/** Sign-in step 2: the TOTP code, or a single-use recovery code instead. */
export function TwoFactorForm({ action }: { action: FormAction }) {
  const [state, form, pending] = useFormAction(action);
  const [mode, setMode] = useState<"totp" | "recovery">("totp");

  return (
    <form {...form} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="mode" value={mode} />
      {mode === "totp" ? (
        <CodeInput id="code" state={state} autoFocus />
      ) : (
        <div>
          <label htmlFor="recoveryCode" className="label">
            رمز الاسترداد
          </label>
          <input
            id="recoveryCode"
            name="recoveryCode"
            dir="ltr"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            placeholder="XXXX-XXXX"
            required
            autoFocus
            className="input text-center font-mono text-lg! uppercase tracking-[0.2em]"
            aria-invalid={Boolean(state?.errors?.recoveryCode)}
            aria-describedby="recoveryCode-hint"
          />
          <p id="recoveryCode-hint" className="mt-1 text-xs text-muted">
            أحد الرموز العشرة التي حفظتها عند تفعيل التحقق بخطوتين. كل رمز يعمل مرة واحدة.
          </p>
          <FieldError state={state} name="recoveryCode" />
        </div>
      )}
      {state && !state.errors && <FormMessage state={state} />}
      <button type="submit" className="btn-primary mt-1 w-full" disabled={pending}>
        {pending ? "جارٍ التحقق…" : "تأكيد الدخول"}
      </button>
      <button
        type="button"
        className="text-xs text-muted underline-offset-4 hover:text-text hover:underline"
        onClick={() => setMode((m) => (m === "totp" ? "recovery" : "totp"))}
      >
        {mode === "totp" ? "استخدم رمز استرداد" : "استخدم رمز التطبيق"}
      </button>
    </form>
  );
}
