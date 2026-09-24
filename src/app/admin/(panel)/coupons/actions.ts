"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CouponType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess } from "../../_lib/guard";
import { ActionError, fail, fromActionError, fromZod, idSchema, isNotFound, isUniqueViolation, ok, str } from "../../_lib/validation";

const DOLLARS = /^\d{1,6}(\.\d{1,2})?$/;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function dollarsToCents(v: string): number {
  const [whole, frac = ""] = v.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** "" -> null, "12.5" -> 1250 */
const optionalMoney = z
  .string()
  .trim()
  .refine((v) => v === "" || DOLLARS.test(v), "مبلغ غير صالح (مثال: 5 أو 4.99)")
  .transform((v) => (v === "" ? null : dollarsToCents(v)));

function optionalCount(max: number) {
  return z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{1,7}$/.test(v), "أدخل رقماً صحيحاً")
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((n) => n === null || (n >= 1 && n <= max), `أدخل رقماً من 1 إلى ${max}`);
}

/** datetime-local value, read in the server's time zone (TZ, the shop's zone) */
const optionalDate = z
  .string()
  .trim()
  .refine((v) => v === "" || (LOCAL_DATETIME.test(v) && !Number.isNaN(new Date(v).getTime())), "تاريخ غير صالح")
  .transform((v) => (v === "" ? null : new Date(v)));

const couponSchema = z
  .object({
    id: idSchema.optional(),
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,32}$/, "الكود من 3 إلى 32 خانة: حروف إنجليزية أو أرقام أو - أو _"),
    type: z.enum(CouponType, "اختر نوع الخصم"),
    value: z.string().trim(),
    maxDiscount: optionalMoney,
    minSubtotal: optionalMoney,
    maxUses: optionalCount(1_000_000),
    perCustomerLimit: optionalCount(1_000),
    startsAt: optionalDate,
    endsAt: optionalDate,
    scope: z.enum(["all", "category", "product"], "اختر نطاق الكوبون"),
    categoryId: z.string().trim(),
    productId: z.string().trim(),
    active: z.boolean(),
  })
  .transform((c, ctx) => {
    let value = 0;
    if (c.type === "PERCENT") {
      value = /^\d{1,3}$/.test(c.value) ? Number(c.value) : NaN;
      if (!(value >= 1 && value <= 100)) {
        ctx.addIssue({ code: "custom", path: ["value"], message: "النسبة رقم صحيح من 1 إلى 100" });
      }
    } else {
      value = DOLLARS.test(c.value) ? dollarsToCents(c.value) : NaN;
      if (!(value > 0)) ctx.addIssue({ code: "custom", path: ["value"], message: "أدخل مبلغ خصم أكبر من صفر (مثال: 5 أو 4.99)" });
    }

    let categoryId: string | null = null;
    let productId: string | null = null;
    if (c.scope === "category") {
      if (!idSchema.safeParse(c.categoryId).success) ctx.addIssue({ code: "custom", path: ["categoryId"], message: "اختر الفئة" });
      categoryId = c.categoryId;
    } else if (c.scope === "product") {
      if (!idSchema.safeParse(c.productId).success) ctx.addIssue({ code: "custom", path: ["productId"], message: "اختر المنتج" });
      productId = c.productId;
    }

    if (c.startsAt && c.endsAt && c.endsAt <= c.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية" });
    }
    if (c.type === "PERCENT" && c.maxDiscount === 0) {
      ctx.addIssue({ code: "custom", path: ["maxDiscount"], message: "الحد الأقصى يجب أن يكون أكبر من صفر أو فارغاً" });
    }

    return {
      id: c.id,
      data: {
        code: c.code,
        type: c.type,
        value,
        maxDiscountCents: c.type === "PERCENT" ? c.maxDiscount : null,
        minSubtotalCents: c.minSubtotal,
        maxUses: c.maxUses,
        perCustomerLimit: c.perCustomerLimit,
        startsAt: c.startsAt,
        endsAt: c.endsAt,
        categoryId,
        productId,
        active: c.active,
      } satisfies Prisma.CouponUncheckedCreateInput,
    };
  });

function auditDetails(data: z.infer<typeof couponSchema>["data"]): Prisma.InputJsonValue {
  return {
    code: data.code,
    type: data.type,
    value: data.value,
    maxDiscountCents: data.maxDiscountCents,
    minSubtotalCents: data.minSubtotalCents,
    maxUses: data.maxUses,
    perCustomerLimit: data.perCustomerLimit,
    startsAt: data.startsAt?.toISOString() ?? null,
    endsAt: data.endsAt?.toISOString() ?? null,
    categoryId: data.categoryId,
    productId: data.productId,
    active: data.active,
  };
}

