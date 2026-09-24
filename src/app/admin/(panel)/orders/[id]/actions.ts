"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { formatPrice } from "@/lib/format";
import { fulfillOrder, refreshOrderStatus } from "@/lib/fulfillment";
import { refundOrderPayment } from "@/lib/payments";
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
  const session = await requireAdminAccess();
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
  // The delivered text is customer content (often credentials): never in the audit log
  await audit({ adminId: session.adminId, email: session.email }, "order.deliver_manual", { type: "order", id: orderId }, { itemId });

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
  const session = await requireAdminAccess();
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
  await audit({ adminId: session.adminId, email: session.email }, "order.retry_delivery", { type: "order", id: orderId }, {
    undeliveredAfter: pending,
  });
  revalidatePath("/admin", "layout");
  return ok(
    pending === 0
      ? "تم تسليم كل العناصر."
      : `تمت المحاولة. ما زال ${pending} عنصر بدون تسليم (مخزون غير كافٍ أو خدمة يدوية).`,
  );
}

const refundSchema = z.object({
  orderId: idSchema,
  method: z.enum(["ORIGINAL", "WALLET"], "اختر طريقة الاسترجاع"),
});

/**
 * Refunds the money (gateway refund or wallet credit), marks the order REFUNDED and releases reserved
 * stock, all inside refundOrderPayment, which also writes the "order.refund" audit row.
 */
export async function refundOrder(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess();
  const parsed = refundSchema.safeParse({ orderId: str(formData, "orderId"), method: str(formData, "method") });
  if (!parsed.success) return fromZod(parsed.error);
  const { orderId, method } = parsed.data;

  const result = await refundOrderPayment(orderId, { method, actor: { adminId: session.adminId, email: session.email } });
  revalidatePath("/", "layout");
  if (!result.ok) return fail(result.error);

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { currency: true, walletAppliedCents: true } });
  const amount = formatPrice(result.refundedCents, order?.currency);
  if (method === "WALLET") return ok(`تم الاسترجاع: أُضيف ${amount} إلى رصيد محفظة العميل.`);
  return ok(
    `تم استرجاع ${amount}${order?.walletAppliedCents ? "؛ الجزء المدفوع من المحفظة عاد إلى رصيد العميل والباقي إلى وسيلة الدفع الأصلية." : " إلى وسيلة الدفع الأصلية."}`,
  );
}

/** Decrypts a manual-delivery note for display. Sensitive: audited (ids only, never the text). */
export async function revealDeliveryNote(
  itemId: string,
): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
  const session = await requireAdminAccess();
  const parsed = idSchema.safeParse(itemId);
  if (!parsed.success) return { ok: false, message: "معرّف غير صالح" };

  const item = await prisma.orderItem.findUnique({ where: { id: parsed.data }, select: { orderId: true, deliveryNote: true } });
  if (!item?.deliveryNote) return { ok: false, message: "لا يوجد نص تسليم" };
  let value: string;
  try {
    value = decrypt(item.deliveryNote);
  } catch {
    return { ok: false, message: "تعذّر فك التشفير — تحقق من مفتاح التشفير" };
  }
  await audit({ adminId: session.adminId, email: session.email }, "order.reveal_note", { type: "order", id: item.orderId }, {
    itemId: parsed.data,
  });
  return { ok: true, value };
}
