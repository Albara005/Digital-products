"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { fulfillOrder, refreshOrderStatus } from "@/lib/fulfillment";
import type { FormState } from "../../../_lib/form-state";
import { requireAdminAccess } from "../../../_lib/guard";
import { fail, fromZod, idSchema, ok, str } from "../../../_lib/validation";

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

const deliverSchema = z.object({
  orderId: idSchema,
  itemId: idSchema,
  note: z.string().trim().min(1, "اكتب محتوى التسليم").max(20000, "النص طويل جداً"),
});

/** Manual delivery for SERVICE items or stock shortfalls: stores an encrypted note and marks the item delivered. */
export async function deliverItemManually(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAccess();
  const parsed = deliverSchema.safeParse({
    orderId: str(formData, "orderId"),
    itemId: str(formData, "itemId"),
    note: str(formData, "note"),
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { orderId, itemId, note } = parsed.data;

  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId },
    select: { deliveredAt: true, order: { select: { status: true } } },
  });
  if (!item) return fail("العنصر غير موجود في هذا الطلب.");
  if (item.order.status !== "PAID") return fail("التسليم اليدوي متاح للطلبات المدفوعة بانتظار التسليم فقط.");
  if (item.deliveredAt) return fail("تم تسليم هذا العنصر مسبقاً.");

  // Conditional update so two staff members can't deliver the same item twice
  const res = await prisma.orderItem.updateMany({
    where: { id: itemId, orderId, deliveredAt: null },
    data: { deliveryNote: encrypt(note), deliveredAt: new Date() },
  });
  if (res.count === 0) return fail("تم تسليم هذا العنصر للتو من مستخدم آخر.");

  try {
    await refreshOrderStatus(orderId);
  } catch (e) {
    console.error("refreshOrderStatus failed", orderId, e);
    revalidatePath("/admin", "layout");
    return fail(`حُفظ التسليم، لكن تعذّر تحديث حالة الطلب: ${errorMessage(e)}`);
  }
  revalidatePath("/admin", "layout");
  return ok("تم التسليم وحُفظ النص مشفّراً.");
}

export async function retryAutoDelivery(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "orderId"));
  if (!parsed.success) return fromZod(parsed.error);
  const orderId = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!order) return fail("الطلب غير موجود.");
  if (order.status !== "PAID") return fail("إعادة التسليم التلقائي متاحة للطلبات المدفوعة بانتظار التسليم فقط.");

  try {
    await fulfillOrder(orderId);
  } catch (e) {
    console.error("fulfillOrder failed", orderId, e);
    revalidatePath("/admin", "layout");
    return fail(`تعذّر التسليم التلقائي: ${errorMessage(e)}`);
  }

  const pending = await prisma.orderItem.count({ where: { orderId, deliveredAt: null } });
  revalidatePath("/admin", "layout");
  return ok(
    pending === 0
      ? "تم تسليم كل العناصر."
      : `تمت المحاولة. ما زال ${pending} عنصر بدون تسليم (مخزون غير كافٍ أو خدمة يدوية).`,
  );
}

export async function markOrderRefunded(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "orderId"));
  if (!parsed.success) return fromZod(parsed.error);
  const orderId = parsed.data;

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PAID", "FULFILLED"] } },
      data: { status: "REFUNDED" },
    });
    if (res.count === 0) return false;
    // Units held for this order but never delivered go back on sale; SOLD units stay with the order.
    await tx.inventoryItem.updateMany({
      where: { status: "RESERVED", orderItem: { orderId } },
      data: { status: "AVAILABLE", orderItemId: null },
    });
    return true;
  });
  if (!updated) return fail("يمكن تسجيل الاسترجاع للطلبات المدفوعة أو المسلّمة فقط.");

  revalidatePath("/", "layout");
  return ok("تم تسجيل الطلب كمسترجع.");
}
