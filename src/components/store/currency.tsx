"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import {
  BASE_CURRENCY,
  CURRENCY_COOKIE,
  type CurrencyOption,
  type DisplayCurrency,
  formatConverted,
} from "@/lib/display-currency";

// The visitor's display currency. The server reads the cookie for the first render (so the HTML
// already shows the right approximations); switching updates the context immediately and the
// cookie for later visits. Only USD prices are converted, and only for display.

type CurrencyContextValue = {
  /** null = USD (no conversion shown). */
  selected: CurrencyOption | null;
  options: CurrencyOption[];
  select: (code: DisplayCurrency | typeof BASE_CURRENCY) => void;
};

const CurrencyContext = createContext<CurrencyContextValue>({ selected: null, options: [], select: () => {} });

export function CurrencyProvider({
  initial,
  options,
  children,
}: {
  initial: string;
  options: CurrencyOption[];
  children: React.ReactNode;
}) {
  const [code, setCode] = useState(initial);
  const value = useMemo<CurrencyContextValue>(
    () => ({
      selected: options.find((o) => o.code === code) ?? null,
      options,
      select(next) {
        setCode(next);
        try {
          document.cookie = `${CURRENCY_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
        } catch {
          // Cookies blocked: the choice still applies for this visit.
        }
      },
    }),
    [code, options],
  );
  return <CurrencyContext value={value}>{children}</CurrencyContext>;
}

export function useDisplayCurrency() {
  return useContext(CurrencyContext);
}

/** Formatter for the approximate converted amount, or null when nothing should be shown. */
export function useApprox(): (cents: number, currency?: string) => string | null {
  const { selected } = useContext(CurrencyContext);
  const locale = useLocale();
  return (cents, currency = BASE_CURRENCY) =>
    selected && currency.toUpperCase() === BASE_CURRENCY ? `≈ ${formatConverted(cents, selected, locale)}` : null;
}

/** "≈ 18.75 ر.س." next to a USD price; renders nothing when the visitor shows prices in USD. */
export function Approx({ cents, currency = BASE_CURRENCY, className = "" }: { cents: number; currency?: string; className?: string }) {
  const approx = useApprox();
  const t = useT();
  const text = approx(cents, currency);
  if (!text) return null;
  return (
    <span title={t.prefs.approxTitle} className={`font-display text-xs font-medium whitespace-nowrap text-muted tabular-nums ${className}`}>
      <bdi>{text}</bdi>
    </span>
  );
}
