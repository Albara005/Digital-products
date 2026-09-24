import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { Pagination, firstParam, pageParam } from "@/components/admin/Pagination";
import { ReviewCard } from "@/components/admin/reviews/ReviewCard";
import { EmptyState, PageHeader } from "@/components/admin/ui";
import { requireAdminAccess } from "../../_lib/guard";
import { approveReview, deleteReview, rejectReview } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "التقييمات" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const PAGE_SIZE = 20;
const TABS: { status: ReviewStatus; label: string; empty: string }[] = [
  { status: "PENDING", label: "بانتظار المراجعة", empty: "لا توجد تقييمات بانتظار المراجعة" },
  { status: "APPROVED", label: "منشورة", empty: "لا توجد تقييمات منشورة بعد" },
  { status: "REJECTED", label: "مرفوضة", empty: "لا توجد تقييمات مرفوضة" },
];
const statusParam = z.enum(ReviewStatus).catch("PENDING");

export default async function ReviewsPage({ searchParams }: Props) {
  await requireAdminAccess();
  const sp = await searchParams;
  const status = statusParam.parse(firstParam(sp.status) || "PENDING");
  const page = pageParam(sp.page);

  const [counts, reviews] = await Promise.all([
    prisma.review.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.review.findMany({
      where: { status },
      // The moderation queue is worked oldest first; published/rejected lists show the latest first.
      orderBy: [{ createdAt: status === "PENDING" ? "asc" : "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        rating: true,
        comment: true,
        authorName: true,
        status: true,
        createdAt: true,
        product: { select: { name: true, slug: true, active: true } },
        orderItem: {
          select: { variantLabel: true, order: { select: { id: true, customer: { select: { email: true } } } } },
        },
      },
    }),
  ]);

  const countBy = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<ReviewStatus, number>>;
  const total = countBy[status] ?? 0;
  const tab = TABS.find((t) => t.status === status) ?? TABS[0];
  const actions = { approve: approveReview, reject: rejectReview, remove: deleteReview };

  return (
    <>
      <PageHeader
        title="التقييمات"
        description="تقييمات المشترين الموثّقين لا تظهر في المتجر قبل نشرها من هنا."
      />

      <nav aria-label="تصفية حسب الحالة" className="card mb-4 flex w-fit max-w-full gap-1 overflow-x-auto p-1">
        {TABS.map((t) => {
          const active = t.status === status;
          return (
            <Link
              key={t.status}
              href={t.status === "PENDING" ? "/admin/reviews" : `/admin/reviews?status=${t.status}`}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-volt text-bg" : "text-muted hover:bg-surface-2 hover:text-text"
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 font-display text-[11px] ${active ? "bg-bg/15" : "bg-surface-2 text-muted"}`}>
                {countBy[t.status] ?? 0}
              </span>
            </Link>
          );
        })}
      </nav>

      {reviews.length === 0 ? (
        <section className="card" aria-label="قائمة التقييمات">
          <EmptyState
            title={total > 0 ? "لا توجد تقييمات في هذه الصفحة" : tab.empty}
            body={status === "PENDING" && total === 0 ? "ستظهر هنا التقييمات الجديدة فور إرسالها من صفحات الطلبات." : undefined}
          />
        </section>
      ) : (
        <section aria-label="قائمة التقييمات" className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} actions={actions} />
          ))}
          <div className="card overflow-hidden">
            <Pagination
              pathname="/admin/reviews"
              params={{ status: status === "PENDING" ? undefined : status }}
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
            />
          </div>
        </section>
      )}
    </>
  );
}
