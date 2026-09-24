"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/i18n/client";
import {
  BASE_CURRENCY,
  CURRENCY_COOKIE,
  CURRENCY_COOKIE_MAX_AGE,
  CURRENCY_SOURCE_COOKIE,
  type CurrencyOption,
  type CurrencySource,
  type DisplayCurrency,
  convertUsdCents,
  currencyForTimeZone,
  formatMoney,
} from "@/lib/display-currency";

// The visitor's store currency. The server reads the cookie for the first render (so the HTML
// already shows local prices); switching updates the context immediately, the cookie (which
// checkout reads) and refreshes server-rendered parts. Catalog prices are USD cents and are
// converted with convertUsdCents(), the same helper checkout charges with.

type CurrencyContextValue = {
  /** null = USD. */
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
  const router = useRouter();
  const rendered = useRef(initial);

  // Server-rendered amounts (account, order pages) follow the cookie: re-render them on a change.
  useEffect(() => {
    if (rendered.current === code) return;
    rendered.current = code;
    router.refresh();
  }, [code, router]);

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

export type Money = {
  /** "USD" or the selected currency. */
  currency: string;
  /** Units of `currency` per USD (1 for USD). */
  rate: number;
  /** USD cents -> minor units of the selected currency (exactly what checkout charges). */
  convert: (usdCents: number) => number;
  /** Minor units of `currency` (default: the selected one) as text. */
  format: (minor: number, currency?: string) => string;
  /** USD cents shown in the selected currency. */
  formatUsd: (usdCents: number) => string;
};

/** The selected currency with its converter and formatter. */
export function useMoney(): Money {
  const { selected } = useContext(CurrencyContext);
  const locale = useLocale();
  return useMemo(() => {
    const currency = selected?.code ?? BASE_CURRENCY;
    const rate = selected?.rate ?? 1;
    const convert = (usdCents: number) => convertUsdCents(usdCents, currency, rate);
    const format = (minor: number, code: string = currency) => formatMoney(minor, code, locale);
    return { currency, rate, convert, format, formatUsd: (usdCents: number) => format(convert(usdCents)) };
  }, [selected, locale]);
}

/**
 * A catalog amount (USD cents) shown in the visitor's currency; Latin digits, LTR run isolated from
 * the surrounding Arabic text. A non-USD `currency` is shown as is.
 */
export function Price({ cents, currency = BASE_CURRENCY, className = "" }: { cents: number; currency?: string; className?: string }) {
  const money = useMoney();
  const text = currency.toUpperCase() === BASE_CURRENCY ? money.formatUsd(cents) : money.format(cents, currency);
  return (
    <span dir="ltr" className={`font-display font-bold tabular-nums ${className}`}>
      {text}
    </span>
  );
}

/** A fixed amount in a given currency (an order's own charged currency), never converted. */
export function Money({ minor, currency, className = "" }: { minor: number; currency: string; className?: string }) {
  const locale = useLocale();
  return (
    <span dir="ltr" className={`font-display tabular-nums ${className}`}>
      {formatMoney(minor, currency, locale)}
    </span>
  );
}
