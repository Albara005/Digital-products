"use client";

import { useState } from "react";
import { formatCompactPlain, formatPlain } from "@/lib/display-currency";

export type DailyPoint = {
  key: string; // YYYY-MM-DD
  axisLabel: string; // short, e.g. "12/9"
  fullLabel: string; // tooltip / table
  /** Minor units of the chart currency (the admin currency). */
  cents: number;
  orders: number;
};

// Same validated volt step as the dashboard chart (single series: one hue, no legend needed).
const BAR = "#7f9c1d";
const BAR_ACTIVE = "#d4ff3d";
const PLOT_H = 200;

function niceScale(maxCents: number) {
  if (maxCents <= 0) return { top: 10000, step: 2500 };
  const raw = maxCents / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  return { top: Math.ceil(maxCents / step) * step, step };
}

/**
 * Revenue per day for any range length (7–366 bars). Bars are an SVG scaled to the plot; the hit
 * targets and tooltips are HTML so they follow the page's RTL flow: the oldest day is on the right,
 * like the dashboard chart.
 */
export function DailyRevenueChart({ points, currency = "USD" }: { points: DailyPoint[]; currency?: string }) {
  const usd = (minor: number) => formatPlain(minor, currency);
  const usdCompact = (minor: number) => formatCompactPlain(minor, currency);
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const max = Math.max(0, ...points.map((p) => p.cents));
  const { top, step } = niceScale(max);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const labelEvery = Math.max(1, Math.ceil(n / 10));
  const gap = n > 60 ? 0.15 : 0.3; // fraction of each slot left empty (the surface gap between bars)

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative w-12 shrink-0" style={{ height: PLOT_H }} aria-hidden="true">
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

        <div className="relative flex-1" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <div
              key={t}
              aria-hidden="true"
              className={`absolute inset-x-0 border-t ${t === 0 ? "border-muted/40" : "border-border/70"}`}
              style={{ bottom: `${(t / top) * 100}%` }}
            />
          ))}

          <svg
            className="absolute inset-0 size-full"
            viewBox={`0 0 ${n} ${PLOT_H}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {points.map((p, i) => {
              if (p.cents <= 0) return null;
              const h = Math.max((p.cents / top) * PLOT_H, 2);
              // Mirrored: index 0 (oldest) sits at the right edge, matching the RTL hit targets.
              const x = n - 1 - i + gap / 2;
              return <rect key={p.key} x={x} y={PLOT_H - h} width={1 - gap} height={h} fill={active === i ? BAR_ACTIVE : BAR} />;
            })}
          </svg>

          {max === 0 && (
            <p className="absolute inset-0 grid place-items-center text-sm text-muted">لا توجد مبيعات مدفوعة خلال هذه الفترة</p>
          )}

          <div className="absolute inset-0 flex items-stretch">
            {points.map((p, i) => {
              const pct = (p.cents / top) * 100;
              const align = i < n * 0.15 ? "start-0" : i > n * 0.85 ? "end-0" : "left-1/2 -translate-x-1/2";
              return (
                <button
                  key={p.key}
                  type="button"
                  className="relative flex-1 outline-none focus-visible:bg-text/[0.06]"
                  aria-label={`${p.fullLabel}: ${usd(p.cents)}، ${p.orders} طلب`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((cur) => (cur === i ? null : cur))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((cur) => (cur === i ? null : cur))}
                >
                  {active === i && (
                    <span
                      role="tooltip"
                      className={`pointer-events-none absolute z-10 min-w-32 rounded-lg border border-border bg-surface-2 px-3 py-2 text-start shadow-xl ${align}`}
                      style={{ bottom: `min(calc(${pct}% + 10px), calc(100% - 64px))` }}
                    >
                      <span className="block font-display text-sm font-bold text-text">{usd(p.cents)}</span>
                      <span className="block whitespace-nowrap text-xs text-muted">{p.fullLabel}</span>
                      <span className="block text-xs text-muted">{p.orders} طلب</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative ms-14 mt-2 h-4" aria-hidden="true">
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <span
              key={p.key}
              className="absolute translate-x-1/2 whitespace-nowrap text-[11px] tabular-nums text-muted"
              style={{ right: `${((i + 0.5) / n) * 100}%` }}
            >
              {p.axisLabel}
            </span>
          ) : null,
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-xs text-muted hover:text-text">عرض البيانات كجدول</summary>
        <div className="max-h-72 overflow-y-auto">
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
        </div>
      </details>
    </div>
  );
}
