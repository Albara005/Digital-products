"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { slugify } from "@/lib/format";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess } from "../../_lib/guard";
import { resolveImageField } from "../../_lib/images";
import { formMoneyFx, parseMoneyInput } from "../../_lib/money";
import type { Fx } from "@/lib/fx";
import {
  ActionError,
  fail,
  fromActionError,
  fromZod,
  idSchema,
  isNotFound,
  isUniqueViolation,
  ok,
  str,
} from "../../_lib/validation";

/*
 * Prices and costs are typed in the admin currency (the form's `moneyCurrency`) and stored as USD
 * cents, round(value / rate x 100), with the server's current rate. Catalog prices stay in USD so
 * the storefront converts them for every shopper with the same helper checkout charges with.
 */
const MAX_PRICE_CENTS = 100_000_000; // $1,000,000

const priceSchema = (fx: Fx) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const cents = parseMoneyInput(v, fx);
      if (cents === null || cents > MAX_PRICE_CENTS) {
        ctx.addIssue({ code: "custom", message: "سعر غير صالح (مثال: 9.99)" });
        return z.NEVER;
      }
      return cents;
    })
    .refine((cents) => cents > 0, "السعر يجب أن يكون أكبر من صفر");

/** Optional supplier cost: "" / missing -> null (unknown), "0" is a valid zero cost. */
const costSchema = (fx: Fx) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) return null;
      const cents = parseMoneyInput(v, fx);
      if (cents === null || cents > MAX_PRICE_CENTS) {
        ctx.addIssue({ code: "custom", message: "تكلفة غير صالحة (مثال: 7.50)" });
        return z.NEVER;
      }
      return cents;
    });

const variantSchema = (fx: Fx) =>
  z.object({
    id: idSchema.optional(),
    label: z.string().trim().min(1, "اسم الخيار مطلوب").max(80, "الاسم طويل جداً"),
    labelEn: z.string().trim().max(80, "الاسم الإنجليزي طويل جداً").optional().default(""),
    price: priceSchema(fx),
    cost: costSchema(fx),
    sortOrder: z.coerce.number("أدخل رقماً").int("رقم صحيح").min(-10000).max(10000),
  });

