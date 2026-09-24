"use client";

import { useState } from "react";
import { formatCompactPlain, formatPlain } from "@/lib/display-currency";

export type RevenuePoint = {
  key: string; // YYYY-MM-DD
  dayLabel: string; // short axis label
  fullLabel: string; // tooltip / table label
  /** Minor units of the chart currency (the admin currency). */
  cents: number;
  orders: number;
  isToday: boolean;
};

// Bars use a step of the volt ramp validated for the dark surface (OKLCH L inside 0.48–0.67,
// ≥3:1 on #141414); today's bar carries the brand accent as emphasis.
const BAR = "bg-[#7f9c1d]";
const BAR_TODAY = "bg-volt";
const PLOT_H = 176;

function niceScale(maxCents: number) {
  if (maxCents <= 0) return { top: 10000, step: 2500 };
  const raw = maxCents / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { top: Math.ceil(maxCents / step) * step, step };
}

export function RevenueChart({ points, currency = "USD" }: { points: RevenuePoint[]; currency?: string }) {
  const usd = (minor: number) => formatPlain(minor, currency);
  const usdCompact = (minor: number) => formatCompactPlain(minor, currency);
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...points.map((p) => p.cents));
  const { top, step } = niceScale(max);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const peak = max > 0 ? points.findIndex((p) => p.cents === max) : -1;
  const n = points.length;

  return (
    <div>
      <div className="flex gap-2">
        {/* Y axis (start side) */}
        <div className="relative w-11 shrink-0" style={{ height: PLOT_H }} aria-hidden="true">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute end-0 translate-y-1/2 font-display text-[11px] tabular-nums text-muted"
              style={{ bottom: `${(t / top) * 100}%` }}
            >
              {usdCompact(t)}
            </span>
          ))}
        </div>

        {/* Plot */}
        <div className="relative flex-1" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden="true"
              className={`absolute inset-x-0 border-t ${t === 0 ? "border-muted/40" : "border-border/70"}`}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}

          {max === 0 && (
            <p className="absolute inset-0 grid place-items-center text-sm text-muted">
              لا توجد مبيعات مدفوعة خلال هذه الفترة
            </p>
          )}

          <div className="absolute inset-0 flex items-stretch">
            {points.map((p, i) => {
              const pct = (p.cents / top) * 100;
              const isActive = active === i;
              const align = i < 2 ? "start-0" : i > n - 3 ? "end-0" : "left-1/2 -translate-x-1/2";
              return (
                <button
                  key={p.key}
                  type="button"
                  className="group relative flex flex-1 items-end justify-center outline-none"
                  aria-label={`${p.fullLabel}: ${usd(p.cents)}، ${p.orders} طلب`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                >
                  {isActive && <span className="absolute inset-x-0.5 inset-y-0 rounded-md bg-text/[0.04]" aria-hidden="true" />}
                  <span
                    className={`relative w-[62%] max-w-6 rounded-t-[4px] transition-[filter] ${p.isToday ? BAR_TODAY : BAR} ${
                      isActive ? "brightness-125" : ""
                    } group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-volt`}
                    style={{ height: p.cents > 0 ? `max(${pct}%, 2px)` : 0 }}
                  />
                  {i === peak && !isActive && (
                    <span
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-[11px] font-semibold text-text"
                      style={{ bottom: `calc(${pct}% + 4px)` }}
                      aria-hidden="true"
                    >
                      {usdCompact(p.cents)}
                    </span>
                  )}
                  {isActive && (
                    <span
                      role="tooltip"
                      className={`pointer-events-none absolute z-10 min-w-32 rounded-lg border border-border bg-surface-2 px-3 py-2 text-start shadow-xl ${align}`}
                      style={{ bottom: `calc(${pct}% + 10px)` }}
                    >
                      <span className="block font-display text-sm font-bold text-text">{usd(p.cents)}</span>
                      <span className="block text-xs text-muted">{p.fullLabel}</span>
                      <span className="block text-xs text-muted">{p.orders} طلب مدفوع</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* X axis */}
      <div className="ms-13 mt-2 flex" aria-hidden="true">
        {points.map((p) => (
          <span
            key={p.key}
            className={`flex-1 text-center text-[11px] tabular-nums ${p.isToday ? "font-semibold text-text" : "text-muted"}`}
          >
            {p.dayLabel}
          </span>
        ))}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs text-muted hover:text-text">عرض البيانات كجدول</summary>
        <table className="mt-2 w-full text-xs">
          <thead>
            <tr className="text-muted">
              <th className="py-1.5 text-start font-medium">اليوم</th>
              <th className="py-1.5 text-start font-medium">الطلبات</th>
              <th className="py-1.5 text-end font-medium">الإيراد</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.key} className="border-t border-border">
                <td className="py-1.5">{p.fullLabel}</td>
                <td className="py-1.5 tabular-nums">{p.orders}</td>
                <td className="py-1.5 text-end font-display tabular-nums">{usd(p.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
