"use client";

import { useState } from "react";
import { formatMoney, inputToUsdCents } from "@/lib/display-currency";

/** The admin's display currency and its current rate (units per USD), from the server. */
export type AdminFx = { currency: string; rate: number };

/**
 * A money field typed in the admin's currency. The server stores USD cents
 * (round(value / rate x 100)) using its own rate for the posted `moneyCurrency`; the hint under
 * the field shows the USD amount that will be stored.
 */
export function MoneyInput({
  id,
  name,
  fx,
  defaultValue = "",
  placeholder,
  invalid,
  signed = false,
  onChange,
  ariaLabel,
  className = "",
}: {
  id?: string;
  name: string;
  fx: AdminFx;
  defaultValue?: string;
  placeholder?: string;
  invalid?: boolean;
  /** Allow a leading "-" (wallet debits). */
  signed?: boolean;
  onChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const usd = value.trim() ? inputToUsdCents(value, fx.currency, fx.rate, { signed }) : null;
  return (
    <div className={className}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center font-display text-xs text-muted">
          {fx.currency}
        </span>
        <input
          id={id}
          name={name}
          dir="ltr"
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e) => {
            setValue(e.target.value);
            onChange?.(e.target.value);
          }}
          className="input pl-12! text-left font-display"
          aria-invalid={invalid || undefined}
        />
      </div>
      {fx.currency !== "USD" && usd !== null ? (
        <p className="mt-1 text-[11px] text-muted">
          يُحفظ:{" "}
          <span dir="ltr" className="font-display">
            = {formatMoney(usd, "USD")} USD
          </span>
        </p>
      ) : null}
      <input type="hidden" name="moneyCurrency" value={fx.currency} />
    </div>
  );
}