const imageUrlSchema = z
  .string()
  .trim()
  .max(2000, "الرابط طويل جداً")
  .refine((v) => {
    if (v === "" || /^\/(?!\/)/.test(v)) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "أدخل رابط صورة يبدأ بـ https:// أو مساراً يبدأ بـ /");

const productSchema = (fx: Fx) =>
  z
    .object({
      id: idSchema.optional(),
      name: z.string().trim().min(1, "اسم المنتج مطلوب").max(120, "الاسم طويل جداً"),
      nameEn: z.string().trim().max(120, "الاسم الإنجليزي طويل جداً"),
      slug: z.string().trim().max(120, "الرابط طويل جداً"),
      categoryId: z.string().trim().min(1, "اختر فئة").pipe(idSchema),
      type: z.enum(ProductType, "اختر نوع المنتج"),
      description: z.string().trim().max(5000, "الوصف طويل جداً"),
      descriptionEn: z.string().trim().max(5000, "الوصف الإنجليزي طويل جداً"),
      imageUrl: imageUrlSchema,
      active: z.boolean(),
      featured: z.boolean(),
      warrantyHours: z.string().trim(),
      variants: z.array(variantSchema(fx)).min(1, "أضف خياراً واحداً على الأقل").max(50, "عدد الخيارات كبير جداً"),
    })
    .transform((p, ctx) => {
      let warrantyHours: number | null = null;
      if (p.type === "ACCOUNT" && p.warrantyHours !== "") {
        const n = Number(p.warrantyHours);
        if (!Number.isInteger(n) || n < 0 || n > 8760) {
          ctx.addIssue({ code: "custom", path: ["warrantyHours"], message: "أدخل عدد ساعات بين 0 و 8760" });
          return z.NEVER;
        }
        warrantyHours = n;
      }
      return { ...p, warrantyHours };
    });

function parseVariants(raw: string): unknown {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

type VariantChanges = {
  added: { label: string; priceCents: number }[];
  removed: { id: string; label: string }[];
  updated: {
    id: string;
    label: string;
    from: { label: string; priceCents: number; costCents: number | null };
    to: { label: string; priceCents: number; costCents: number | null };
  }[];
};

export async function saveProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess();

  const fx = await formMoneyFx(formData);
  if (!fx) return fail("عملة الأسعار غير متاحة. حدّث الصفحة وحاول مجدداً.");
  const parsed = productSchema(fx).safeParse({
    id: str(formData, "id") || undefined,
    name: str(formData, "name"),
    nameEn: str(formData, "nameEn"),
    slug: str(formData, "slug"),
    categoryId: str(formData, "categoryId"),
    type: str(formData, "type"),
    description: str(formData, "description"),
    descriptionEn: str(formData, "descriptionEn"),
    imageUrl: str(formData, "imageUrl"),
    active: formData.get("active") === "on",
    featured: formData.get("featured") === "on",
    warrantyHours: str(formData, "warrantyHours"),
    variants: parseVariants(str(formData, "variants")),
  });
  if (!parsed.success) return fromZod(parsed.error);
  const input = parsed.data;

  const slug = slugify(input.slug || input.name);
  if (!slug) return fail("تعذّر توليد رابط صالح، اكتب الرابط يدوياً.", { slug: "رابط غير صالح" });

  const category = await prisma.category.findUnique({ where: { id: input.categoryId }, select: { id: true } });
  if (!category) return fail("الفئة المختارة غير موجودة.", { categoryId: "اختر فئة" });

  const image = await resolveImageField(formData, "imageUrl", input.imageUrl);
  if (!image.ok) return fail(image.error, { imageUrl: image.error });

  const productData = {
    name: input.name,
    nameEn: input.nameEn || null,
    slug,
    categoryId: input.categoryId,
    type: input.type,
    description: input.description || null,
    descriptionEn: input.descriptionEn || null,
    imageUrl: image.url,
    active: input.active,
    featured: input.featured,
    warrantyHours: input.warrantyHours,
  };

  let productId: string;
  const variantChanges: VariantChanges = { added: [], removed: [], updated: [] };
  try {
    productId = await prisma.$transaction(async (tx) => {
      if (!input.id) {
        const created = await tx.product.create({
          data: {
            ...productData,
            variants: {
              create: input.variants.map((v) => ({ label: v.label, labelEn: v.labelEn || null, priceCents: v.price, costCents: v.cost, sortOrder: v.sortOrder })),
            },
          },
          select: { id: true },
        });
        return created.id;
      }

      const existing = await tx.productVariant.findMany({
        where: { productId: input.id },
        select: {
          id: true,
          label: true,
          priceCents: true,
          costCents: true,
          _count: {
            select: {
              orderItems: true,
              inventoryItems: true,
            },
          },
        },
      });
      const existingIds = new Set(existing.map((v) => v.id));
      for (const v of input.variants) {
        // IDOR guard: a submitted variant id must belong to this product
        if (v.id && !existingIds.has(v.id)) throw new ActionError("أحد الخيارات لا ينتمي لهذا المنتج. أعد تحميل الصفحة.");
      }
      const kept = new Set(input.variants.flatMap((v) => (v.id ? [v.id] : [])));
      const removed = existing.filter((v) => !kept.has(v.id));
      const withOrders = removed.find((v) => v._count.orderItems > 0);
      if (withOrders) {
        throw new ActionError(
          `لا يمكن حذف الخيار «${withOrders.label}» لأن له طلبات سابقة. أبقِه كما هو، أو عطّل المنتج بدلاً من ذلك.`,
        );
      }
      const withStock = removed.find((v) => v._count.inventoryItems > 0);
      if (withStock) {
        throw new ActionError(
          `الخيار «${withStock.label}» يحتوي على ${withStock._count.inventoryItems} عنصر مخزون. احذف المخزون من صفحة المخزون قبل حذف الخيار.`,
        );
      }
      if (input.type === "SERVICE") {
        const stock = await tx.inventoryItem.count({ where: { variant: { productId: input.id }, status: "AVAILABLE" } });
        if (stock > 0) {
          throw new ActionError(`لا يمكن تحويل المنتج إلى «خدمة» وهو يحتوي على ${stock} عنصر مخزون متاح.`, "type");
        }
      }

      await tx.product.update({ where: { id: input.id }, data: productData });
      if (removed.length) await tx.productVariant.deleteMany({ where: { id: { in: removed.map((v) => v.id) } } });
      const before = new Map(existing.map((v) => [v.id, v]));
      for (const v of input.variants) {
        const data = { label: v.label, labelEn: v.labelEn || null, priceCents: v.price, costCents: v.cost, sortOrder: v.sortOrder };
        if (v.id) await tx.productVariant.update({ where: { id: v.id }, data });
        else await tx.productVariant.create({ data: { ...data, productId: input.id } });
        const old = v.id ? before.get(v.id) : undefined;
        if (!old) variantChanges.added.push({ label: v.label, priceCents: v.price });
        else if (old.label !== v.label || old.priceCents !== v.price || old.costCents !== v.cost) {
          variantChanges.updated.push({
            id: old.id,
            label: v.label,
            from: { label: old.label, priceCents: old.priceCents, costCents: old.costCents },
            to: { label: v.label, priceCents: v.price, costCents: v.cost },
          });
        }
      }
      variantChanges.removed = removed.map((v) => ({ id: v.id, label: v.label }));
      return input.id;
    });
  } catch (e) {
    const handled = fromActionError(e);
    if (handled) return handled;
    if (isUniqueViolation(e)) return fail("هذا الرابط مستخدم لمنتج آخر.", { slug: "الرابط مستخدم مسبقاً" });
    if (isNotFound(e)) return fail("المنتج غير موجود (ربما حُذف).");
    throw e;
  }

  const who = { adminId: session.adminId, email: session.email };
  const target = { type: "product", id: productId };
  if (!input.id) {
    await audit(who, "product.create", target, {
      name: input.name,
      slug,
      type: input.type,
      variants: input.variants.map((v) => ({ label: v.label, priceCents: v.price, costCents: v.cost })),
    });
  } else {
    await audit(who, "product.update", target, { name: input.name, slug, active: input.active, featured: input.featured });
    const { added, removed, updated } = variantChanges;
    if (added.length || removed.length || updated.length) {
      await audit(who, "product.variants_update", target, { added, removed, updated });
    }
  }

  revalidatePath("/", "layout");
  if (!input.id) redirect(`/admin/products/${productId}?created=1`);
  return ok("تم حفظ التغييرات.");
}

export async function deleteProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "id"));
  if (!parsed.success) return fromZod(parsed.error);

  const product = await prisma.product.findUnique({
    where: { id: parsed.data },
    select: {
      id: true,
      name: true,
      slug: true,
      variants: { select: { _count: { select: { orderItems: true, inventoryItems: true } } } },
    },
  });
  if (!product) return fail("المنتج غير موجود.");
  const orders = product.variants.reduce((s, v) => s + v._count.orderItems, 0);
  if (orders > 0) return fail("لهذا المنتج طلبات سابقة ولا يمكن حذفه. عطّله بدلاً من ذلك ليختفي من المتجر.");
  const stock = product.variants.reduce((s, v) => s + v._count.inventoryItems, 0);
  if (stock > 0) return fail(`يحتوي المنتج على ${stock} عنصر مخزون. احذف المخزون أولاً أو عطّل المنتج.`);

  await prisma.product.delete({ where: { id: product.id } });
  await audit({ adminId: session.adminId, email: session.email }, "product.delete", { type: "product", id: product.id }, {
    name: product.name,
    slug: product.slug,
  });
  revalidatePath("/", "layout");
  redirect("/admin/products");
}
