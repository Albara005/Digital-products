"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import { useLocale, useLocalePath, useT } from "@/i18n/client";
import { LOCALE_HEADER } from "@/i18n/config";
import { formatPrice } from "@/lib/format";
import { IconAlert, IconCard, IconLock, IconSpinner, IconWallet } from "./icons";
import { latinDigits } from "./site";

export type PaymentProviderOption = { id: "STRIPE" | "TAP"; label: string };

const PRESETS = [1000, 2500, 5000, 10000];
// Mirrors POST /api/wallet/topup: 500..50000 cents, whole dollars only.
const MIN_CENTS = 500;
const MAX_CENTS = 50000;
const noopSubscribe = () => () => {};

export function TopupForm({
  providers,
  devMode,
  currency,
}: {
  providers: PaymentProviderOption[];
  devMode: boolean;
  currency: string;
}) {
  const id = useId();
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const localePath = useLocalePath();
  const [choice, setChoice] = useState<number | "custom">(2500);
  const [custom, setCustom] = useState("");
  const [provider, setProvider] = useState(providers[0]?.id);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The form posts with fetch; until hydration a click would fall back to a native GET.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const rangeText = t.topup.range(formatPrice(MIN_CENTS, currency), formatPrice(MAX_CENTS, currency));
  const customCents = custom ? Number(custom) * 100 : 0;
  const amountCents = choice === "custom" ? customCents : choice;
  const amountValid = Number.isSafeInteger(amountCents) && amountCents >= MIN_CENTS && amountCents <= MAX_CENTS;
  const unavailable = providers.length === 0 && !devMode;
  const customError =
    choice === "custom" && custom !== "" && !amountValid
      ? t.topup.enterAmount(rangeText)
      : null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!amountValid || unavailable || submitting) {
      if (!amountValid) setError(t.topup.chooseAmount(rangeText));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json", [LOCALE_HEADER]: locale },
        body: JSON.stringify({ amountCents, ...(provider ? { provider } : {}) }),
      });
      if (res.status === 401) {
        // Session expired since the page loaded.
        router.push(localePath("/login?next=/account"));
        return;
      }
      const data: unknown = await res.json().catch(() => null);
      const body = (data && typeof data === "object" ? data : {}) as { url?: unknown; error?: unknown };
      if (res.ok && typeof body.url === "string") {
        const target = new URL(body.url, window.location.origin);
        if (target.protocol === "https:" || target.protocol === "http:") {
          setRedirecting(true);
          window.location.assign(target.href);
          return;
        }
      }
      setError(typeof body.error === "string" && body.error ? body.error : t.topup.failed);
    } catch {
      setError(t.topup.network);
    }
    setSubmitting(false);
  }

  if (redirecting) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center" role="status">
        <IconSpinner className="size-7 text-volt" />
        <p className="font-bold">{t.topup.redirecting}</p>
        <p className="text-sm text-muted">{t.topup.dontClose}</p>
      </div>
    );
  }

  const chip = (checked: boolean) =>
    `flex h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-bold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt/60 ${
      checked
        ? "border-volt bg-volt/[0.07] text-volt shadow-[inset_0_0_0_1px_var(--color-volt)]"
        : "border-border bg-surface-2 text-text hover:border-muted/50"
    }`;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <fieldset disabled={unavailable || submitting}>
        <legend className="mb-3 text-sm font-bold">{t.topup.amountLegend}</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {PRESETS.map((cents) => (
            <label key={cents} className={chip(choice === cents)}>
              <input
                type="radio"
                name={`${id}-amount`}
                value={cents}
                checked={choice === cents}
                onChange={() => setChoice(cents)}
                className="sr-only"
              />
              <span dir="ltr" className="font-display tabular-nums">
                {formatPrice(cents, currency).replace(/\.00$/, "")}
              </span>
            </label>
          ))}
          <label className={`${chip(choice === "custom")} col-span-2 sm:col-span-1`}>
            <input
              type="radio"
              name={`${id}-amount`}
              value="custom"
              checked={choice === "custom"}
              onChange={() => setChoice("custom")}
              className="sr-only"
            />
            {t.topup.other}
          </label>
        </div>

        {choice === "custom" ? (
          <div className="mt-3">
            <label htmlFor={`${id}-custom`} className="label">
              {t.topup.customLabel}
            </label>
            <div className="relative">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center font-display text-muted"
              >
                $
              </span>
              <input
                id={`${id}-custom`}
                type="text"
                inputMode="numeric"
                dir="ltr"
                autoFocus
                autoComplete="off"
                value={custom}
                onChange={(e) => setCustom(latinDigits(e.target.value).replace(/^0+/, "").slice(0, 3))}
                aria-invalid={customError ? true : undefined}
                aria-describedby={customError ? `${id}-custom-error` : undefined}
                placeholder="40"
                className={`input h-11 pl-7 text-left font-display text-base tabular-nums ${customError ? "border-danger focus:border-danger" : ""}`}
              />
            </div>
            {customError ? (
              <p id={`${id}-custom-error`} className="mt-1.5 text-xs text-danger">
                {customError}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {providers.length > 1 ? (
        <fieldset disabled={submitting}>
          <legend className="mb-3 text-sm font-bold">{t.topup.paymentMethod}</legend>
          <div className="grid grid-cols-2 gap-2">
            {providers.map((p) => (
              <label key={p.id} className={`${chip(provider === p.id)} gap-2 px-3`}>
                <input
                  type="radio"
                  name={`${id}-provider`}
                  value={p.id}
                  checked={provider === p.id}
                  onChange={() => setProvider(p.id)}
                  className="sr-only"
                />
                <IconCard className="size-4 shrink-0" />
                <span className="truncate">{p.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {unavailable ? (
        <p className="flex items-start gap-2 rounded-lg border border-volt/30 bg-volt/10 p-3 text-sm text-volt">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {t.topup.unavailable}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!hydrated || unavailable || submitting || (choice === "custom" && !amountValid)}
        className="btn-primary h-12 w-full text-base"
      >
        {submitting ? (
          <>
            <IconSpinner className="size-4" />
            {t.topup.submitting}
          </>
        ) : (
          <>
            <IconWallet className="size-4" />
            {t.topup.topUp}{" "}
            {amountValid ? (
              <span dir="ltr" className="font-display tabular-nums">
                {formatPrice(amountCents, currency)}
              </span>
            ) : (
              t.topup.balance
            )}
          </>
        )}
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <IconLock className="size-3.5" />
        {t.topup.secure}
      </p>
    </form>
  );
}
