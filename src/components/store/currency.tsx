"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocale, useT } from "@/i18n/client";
import {
  BASE_CURRENCY,
  CURRENCY_COOKIE,
  CURRENCY_COOKIE_MAX_AGE,
  CURRENCY_SOURCE_COOKIE,
  type CurrencyOption,
  type CurrencySource,
  type DisplayCurrency,
  currencyForTimeZone,
  formatConverted,
} from "@/lib/display-currency";

// The visitor's display currency. The server reads the cookie for the first render (so the HTML
// already shows the right approximations); switching updates the context immediately and the
// cookie for later visits. Only USD prices are converted, and only for display.

type CurrencyContextValue = {
  /** null = USD (no conversion shown). */
  selected: CurrencyOption | null;
  options: CurrencyOption[];
  /** true while the currency follows the visitor's country (not picked by hand). */
  auto: boolean;
  /** Manual choice: remembered and never replaced by detection. */
  select: (code: DisplayCurrency | typeof BASE_CURRENCY) => void;
  /** Back to automatic detection from the visitor's country. */
  selectAuto: () => void;
};

const CurrencyContext = createContext<CurrencyContextValue>({
  selected: null,
  options: [],
  auto: true,
  select: () => {},
  selectAuto: () => {},
});

function writeCookies(code: string, source: CurrencySource) {
  try {
    const attrs = `path=/; max-age=${CURRENCY_COOKIE_MAX_AGE}; samesite=lax`;
    document.cookie = `${CURRENCY_COOKIE}=${code}; ${attrs}`;
    document.cookie = `${CURRENCY_SOURCE_COOKIE}=${source}; ${attrs}`;
  } catch {
    // Cookies blocked: the choice still applies for this visit.
  }
}

/** The browser's time zone is a reliable country signal even when no CDN country header exists. */
function detectFromBrowser(options: CurrencyOption[]): string {
  try {
    const code = currencyForTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    return code && options.some((o) => o.code === code) ? code : BASE_CURRENCY;
  } catch {
    return BASE_CURRENCY;
  }
}

export function CurrencyProvider({
  initial,
  options,
  manual,
  children,
}: {
  initial: string;
  options: CurrencyOption[];
  /** The visitor picked the currency by hand (cookie), so detection must not replace it. */
  manual: boolean;
  children: React.ReactNode;
}) {
  const [code, setCode] = useState(initial);
  const [auto, setAuto] = useState(!manual);

  // Unless the visitor picked a currency by hand, follow their country (browser time zone).
  useEffect(() => {
    if (!auto) return;
    const detected = detectFromBrowser(options);
    writeCookies(detected, "auto");
    // The time zone only exists in the browser, so this can't be computed during render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(detected);
  }, [auto, options]);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      selected: options.find((o) => o.code === code) ?? null,
      options,
      auto,
      select(next) {
        setCode(next);
        setAuto(false);
        writeCookies(next, "manual");
      },
      selectAuto() {
        const detected = detectFromBrowser(options);
        setCode(detected);
        setAuto(true);
        writeCookies(detected, "auto");
      },
    }),
    [code, auto, options],
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
