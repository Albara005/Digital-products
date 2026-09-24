import type { FormState } from "@/app/admin/_lib/form-state";
import { FieldError } from "./ui";

/** 6-digit authenticator code field (one-time-code autofill, numeric keypad on phones). */
export function CodeInput({
  id,
  state,
  label = "رمز التحقق من التطبيق",
  autoFocus,
}: {
  id: string;
  state: FormState;
  label?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name="code"
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="000000"
        required
        autoFocus={autoFocus}
        className="input text-center font-display text-lg! tracking-[0.4em]"
        aria-invalid={Boolean(state?.errors?.code)}
      />
      <FieldError state={state} name="code" />
    </div>
  );
}
