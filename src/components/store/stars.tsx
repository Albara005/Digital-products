"use client";

import { useT } from "@/i18n/client";
import { IconStar } from "./icons";
import { formatRating } from "./site";

const STARS = [1, 2, 3, 4, 5];

/**
 * Read-only star rating (supports fractions). Stars fill from the inline start, so
 * they follow the reading direction (right-to-left in Arabic, left-to-right in English).
 */
export function Stars({
  value,
  className = "size-4",
  label,
}: {
  value: number;
  className?: string;
  /** Accessible text; defaults to "Rated X out of 5" in the current language. */
  label?: string;
}) {
  const t = useT();
  const clamped = Math.min(Math.max(value, 0), 5);
  return (
    <span
      role="img"
      aria-label={label ?? t.stars.label(formatRating(clamped))}
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