export async function saveCoupon(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminAccess();
  const parsed = couponSchema.safeParse({
    id: str(formData, "id") || undefined,
    code: str(formData, "code"),
    type: str(formData, "type"),
    value: str(formData, "value"),
    maxDiscount: str(formData, "maxDiscount"),
    minSubtotal: str(formData, "minSubtotal"),
    maxUses: str(formData, "maxUses"),
    perCustomerLimit: str(formData, "perCustomerLimit"),
    startsAt: str(formData, "startsAt"),
    endsAt: str(formData, "endsAt"),
    scope: str(formData, "scope") || "all",
    categoryId: str(formData, "categoryId"),
    productId: str(formData, "productId"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { id, data } = parsed.data;

  let savedId: string;
  try {
    if (data.categoryId && !(await prisma.category.findUnique({ where: { id: data.categoryId }, select: { id: true } }))) {
      throw new ActionError("الفئة المختارة غير موجودة.", "categoryId");
    }
    if (data.productId && !(await prisma.product.findUnique({ where: { id: data.productId }, select: { id: true } }))) {
      throw new ActionError("المنتج المختار غير موجود.", "productId");
    }
    const saved = id
      ? await prisma.coupon.update({ where: { id }, data, select: { id: true } })
      : await prisma.coupon.create({ data, select: { id: true } });
    savedId = saved.id;
  } catch (e) {
    const known = fromActionError(e);
    if (known) return known;
    if (isUniqueViolation(e)) return fail("هذا الكود مستخدم لكوبون آخر.", { code: "الكود مستخدم مسبقاً" });
    if (isNotFound(e)) return fail("الكوبون غير موجود (ربما حُذف).");
    throw e;
  }

  await audit({ adminId: admin.adminId, email: admin.email }, id ? "coupon.update" : "coupon.create", { type: "coupon", id: savedId }, auditDetails(data));
  revalidatePath("/admin/coupons");
  redirect("/admin/coupons");
}

const toggleSchema = z.object({ id: idSchema, active: z.enum(["true", "false"]) });

export async function setCouponActive(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminAccess();
  const parsed = toggleSchema.safeParse({ id: str(formData, "id"), active: str(formData, "active") });
  if (!parsed.success) return fromZod(parsed.error);
  const active = parsed.data.active === "true";

  let code: string;
  try {
    ({ code } = await prisma.coupon.update({ where: { id: parsed.data.id }, data: { active }, select: { code: true } }));
  } catch (e) {
    if (isNotFound(e)) return fail("الكوبون غير موجود.");
    throw e;
  }

  await audit({ adminId: admin.adminId, email: admin.email }, active ? "coupon.activate" : "coupon.deactivate", { type: "coupon", id: parsed.data.id }, { code });
  revalidatePath("/admin/coupons");
  return ok(active ? "تم تفعيل الكوبون." : "تم إيقاف الكوبون.");
}

export async function deleteCoupon(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "id"));
  if (!parsed.success) return fromZod(parsed.error);
  const id = parsed.data;

  let code: string;
  try {
    code = await prisma.$transaction(async (tx) => {
      // Same row lock checkout takes to redeem: no redemption can slip in between the check and the delete
      const locked = await tx.$queryRaw<{ code: string }[]>`SELECT code FROM "Coupon" WHERE id = ${id} FOR UPDATE`;
      if (!locked[0]) throw new ActionError("الكوبون غير موجود.");
      const [redemptions, orders] = await Promise.all([
        tx.couponRedemption.count({ where: { couponId: id } }),
        tx.order.count({ where: { couponId: id } }),
      ]);
      if (redemptions > 0 || orders > 0) {
        throw new ActionError("لا يمكن حذف كوبون استُخدم في طلبات. أوقفه بدلاً من ذلك ليبقى سجل الاستخدام.");
      }
      await tx.coupon.delete({ where: { id } });
      return locked[0].code;
    });
  } catch (e) {
    const known = fromActionError(e);
    if (known) return known;
    if (isNotFound(e)) return fail("الكوبون غير موجود.");
    throw e;
  }

  await audit({ adminId: admin.adminId, email: admin.email }, "coupon.delete", { type: "coupon", id }, { code });
  revalidatePath("/admin/coupons");
  return ok(`تم حذف الكوبون ${code}.`);
}
