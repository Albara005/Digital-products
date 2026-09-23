"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/format";
import type { FormState } from "../../_lib/form-state";
import { requireAdminAccess } from "../../_lib/guard";
import { fail, fromZod, idSchema, isForeignKeyViolation, isNotFound, isUniqueViolation, ok, str } from "../../_lib/validation";

const categorySchema = z.object({
  id: idSchema.optional(),
  name: z.string().trim().min(1, "اسم الفئة مطلوب").max(80, "الاسم طويل جداً"),
  slug: z.string().trim().max(80, "الرابط طويل جداً"),
  description: z.string().trim().max(1000, "الوصف طويل جداً"),
  sortOrder: z.coerce.number("أدخل رقماً").int("أدخل رقماً صحيحاً").min(-100000).max(100000),
});

export async function saveCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAccess();
  const parsed = categorySchema.safeParse({
    id: str(formData, "id") || undefined,
    name: str(formData, "name"),
    slug: str(formData, "slug"),
    description: str(formData, "description"),
    sortOrder: str(formData, "sortOrder") || "0",
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { id, name, description, sortOrder } = parsed.data;
  const slug = slugify(parsed.data.slug || name);
  if (!slug) return fail("تعذّر توليد رابط صالح، اكتب الرابط يدوياً.", { slug: "رابط غير صالح" });

  const data = { name, slug, description: description || null, sortOrder };
  try {
    if (id) await prisma.category.update({ where: { id }, data });
    else await prisma.category.create({ data });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا الرابط مستخدم لفئة أخرى.", { slug: "الرابط مستخدم مسبقاً" });
    if (isNotFound(e)) return fail("الفئة غير موجودة (ربما حُذفت).");
    throw e;
  }

  revalidatePath("/", "layout");
  if (id) redirect("/admin/categories");
  return ok(`تمت إضافة الفئة «${name}».`);
}

export async function deleteCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAccess();
  const parsed = idSchema.safeParse(str(formData, "id"));
  if (!parsed.success) return fromZod(parsed.error);

  const category = await prisma.category.findUnique({
    where: { id: parsed.data },
    select: { name: true, _count: { select: { products: true } } },
  });
  if (!category) return fail("الفئة غير موجودة.");
  if (category._count.products > 0) {
    return fail(
      `لا يمكن حذف «${category.name}» لأنها تحتوي على ${category._count.products} منتج. انقل المنتجات إلى فئة أخرى أولاً.`,
    );
  }

  try {
    await prisma.category.delete({ where: { id: parsed.data } });
  } catch (e) {
    if (isForeignKeyViolation(e)) return fail("أُضيفت منتجات إلى هذه الفئة للتو، لا يمكن حذفها.");
    if (isNotFound(e)) return fail("الفئة غير موجودة.");
    throw e;
  }
  revalidatePath("/", "layout");
  return ok("تم حذف الفئة.");
}
