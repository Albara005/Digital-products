import Link from "next/link";
import type { ReviewStatus } from "@prisma/client";
import { formatDate } from "@/lib/format";
import { productHref } from "@/components/store/site";
import { ActionButton } from "../ActionButton";
import { CheckIcon, CloseIcon, ExternalIcon, TrashIcon } from "../icons";
import { shortId } from "../ui";
import type { FormAction } from "@/app/admin/_lib/form-state";
import { RatingStars } from "./RatingStars";

export type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  authorName: string;
  status: ReviewStatus;
  createdAt: Date;
  product: { name: string; slug: string; active: boolean };
  orderItem: { variantLabel: string; order: { id: string; customer: { email: string } } };
};

const statusStyle: Record<ReviewStatus, { label: string; className: string }> = {
  PENDING: { label: "بانتظار المراجعة", className: "bg-surface-2 text-muted ring-1 ring-border" },
  APPROVED: { label: "منشور", className: "bg-success/15 text-success ring-1 ring-success/30" },
  REJECTED: { label: "مرفوض", className: "bg-danger/15 text-danger ring-1 ring-danger/30" },
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const s = statusStyle[status];
  return <span className={`badge whitespace-nowrap ${s.className}`}>{s.label}</span>;
}

export function ReviewCard({
  review,
  actions,
}: {
  review: AdminReview;
  actions: { approve: FormAction; reject: FormAction; remove: FormAction };
}) {
  const order = review.orderItem.order;
  return (
    <article className="card p-4 sm:p-5" aria-label={`تقييم ${review.product.name}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={productHref(review.product.slug)}
              target="_blank"
              className="inline-flex items-center gap-1.5 font-semibold hover:text-volt"
            >
              <bdi>{review.product.name}</bdi>
              <ExternalIcon className="size-3.5 text-muted" />
            </Link>
            {!review.product.active && (
              <span className="badge bg-surface-2 text-muted ring-1 ring-border">المنتج غير نشط</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            <bdi>{review.orderItem.variantLabel}</bdi>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RatingStars rating={review.rating} />
          <ReviewStatusBadge status={review.status} />
        </div>
      </div>

      {review.comment ? (
        <p dir="auto" className="mt-3 text-sm leading-7 break-words whitespace-pre-line">
          {review.comment}
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted">بدون تعليق — تقييم بالنجوم فقط.</p>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 lg:flex-row lg:items-center lg:justify-between">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
          <div className="flex gap-1">
            <dt>الاسم الظاهر:</dt>
            <dd className="font-medium text-text">
              <bdi>{review.authorName}</bdi>
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>الطلب:</dt>
            <dd>
              <Link href={`/admin/orders/${order.id}`} className="font-display font-semibold text-text hover:text-volt" dir="ltr">
                #{shortId(order.id)}
              </Link>
            </dd>
          </div>
          <div className="flex min-w-0 gap-1">
            <dt>العميل:</dt>
            <dd className="truncate" dir="ltr">
              {order.customer.email}
            </dd>
          </div>
          <div>
            <dt className="sr-only">التاريخ</dt>
            <dd>{formatDate(review.createdAt)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          {review.status !== "APPROVED" && (
            <ActionButton action={actions.approve} fields={{ id: review.id }} variant="primary" pendingLabel="جارٍ النشر…">
              <CheckIcon className="size-3.5" />
              نشر
            </ActionButton>
          )}
          {review.status !== "REJECTED" && (
            <ActionButton action={actions.reject} fields={{ id: review.id }} variant="ghost" pendingLabel="جارٍ الرفض…">
              <CloseIcon className="size-3.5" />
              {review.status === "APPROVED" ? "إخفاء" : "رفض"}
            </ActionButton>
          )}
          <ActionButton
            action={actions.remove}
            fields={{ id: review.id }}
            variant="danger"
            pendingLabel="جارٍ الحذف…"
            confirm={{
              title: "حذف التقييم؟",
              body: "سيُحذف التقييم نهائياً، ويتمكّن العميل من تقييم هذا المنتج مجدداً من صفحة طلبه.",
              confirmLabel: "حذف",
            }}
          >
            <TrashIcon className="size-3.5" />
            حذف
          </ActionButton>
        </div>
      </div>
    </article>
  );
}
