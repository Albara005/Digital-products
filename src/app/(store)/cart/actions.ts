"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { type CartLineInfo, MAX_CART_LINES, MAX_LINE_QUANTITY } from "@/lib/cart";

const variantIdsSchema = z
  .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
  .max(MAX_CART_LINES);

/**
 * Prices the cart from the database. The browser only stores variant ids and quantities;
 * names, prices and stock always come from here. Unknown or inactive variants are omitted,
 * which the cart treats as "no longer available". Never returns inventory payloads.
 */
export async function getCartLines(variantIds: unknown): Promise<CartLineInfo[]> {
  const parsed = variantIdsSchema.safeParse(variantIds);
  if (!parsed.success) return [];
  const ids = [...new Set(parsed.data)];
  if (ids.length === 0) return [];

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids }, product: { active: true } },
    select: {
      id: true,
      label: true,
      priceCents: true,
      currency: true,
      product: { select: { name: true, slug: true, type: true, imageUrl: true } },
      _count: { select: { inventoryItems: { where: { status: "AVAILABLE" } } } },
    },
  });

  return variants.map((v) => {
    const manualDelivery = v.product.type === "SERVICE";
    return {
      variantId: v.id,
      variantLabel: v.label,
      unitPriceCents: v.priceCents,
      currency: v.currency,
      productName: v.product.name,
      productSlug: v.product.slug,
      productType: v.product.type,
      imageUrl: v.product.imageUrl,
      maxQuantity: manualDelivery ? MAX_LINE_QUANTITY : Math.min(v._count.inventoryItems, MAX_LINE_QUANTITY),
      manualDelivery,
    };
  });
}
