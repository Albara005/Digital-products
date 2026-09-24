"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import type { FormState } from "../../../../_lib/form-state";
import { requireAdminAccess } from "../../../../_lib/guard";
import { parseStockInput } from "../../../../_lib/parse-stock";
import { fail, fromZod, idSchema, ok, str } from "../../../../_lib/validation";

const MAX_ITEMS_PER_BATCH = 5000;

const addSchema = z.object({
  productId: idSchema,
  variantId: z.string().trim().min(1, "اختر الخيار").pipe(idSchema),
  text: z.string().max(2_000_000, "النص كبير جداً، قسّمه على عدة دفعات"),
});

function preview(value: string) {
  const oneLine = value.replace(/\s+/g, " ");
  return oneLine.length > 32 ? `${oneLine.slice(0, 32)}…` : oneLine;
}

export async function addInventory(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess();
  const parsed = addSchema.safeParse({
    productId: str(formData, "productId"),
    variantId: str(formData, "variantId"),
    text: str(formData, "text"),
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { productId, variantId, text } = parsed.data;

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { id: true, label: true, productId: true, product: { select: { type: true } } },
  });
  if (!variant || variant.productId !== productId) return fail("الخيار غير موجود في هذا المنتج.", { variantId: "اختر الخيار" });
  const kind = variant.product.type;
  if (kind === "SERVICE") return fail("منتجات الخدمة تُسلَّم يدوياً ولا تحتاج مخزوناً.");

  const { items, duplicates } = parseStockInput(text, kind);
  if (items.length === 0) return fail("لم يتم العثور على أي عنصر. الصق الأكواد أو الحسابات أولاً.", { text: "النص فارغ" });
  if (items.length > MAX_ITEMS_PER_BATCH) {
    return fail(`الحد الأقصى ${MAX_ITEMS_PER_BATCH} عنصر في الدفعة الواحدة (لديك ${items.length}).`, { text: "دفعة كبيرة" });
  }
  if (duplicates.length) {
    return fail(
      `الدفعة تحتوي على ${duplicates.length} عنصر مكرر، أزل التكرار ثم أعد المحاولة: ${duplicates.slice(0, 3).map(preview).join("، ")}`,
      { text: "عناصر مكررة" },
    );
  }

  // Guard against uploading the same batch twice: compare with every stored unit of this product
  // (any status — re-adding a sold code would sell it twice). Payloads use random IVs, so decrypt to compare.
  const stored = await prisma.inventoryItem.findMany({
    where: { variant: { productId } },
    select: { payload: true },
  });
  const existing = new Set<string>();
  for (const row of stored) {
    try {
      existing.add(decrypt(row.payload).trim());
    } catch {
      // unreadable legacy row; ignore for duplicate detection
    }
  }
  const clashes = items.filter((item) => existing.has(item));
  if (clashes.length) {
    return fail(
      `${clashes.length} عنصر موجود مسبقاً في مخزون هذا المنتج (لم يُضَف شيء): ${clashes.slice(0, 3).map(preview).join("، ")}`,
      { text: "عناصر موجودة مسبقاً" },
    );
  }

  const result = await prisma.inventoryItem.createMany({
    data: items.map((payload) => ({ variantId: variant.id, payload: encrypt(payload) })),
  });
  // Count only: the codes themselves never go into the audit log
  await audit({ adminId: session.adminId, email: session.email }, "inventory.add", { type: "product", id: productId }, {
    variantId: variant.id,
    variantLabel: variant.label,
    count: result.count,
  });

  revalidatePath("/", "layout");
  return ok(`تمت إضافة ${result.count} عنصر إلى «${variant.label}».`);
}

export async function deleteInventoryItem(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "id"));
  if (!parsed.success) return fromZod(parsed.error);

  const item = await prisma.inventoryItem.findUnique({
    where: { id: parsed.data },
    select: { variantId: true, variant: { select: { productId: true, label: true } } },
  });
  // Only unsold stock can be removed; sold/reserved units are order history.
  const res = await prisma.inventoryItem.deleteMany({ where: { id: parsed.data, status: "AVAILABLE" } });
  if (res.count === 0) return fail("لا يمكن حذف هذا العنصر (ربما تم حجزه أو بيعه للتو).");
  await audit({ adminId: session.adminId, email: session.email }, "inventory.delete", { type: "inventory", id: parsed.data }, {
    productId: item?.variant.productId ?? null,
    variantId: item?.variantId ?? null,
    variantLabel: item?.variant.label ?? null,
  });

  revalidatePath("/", "layout");
  return ok("تم الحذف.");
}

/** Decrypts one stock unit for display. Sensitive: every successful reveal is audited (id only, never the value). */
export async function revealInventoryItem(
  id: string,
): Promise<{ ok: true; value: string } | { ok: false; message: string }> {
  const session = await requireAdminAccess();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: "معرّف غير صالح" };

  const item = await prisma.inventoryItem.findUnique({
    where: { id: parsed.data },
    select: {
      payload: true,
      status: true,
      variantId: true,
      variant: { select: { productId: true, label: true } },
      orderItem: { select: { orderId: true } },
    },
  });
  if (!item) return { ok: false, message: "العنصر غير موجود" };
  let value: string;
  try {
    value = decrypt(item.payload);
  } catch {
    return { ok: false, message: "تعذّر فك التشفير — تحقق من مفتاح التشفير" };
  }
  await audit({ adminId: session.adminId, email: session.email }, "inventory.reveal", { type: "inventory", id: parsed.data }, {
    productId: item.variant.productId,
    variantId: item.variantId,
    variantLabel: item.variant.label,
    status: item.status,
    orderId: item.orderItem?.orderId ?? null,
  });
  return { ok: true, value };
}
