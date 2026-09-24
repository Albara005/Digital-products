"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { type ReviewFormState, submitReview } from "@/app/(store)/order/[id]/actions";
import { IconAlert, IconCheck, IconSpinner, IconStar } from "./icons";
import { MAX_REVIEW_COMMENT, MAX_REVIEW_NAME } from "./site";

const RATING_WORDS = ["سيئ", "مقبول", "جيد", "جيد جداً", "ممتاز"];
const STAR_LABELS = ["نجمة واحدة", "نجمتان", "3 نجوم", "4 نجوم", "5 نجوم"];

/** Compact verified-purchase review form for one delivered order line. */
export function ReviewForm({
  orderId,
  token,
  orderItemId,
  productName,
  defaultName,
}: {
  orderId: string;
  token: string;
  orderItemId: string;
  productName: string;
  defaultName: string;
}) {
  const id = useId();
  const [state, dispatch, pending] = useActionState<ReviewFormState, FormData>(submitReview, null);
  // Controlled fields keep their values if the server rejects the submission. Once hydrated the
  // form dispatches from onSubmit, so React's automatic post-action form reset (which would
  // uncheck the star radios in the DOM) never runs; `action` still covers pre-hydration submits.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState(defaultName);

  if (state?.ok) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm font-semibold text-success">
        <IconCheck className="size-4 shrink-0" />
        {state.message}
      </p>
    );
  }

  const shown = hover || rating;
  const error = state && !state.ok ? state : null;

  return (
    <form action={dispatch} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="orderItemId" value={orderItemId} />

      <fieldset>
        <legend className="text-sm font-bold">
          قيّم تجربتك مع <bdi>{productName}</bdi>
        </legend>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="flex" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((value) => (
              <label
                key={value}
                onMouseEnter={() => setHover(value)}
                className="cursor-pointer rounded-md p-0.5 text-border transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt/60"
              >
                <input
                  type="radio"
                  name="rating"
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                  required
                  className="sr-only"
                  aria-describedby={error?.field === "rating" ? `${id}-error` : undefined}
                />
                <span className="sr-only">{STAR_LABELS[value - 1]}</span>
                <IconStar
                  filled={value <= shown}
                  className={`size-7 transition ${value <= shown ? "text-volt" : "text-muted/50 hover:text-muted"}`}
                />
              </label>
            ))}
          </div>
          <span className="text-xs font-semibold text-muted" aria-live="polite">
            {shown ? RATING_WORDS[shown - 1] : "اختر عدد النجوم"}
          </span>
        </div>
      </fieldset>

      {rating > 0 ? (
        <>
          <div>
            <label htmlFor={`${id}-comment`} className="label">
              تعليقك <span className="font-normal">(اختياري)</span>
            </label>
            <textarea
              id={`${id}-comment`}
              name="comment"
              rows={3}
              maxLength={MAX_REVIEW_COMMENT}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              aria-invalid={error?.field === "comment" ? true : undefined}
              placeholder="ما الذي أعجبك؟ هل وصل المنتج كما هو موصوف؟"
              className="input resize-y leading-7"
            />
            <p className="mt-1 text-end text-[11px] text-muted" aria-live="off">
              <span dir="ltr" className="font-display tabular-nums">
                {comment.length}/{MAX_REVIEW_COMMENT}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-48">
              <label htmlFor={`${id}-name`} className="label">
                الاسم الظاهر
              </label>
              <input
                id={`${id}-name`}
                name="authorName"
                type="text"
                autoComplete="nickname"
                required
                minLength={2}
                maxLength={MAX_REVIEW_NAME}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error?.field === "authorName" ? true : undefined}
                className="input h-11"
              />
            </div>
            <button type="submit" disabled={pending} className="btn-primary h-11">
              {pending ? (
                <>
                  <IconSpinner className="size-4" />
                  جارٍ الإرسال…
                </>
              ) : (
                "إرسال التقييم"
              )}
            </button>
          </div>
          <p className="text-[11px] leading-5 text-muted">
            يظهر تقييمك باسمك الظاهر مع شارة «مشتري موثّق» بعد مراجعته. لا ننشر بريدك الإلكتروني.
          </p>
        </>
      ) : null}

      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-2 text-sm text-danger">
          <IconAlert className="mt-0.5 size-4 shrink-0" />
          {error.message}
        </p>
      ) : null}
    </form>
  );
}
