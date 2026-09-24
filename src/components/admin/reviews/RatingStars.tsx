import { StarIcon } from "../icons";

/** Read-only 1–5 star rating for admin lists. */
export function RatingStars({ rating, className = "size-4" }: { rating: number; className?: string }) {
  return (
    <span role="img" aria-label={`${rating} من 5`} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon
          key={n}
          className={`${className} ${n <= rating ? "fill-volt text-volt" : "text-border"}`}
        />
      ))}
    </span>
  );
}
