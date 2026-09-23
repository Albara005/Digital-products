import "server-only";
import { cache } from "react";
import type { Prisma, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Storefront reads. Every query uses an explicit `select`: inventory payloads are
// never loaded here (only the verified order page touches them).

const availableCount = {
  _count: { select: { inventoryItems: { where: { status: "AVAILABLE" } } } },
} satisfies Prisma.ProductVariantSelect;

const variantOrder: Prisma.ProductVariantOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { priceCents: "asc" },
];

const cardSelect = {
  id: true,
  name: true,
  slug: true,
  imageUrl: true,
  type: true,
  createdAt: true,
  category: { select: { name: true, slug: true } },
  variants: {
    orderBy: variantOrder,
    select: { priceCents: true, currency: true, ...availableCount },
  },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

export type ProductCardData = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  type: ProductType;
  createdAt: Date;
  categoryName: string;
  fromPrice: { cents: number; currency: string };
  hasPriceRange: boolean;
  /** Units available across variants; services report Infinity. */
  available: number;
};

function toCard(row: CardRow): ProductCardData | null {
  if (row.variants.length === 0) return null;
  const cheapest = row.variants.reduce((min, v) => (v.priceCents < min.priceCents ? v : min));
  const available =
    row.type === "SERVICE"
      ? Number.POSITIVE_INFINITY
      : row.variants.reduce((sum, v) => sum + v._count.inventoryItems, 0);
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageUrl,
    type: row.type,
    createdAt: row.createdAt,
    categoryName: row.category.name,
    fromPrice: { cents: cheapest.priceCents, currency: cheapest.currency },
    hasPriceRange: row.variants.some((v) => v.priceCents !== cheapest.priceCents),
    available,
  };
}

function toCards(rows: CardRow[]) {
  return rows.map(toCard).filter((c): c is ProductCardData => c !== null);
}

/** Only products that can actually be bought are listed. */
const listable = { active: true, variants: { some: {} } } satisfies Prisma.ProductWhereInput;

// --- Categories -------------------------------------------------------------

export const getNavCategories = cache(() =>
  prisma.category.findMany({
    where: { products: { some: listable } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true },
  }),
);

export async function getHomeCategories() {
  const rows = await prisma.category.findMany({
    where: { products: { some: listable } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      _count: { select: { products: { where: listable } } },
    },
  });
  return rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }));
}

export const getCategoryBySlug = cache((slug: string) =>
  prisma.category.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, description: true },
  }),
);

export type CategorySort = "newest" | "price-asc" | "price-desc";

export async function getCategoryProducts(categoryId: string, sort: CategorySort) {
  const rows = await prisma.product.findMany({
    where: { ...listable, categoryId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: cardSelect,
    take: 200,
  });
  const cards = toCards(rows);
  // "From" price is derived from variants, so price sorting happens here.
  if (sort === "price-asc") cards.sort((a, b) => a.fromPrice.cents - b.fromPrice.cents);
  if (sort === "price-desc") cards.sort((a, b) => b.fromPrice.cents - a.fromPrice.cents);
  return cards;
}

// --- Products ---------------------------------------------------------------

export async function getFeaturedProducts(limit = 8) {
  const rows = await prisma.product.findMany({
    where: { ...listable, featured: true },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: cardSelect,
    take: limit,
  });
  return toCards(rows);
}

export const getProductBySlug = cache(async (slug: string) => {
  const product = await prisma.product.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      type: true,
      active: true,
      warrantyHours: true,
      categoryId: true,
      category: { select: { name: true, slug: true } },
      variants: {
        orderBy: variantOrder,
        select: { id: true, label: true, priceCents: true, currency: true, ...availableCount },
      },
    },
  });
  if (!product || !product.active) return null;
  const { variants, ...rest } = product;
  return {
    ...rest,
    variants: variants.map(({ _count, ...v }) => ({ ...v, available: _count.inventoryItems })),
  };
});

export async function getRelatedProducts(categoryId: string, excludeId: string, limit = 4) {
  const rows = await prisma.product.findMany({
    where: { ...listable, categoryId, id: { not: excludeId } },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    select: cardSelect,
    take: limit,
  });
  return toCards(rows);
}

export const SEARCH_MAX_LENGTH = 80;

export async function searchProducts(query: string) {
  const q = query.trim().slice(0, SEARCH_MAX_LENGTH);
  if (!q) return [];
  // Prisma passes `contains` straight into ILIKE, so LIKE wildcards must be escaped to match literally.
  const contains = { contains: q.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } as const;
  const rows = await prisma.product.findMany({
    where: {
      ...listable,
      OR: [{ name: contains }, { description: contains }, { category: { name: contains } }],
    },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    select: cardSelect,
    take: 60,
  });
  return toCards(rows);
}
