"use client";

import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { CodeInput } from "./CodeInput";
import { FieldError, FormMessage } from "./ui";
import { useFormAction } from "./useFormAction";

function PasswordField({
  id,
  name,
  label,
  state,
  autoComplete,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  state: FormState;
  autoComplete: "current-password" | "new-password";
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        dir="ltr"
        autoComplete={autoComplete}
        required
        minLength={autoComplete === "new-password" ? 10 : undefined}
        maxLength={200}
        className="input text-start"
        aria-invalid={Boolean(state?.errors?.[name])}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <FieldError state={state} name={name} />
    </div>
  );
}

export function AccountNameForm({ action, name }: { action: FormAction; name: string }) {
  const [state, form, pending] = useFormAction(action);
  return (
    <form {...form} className="flex flex-col gap-3" noValidate>
      <div>
        <label htmlFor="acc-name" className="label">
          الاسم الظاهر للفريق
        </label>
        <div className="flex gap-2">
          <input
            id="acc-name"
            name="name"
            defaultValue={name}
            maxLength={80}
            required
            autoComplete="name"
            className="input"
            aria-invalid={Boolean(state?.errors?.name)}
          />
          <button type="submit" className="btn-ghost shrink-0" disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
        <FieldError state={state} name="name" />
      </div>
      {state && !state.errors && <FormMessage state={state} />}
    </form>
  );
}

export function ChangePasswordForm({ action }: { action: FormAction }) {
  const [state, form, pending] = useFormAction(action);
  return (
    <form {...form} className="flex flex-col gap-4" noValidate>
      {/* Remount (clear) the fields after a successful change */}
      <div key={state?.ts ?? "fields"} className="flex flex-col gap-4">
        <PasswordField id="pw-current" name="currentPassword" label="كلمة المرور الحالية" state={state} autoComplete="current-password" />
        <PasswordField
          id="pw-new"
          name="newPassword"
          label="كلمة المرور الجديدة"
          state={state}
          autoComplete="new-password"
          hint="10 أحرف على الأقل. جملة طويلة يسهل تذكّرها أفضل من كلمة قصيرة معقّدة."
        />
        <PasswordField id="pw-confirm" name="confirmPassword" label="تأكيد كلمة المرور الجديدة" state={state} autoComplete="new-password" />
      </div>
      {state && !state.errors && <FormMessage state={state} />}
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "جارٍ التغيير…" : "تغيير كلمة المرور"}
        </button>
      </div>
    </form>
  );
}

/** Password + authenticator code, used to confirm enabling 2FA and to disable it. */
export function PasswordAndCodeForm({
  action,
  idPrefix,
  submitLabel,
  pendingLabel,
  danger = false,
}: {
  action: FormAction;
  idPrefix: string;
  submitLabel: string;
  pendingLabel: string;
  danger?: boolean;
}) {
  const [state, form, pending] = useFormAction(action);
  return (
    <form {...form} className="flex flex-col gap-4" noValidate>
      <div key={state?.ts ?? "fields"} className="grid gap-4 sm:grid-cols-2">
        <CodeInput id={`${idPrefix}-code`} state={state} />
        <PasswordField
          id={`${idPrefix}-password`}
          name="currentPassword"
          label="كلمة المرور الحالية"
          state={state}
          autoComplete="current-password"
        />
      </div>
      {state && !state.errors && <FormMessage state={state} />}
      <div>
        <button type="submit" className={danger ? "btn-danger" : "btn-primary"} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
