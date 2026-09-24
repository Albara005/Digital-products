import { IconStar } from "./icons";

const STARS = [1, 2, 3, 4, 5];

/** "4.6" style average: one decimal, Latin digits. */
export function formatRating(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** "12 تقييماً" with Arabic plural forms. */
export function reviewCountLabel(n: number) {
  if (n === 1) return "تقييم واحد";
  if (n === 2) return "تقييمان";
  if (n >= 3 && n <= 10) return `${n} تقييمات`;
  return `${n} تقييماً`;
}

/**
 * Read-only star rating (supports fractions). Stars fill from the inline start, so
 * they read right-to-left in the Arabic UI like everything else.
 */
export function Stars({
  value,
  className = "size-4",
  label,
}: {
  value: number;
  className?: string;
  /** Accessible text; defaults to "التقييم X من 5". */
  label?: string;
}) {
  const clamped = Math.min(Math.max(value, 0), 5);
  return (
    <span
      role="img"
      aria-label={label ?? `التقييم ${formatRating(clamped)} من 5`}
      className="relative inline-flex shrink-0 align-middle"
    >
      <span className="flex text-border" aria-hidden="true">
        {STARS.map((s) => (
          <IconStar key={s} filled className={className} />
        ))}
      </span>
      <span
        className="absolute inset-y-0 start-0 flex overflow-hidden text-volt"
        style={{ width: `${(clamped / 5) * 100}%` }}
        aria-hidden="true"
      >
        {STARS.map((s) => (
          <IconStar key={s} filled className={`${className} shrink-0`} />
        ))}
      </span>
    </span>
  );
}
