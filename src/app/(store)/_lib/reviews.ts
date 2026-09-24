import "server-only";
import { prisma } from "@/lib/prisma";

// Public review reads. Only APPROVED reviews ever leave this module, and only the fields
// shown on the storefront (never the order, order item or customer behind a review).

export type RatingSummary = { average: number; count: number };

export type RatingBreakdown = RatingSummary & {
  /** Number of reviews per star, index 0 = 1 star … index 4 = 5 stars. */
  distribution: [number, number, number, number, number];
};

export type PublicReview = {
  id: string;
  authorName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export const REVIEWS_PAGE_SIZE = 5;

const approved = { status: "APPROVED" } as const;

/** One grouped query for any number of products (used by product grids, no N+1). */
export async function getRatingSummaries(productIds: string[]): Promise<Map<string, RatingSummary>> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.review.groupBy({
    by: ["productId"],
    where: { ...approved, productId: { in: ids } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(
    rows
      .filter((r) => r._count._all > 0)
      .map((r) => [r.productId, { average: r._avg.rating ?? 0, count: r._count._all }]),
  );
}

export async function getRatingBreakdown(productId: string): Promise<RatingBreakdown> {
  const rows = await prisma.review.groupBy({
    by: ["rating"],
    where: { ...approved, productId },
    _count: { _all: true },
  });
  const distribution: RatingBreakdown["distribution"] = [0, 0, 0, 0, 0];
  let count = 0;
  let sum = 0;
  for (const row of rows) {
    if (row.rating < 1 || row.rating > 5) continue;
    distribution[row.rating - 1] += row._count._all;
    count += row._count._all;
    sum += row.rating * row._count._all;
  }
  return { average: count ? sum / count : 0, count, distribution };
}

export async function getApprovedReviews(productId: string, skip: number, take = REVIEWS_PAGE_SIZE) {
  // One extra row tells whether a "show more" button is needed.
  const rows = await prisma.review.findMany({
    where: { ...approved, productId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take: take + 1,
    select: { id: true, authorName: true, rating: true, comment: true, createdAt: true },
  });
  const reviews: PublicReview[] = rows.slice(0, take).map((r) => ({
    id: r.id,
    authorName: r.authorName,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
  }));
  return { reviews, hasMore: rows.length > take };
}
