"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/email";
import { notifyAdmin } from "@/lib/notify";
import { MAX_REVIEW_COMMENT, MAX_REVIEW_NAME } from "@/components/store/site";
import { type Dictionary, getDictionary } from "@/i18n/server";
import { MAX_TOKEN_LENGTH, ORDER_ID, tokenMatches } from "../../_lib/order-access";

export type ReviewFormState = { ok: boolean; message: string; field?: "rating" | "comment" | "authorName" } | null;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Drops control characters (keeping line breaks) and squeezes runs of blank lines. */
function cleanComment(value: string) {
  return Array.from(value.replace(/\r\n?/g, "\n"))
    .filter((ch) => ch === "\n" || (ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f))
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanName(value: string) {
  return Array.from(value)
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

const reviewSchema = (t: Dictionary) =>
  z.object({
    orderId: z.string().regex(ORDER_ID),
    token: z.string().min(1).max(MAX_TOKEN_LENGTH),
    orderItemId: z.string().regex(ID),
    rating: z.coerce.number().int().min(1, t.review.chooseStars).max(5, t.review.chooseStars),
    comment: z
      .string()
      .max(MAX_REVIEW_COMMENT * 2)
      .transform(cleanComment)
      .pipe(z.string().max(MAX_REVIEW_COMMENT, t.review.commentTooLong(MAX_REVIEW_COMMENT))),
    authorName: z
      .string()
      .max(200)
      .transform(cleanName)
      .pipe(z.string().min(2, t.review.nameTooShort).max(MAX_REVIEW_NAME, t.review.nameTooLong(MAX_REVIEW_NAME))),
  });

function field(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

const fail = (message: string, f?: NonNullable<ReviewFormState>["field"]): ReviewFormState => ({
  ok: false,
  message,
  field: f,
});

/**
 * Verified-purchase review for one delivered order line. Re-checks everything the page
 * checked: order id + access token (constant time), order state, that the line belongs to
 * this order and was delivered, and that it has no review yet.
 */
export async function submitReview(_prev: ReviewFormState, formData: FormData): Promise<ReviewFormState> {
  const t = await getDictionary();
  const parsed = reviewSchema(t).safeParse({
    orderId: field(formData, "orderId"),
    token: field(formData, "token"),
    orderItemId: field(formData, "orderItemId"),
    rating: field(formData, "rating"),
    comment: field(formData, "comment"),
    authorName: field(formData, "authorName"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const key = issue?.path[0];
    if (key === "rating" || key === "comment" || key === "authorName") return fail(issue.message, key);
    return fail(t.review.verifyFailed);
  }
  const { orderId, token, orderItemId, rating, comment, authorName } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      accessToken: true,
      status: true,
      items: {
        where: { id: orderItemId },
        select: {
          id: true,
          deliveredAt: true,
          productName: true,
          variant: { select: { productId: true } },
          review: { select: { id: true } },
        },
      },
    },
  });
  if (!order || !tokenMatches(token, order.accessToken)) {
    return fail(t.review.verifyFailed);
  }
  if (order.status !== "PAID" && order.status !== "FULFILLED") {
    return fail(t.review.notReviewable);
  }
  const item = order.items[0];
  if (!item) return fail(t.review.notInOrder);
  if (!item.deliveredAt) return fail(t.review.notDelivered);
  if (item.review) return fail(t.review.already);

  try {
    await prisma.review.create({
      data: {
        productId: item.variant.productId,
        orderItemId: item.id,
        authorName,
        rating,
        comment: comment || null,
        status: "PENDING",
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail(t.review.already);
    }
    throw e;
  }

  void notifyAdmin(
    "review.new",
    `⭐ تقييم جديد ${rating}/5 على «${item.productName}» بانتظار المراجعة\n${siteUrl()}/admin/reviews`,
  );
  return { ok: true, message: t.review.thanks };
}
