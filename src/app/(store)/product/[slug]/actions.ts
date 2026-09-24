"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { type PublicReview, REVIEWS_PAGE_SIZE, getApprovedReviews } from "../../_lib/reviews";

const inputSchema = z.object({
  productId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  offset: z.number().int().min(0).max(5_000),
});

/** Next page of APPROVED reviews for an active product ("show more" on the product page). */
export async function loadMoreReviews(
  productId: unknown,
  offset: unknown,
): Promise<{ reviews: PublicReview[]; hasMore: boolean }> {
  const parsed = inputSchema.safeParse({ productId, offset });
  if (!parsed.success) return { reviews: [], hasMore: false };
  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { active: true },
  });
  if (!product?.active) return { reviews: [], hasMore: false };
  return getApprovedReviews(parsed.data.productId, parsed.data.offset, REVIEWS_PAGE_SIZE);
}
