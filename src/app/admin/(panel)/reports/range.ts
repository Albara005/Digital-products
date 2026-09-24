import { addDays, dayKey, startOfDay } from "../../_lib/dates";

/*
 * Report date ranges. Day boundaries use the server's local time zone (the TZ env var, e.g.
 * TZ=Asia/Riyadh), like the dashboard. `end` is exclusive: [start, end).
 */

export const PRESETS = ["7d", "30d", "90d", "month", "custom"] as const;
export type Preset = (typeof PRESETS)[number];

export const presetLabel: Record<Preset, string> = {
  "7d": "آخر 7 أيام",
  "30d": "آخر 30 يوماً",
  "90d": "آخر 90 يوماً",
  month: "هذا الشهر",
  custom: "مخصّص",
};

const MAX_DAYS = 366;

export type ReportRange = {
  preset: Preset;
  start: Date;
  end: Date;
  /** Inclusive local dates, YYYY-MM-DD */
  from: string;
  to: string;
  days: number;
};

type Params = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

function parseDay(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Rejects 2026-02-31 and friends (Date would roll them over)
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

function daysBetween(start: Date, endExclusive: Date) {
  // Rounded: DST shifts make some local days 23 or 25 hours long
  return Math.round((endExclusive.getTime() - start.getTime()) / 86_400_000);
}

function build(preset: Preset, start: Date, end: Date): ReportRange {
  return { preset, start, end, from: dayKey(start), to: dayKey(addDays(end, -1)), days: daysBetween(start, end) };
}

/** Reads ?range=7d|30d|90d|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD; anything invalid falls back to 30 days. */
export function parseRange(sp: Params, now = new Date()): ReportRange {
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  const preset = (PRESETS as readonly string[]).includes(one(sp.range)) ? (one(sp.range) as Preset) : "30d";

  if (preset === "custom") {
    let from = parseDay(one(sp.from));
    let to = parseDay(one(sp.to));
    if (from && to) {
      if (from > to) [from, to] = [to, from];
      let end = addDays(to, 1);
      if (daysBetween(from, end) > MAX_DAYS) end = addDays(from, MAX_DAYS);
      return build("custom", from, end);
    }
  }
  if (preset === "month") return build("month", new Date(today.getFullYear(), today.getMonth(), 1), tomorrow);
  const n = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
  return build(preset === "custom" ? "30d" : preset, addDays(today, -(n - 1)), tomorrow);
}

/** Query string for links (export, presets). */
export function rangeQuery(r: ReportRange): string {
  const qs = new URLSearchParams({ range: r.preset });
  if (r.preset === "custom") {
    qs.set("from", r.from);
    qs.set("to", r.to);
  }
  return qs.toString();
}

/** IANA zone of the server process (what TZ sets), for bucketing by local day in SQL. */
export function serverTimeZone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return tz && /^[A-Za-z0-9_+\-/]+$/.test(tz) ? tz : "UTC";
}
