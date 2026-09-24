"use server";

import { revalidatePath } from "next/cache";
import type { ReviewStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { productHref } from "@/components/store/site";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess } from "../../_lib/guard";
import { fail, fromZod, idSchema, isNotFound, ok, str } from "../../_lib/validation";

function revalidate(productSlug: string) {
  revalidatePath(productHref(productSlug));
  revalidatePath("/admin/reviews");
}

async function setStatus(formData: FormData, status: Exclude<ReviewStatus, "PENDING">): Promise<FormState> {
  const admin = await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "id"));
  if (!parsed.success) return fromZod(parsed.error);
  const id = parsed.data;

  const review = await prisma.review.findUnique({
    where: { id },
    select: { status: true, rating: true, productId: true, product: { select: { slug: true } } },
  });
  if (!review) return fail("التقييم غير موجود (ربما حُذف).");
  if (review.status === status) return ok(status === "APPROVED" ? "التقييم منشور بالفعل." : "التقييم مرفوض بالفعل.");

  try {
    await prisma.review.update({ where: { id }, data: { status } });
  } catch (e) {
    if (isNotFound(e)) return fail("التقييم غير موجود (ربما حُذف).");
    throw e;
  }
  await audit(
    { adminId: admin.adminId, email: admin.email },
    status === "APPROVED" ? "review.approve" : "review.reject",
    { type: "review", id },
    { productId: review.productId, rating: review.rating, from: review.status },
  );
  revalidate(review.product.slug);
  return ok(status === "APPROVED" ? "تم نشر التقييم." : "تم رفض التقييم.");
}

export async function approveReview(_prev: FormState, formData: FormData): Promise<FormState> {
  return setStatus(formData, "APPROVED");
}

export async function rejectReview(_prev: FormState, formData: FormData): Promise<FormState> {
  return setStatus(formData, "REJECTED");
}

export async function deleteReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "id"));
  if (!parsed.success) return fromZod(parsed.error);
  const id = parsed.data;

  const review = await prisma.review.findUnique({
    where: { id },
    select: { status: true, rating: true, productId: true, orderItemId: true, product: { select: { slug: true } } },
  });
  if (!review) return fail("التقييم غير موجود (ربما حُذف).");

  try {
    await prisma.review.delete({ where: { id } });
  } catch (e) {
    if (isNotFound(e)) return fail("التقييم غير موجود (ربما حُذف).");
    throw e;
  }
  // Deleting frees the order line: the customer may review it again from their order page.
  await audit(
    { adminId: admin.adminId, email: admin.email },
    "review.delete",
    { type: "review", id },
    { productId: review.productId, orderItemId: review.orderItemId, rating: review.rating, status: review.status },
  );
  revalidate(review.product.slug);
  return ok("تم حذف التقييم.");
}
