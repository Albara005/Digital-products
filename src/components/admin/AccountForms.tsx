"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormAction, FormState } from "@/app/admin/_lib/form-state";
import { CodeInput } from "./CodeInput";
import { CopyButton } from "./CopyButton";
import { FieldError, FormMessage, btnSm } from "./ui";
import { useFormAction } from "./useFormAction";

/** FormState plus the freshly generated recovery codes (only on the response that created them). */
export type RecoveryCodesState = (NonNullable<FormState> & { codes?: string[] }) | null;

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

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
}

function downloadCodes(codes: string[], email?: string) {
  const text = [
    "Nitro Store — admin 2FA recovery codes",
    email ? `Account: ${email}` : null,
    `Generated: ${new Date().toISOString()}`,
    "",
    "Each code works once, instead of the authenticator code.",
    "",
    ...codes,
    "",
  ]
    .filter((l) => l !== null)
    .join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "nitro-recovery-codes.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The one-time display of new recovery codes. */
export function RecoveryCodesPanel({ codes, email, onDone }: { codes: string[]; email?: string; onDone: () => void }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-volt/40 bg-volt/5 p-4" role="region" aria-label="رموز الاسترداد">
      <div>
        <p className="font-semibold">احفظ رموز الاسترداد الآن</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          إن فقدت هاتفك، يمكنك الدخول بأحد هذه الرموز بدل رمز التطبيق. كل رمز يعمل مرة واحدة.{" "}
          <strong className="text-text">لن تظهر مرة أخرى</strong> — احفظها في مدير كلمات المرور أو اطبعها.
        </p>
      </div>
      <ol dir="ltr" className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg p-3 font-mono text-sm tracking-wider">
        {codes.map((c) => (
          <li key={c} className="text-center">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <CopyButton text={codes.join("\n")} label="نسخ الرموز" />
        <button type="button" className={btnSm.ghost} onClick={() => downloadCodes(codes, email)}>
          <DownloadIcon className="size-3.5" />
          تنزيل كملف txt
        </button>
        <button type="button" className={`${btnSm.primary} ms-auto`} onClick={onDone}>
          حفظتها، متابعة
        </button>
      </div>
    </div>
  );
}

/**
 * Password + authenticator code, used to confirm enabling 2FA, to disable it and to regenerate
 * recovery codes. When the action returns `codes`, they are shown once until the admin dismisses them.
 */
export function PasswordAndCodeForm({
  action,
  idPrefix,
  submitLabel,
  pendingLabel,
  danger = false,
  email,
}: {
  action: FormAction;
  idPrefix: string;
  submitLabel: string;
  pendingLabel: string;
  danger?: boolean;
  email?: string;
}) {
  const [state, form, pending] = useFormAction(action);
  const router = useRouter();
  const [dismissed, setDismissed] = useState<number | undefined>(undefined);
  const codes = (state as RecoveryCodesState)?.codes;
  if (state?.ok && codes?.length && state.ts !== dismissed) {
    return (
      <div className="flex flex-col gap-3">
        <FormMessage state={state} />
        <RecoveryCodesPanel
          codes={codes}
          email={email}
          onDone={() => {
            setDismissed(state.ts);
            router.refresh();
          }}
        />
      </div>
    );
  }
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
