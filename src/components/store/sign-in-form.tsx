"use client";

import { useActionState, useEffect, useState } from "react";
import { signInAction, type SignInState } from "@/app/(store)/login/actions";
import { IconAlert, IconArrow, IconMail, IconSpinner } from "./icons";
import { latinDigits } from "./site";

const RESEND_COOLDOWN_MS = 60_000;
const initialState: SignInState = { step: "email", email: "", error: null, sentAt: null, attempt: 0 };

/** Seconds left until `until` (ticks once a second while > 0). */
function useSecondsLeft(until: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);
  if (until === null) return 0;
  return Math.min(Math.max(Math.ceil((until - now) / 1000), 0), RESEND_COOLDOWN_MS / 1000);
}

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [email, setEmail] = useState("");
  // The response (attempt) at which the customer chose to change their email.
  const [editingAt, setEditingAt] = useState<number | null>(null);

  const onCodeStep = state.step === "code" && editingAt !== state.attempt;
  const secondsLeft = useSecondsLeft(onCodeStep && state.sentAt ? state.sentAt + RESEND_COOLDOWN_MS : null);

  const error = state.error ? (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
      <IconAlert className="mt-0.5 size-4 shrink-0" />
      {state.error}
    </p>
  ) : null;

  if (!onCodeStep) {
    return (
      <form action={formAction} className="mt-5 space-y-4">
        <p className="text-sm leading-7 text-muted">
          لا تحتاج إلى كلمة مرور. أدخل بريدك الإلكتروني وسنرسل لك رمز دخول من 6 أرقام.
        </p>
        <input type="hidden" name="intent" value="send" />
        <div>
          <label htmlFor="signin-email" className="label">
            البريد الإلكتروني
          </label>
          <input
            id="signin-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
            maxLength={254}
            autoFocus={editingAt !== null}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="input h-12 text-start text-base"
          />
        </div>
        {error}
        <button type="submit" disabled={pending} className="btn-primary h-12 w-full text-base">
          {pending ? (
            <>
              <IconSpinner className="size-4" />
              جارٍ الإرسال…
            </>
          ) : (
            <>
              <IconMail className="size-4" />
              أرسل الرمز
            </>
          )}
        </button>
      </form>
    );
  }

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm leading-7 text-muted">
        أرسلنا رمزاً من 6 أرقام إلى{" "}
        <bdi dir="ltr" className="font-semibold text-text">
          {state.email}
        </bdi>
        . قد يستغرق وصوله دقيقة؛ تحقّق أيضاً من مجلد الرسائل غير المرغوب فيها.
      </p>

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="signin-code" className="label">
            رمز الدخول
          </label>
          <input
            // A new response (e.g. a wrong code) remounts an empty, focused field.
            key={state.attempt}
            id="signin-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            required
            autoFocus
            aria-describedby="signin-code-hint"
            aria-invalid={state.error ? true : undefined}
            placeholder="••••••"
            onInput={(e) => {
              // Accepts pasted text like "123 456" or "Code: ١٢٣٤٥٦" and submits once 6 digits are in.
              const el = e.currentTarget;
              const digits = latinDigits(el.value).slice(0, 6);
              if (digits !== el.value) el.value = digits;
              if (digits.length === 6 && !pending) el.form?.requestSubmit();
            }}
            className="input h-14 text-center font-display text-2xl font-bold tracking-[0.5em] tabular-nums placeholder:tracking-[0.5em]"
          />
          <p id="signin-code-hint" className="mt-1.5 text-xs text-muted">
            الرمز صالح لمدة 10 دقائق. يمكنك لصقه مباشرة.
          </p>
        </div>
        {error}
        <button type="submit" disabled={pending} className="btn-primary h-12 w-full text-base">
          {pending ? (
            <>
              <IconSpinner className="size-4" />
              جارٍ التحقق…
            </>
          ) : (
            <>
              تأكيد الدخول
              <IconArrow className="size-4" />
            </>
          )}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-sm">
        <form action={formAction}>
          <input type="hidden" name="intent" value="resend" />
          <button
            type="submit"
            disabled={pending || secondsLeft > 0}
            className="font-semibold text-volt transition hover:text-volt-dim disabled:cursor-not-allowed disabled:text-muted"
          >
            {secondsLeft > 0 ? (
              <>
                إعادة الإرسال بعد{" "}
                <span dir="ltr" className="font-display tabular-nums">
                  {secondsLeft}
                </span>{" "}
                ث
              </>
            ) : (
              "إعادة إرسال الرمز"
            )}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setEmail(state.email);
            setEditingAt(state.attempt);
          }}
          disabled={pending}
          className="text-muted underline decoration-border underline-offset-4 transition hover:text-text hover:decoration-volt"
        >
          تغيير البريد
        </button>
      </div>
    </div>
  );
}
