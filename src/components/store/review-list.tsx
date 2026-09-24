"use client";

import { useState, useTransition } from "react";
import { loadMoreReviews } from "@/app/(store)/product/[slug]/actions";
import type { PublicReview } from "@/app/(store)/_lib/reviews";
import { IconAlert, IconChevronDown, IconShieldCheck, IconSpinner } from "./icons";
import { LocalTime } from "./local-time";
import { Stars } from "./stars";

export function ReviewList({
  productId,
  initial,
  initialHasMore,
}: {
  productId: string;
  initial: PublicReview[];
  initialHasMore: boolean;
}) {
  const [reviews, setReviews] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function more() {
    setFailed(false);
    startTransition(async () => {
      try {
        const page = await loadMoreReviews(productId, reviews.length);
        setReviews((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...page.reviews.filter((r) => !seen.has(r.id))];
        });
        setHasMore(page.hasMore);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div>
      <ul className="space-y-3">
        {reviews.map((review) => (
          <li key={review.id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-bold text-volt ring-1 ring-border"
                >
                  {Array.from(review.authorName.trim())[0]?.toUpperCase() ?? "؟"}
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <bdi className="truncate">{review.authorName}</bdi>
                    <span className="badge gap-1 bg-success/10 px-2 text-[11px] text-success ring-1 ring-success/25 ring-inset">
                      <IconShieldCheck className="size-3" />
                      مشتري موثّق
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    <LocalTime iso={review.createdAt} dateOnly />
                  </p>
                </div>
              </div>
              <Stars value={review.rating} className="size-4" />
            </div>
            {review.comment ? (
              <p dir="auto" className="mt-3 text-sm leading-7 break-words whitespace-pre-line text-text/90">
                {review.comment}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {failed ? (
        <p role="alert" className="mt-3 flex items-center gap-2 text-sm text-danger">
          <IconAlert className="size-4" />
          تعذّر تحميل المزيد من التقييمات. حاول مرة أخرى.
        </p>
      ) : null}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button type="button" onClick={more} disabled={pending} className="btn-ghost">
            {pending ? <IconSpinner className="size-4" /> : <IconChevronDown className="size-4" />}
            عرض المزيد من التقييمات
          </button>
        </div>
      ) : null}
    </div>
  );
}
