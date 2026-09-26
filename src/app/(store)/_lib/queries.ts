import "server-only";
import { cache } from "react";
import type { Prisma, ProductType } from "@prisma/client";
import { type Locale, localized } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { prisma } from "@/lib/prisma";
import { type RatingSummary, getRatingSummaries } from "./reviews";

// Storefront reads. Every query uses an explicit `select`: inventory payloads are
// never loaded here (only the verified order page touches them).
// Names and descriptions come back in the request's language: the English column when the
// storefront is in English and it is filled in, the Arabic one otherwise.

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
  nameEn: true,
  slug: true,
  imageUrl: true,
  type: true,
  createdAt: true,
  category: { select: { name: true, nameEn: true, slug: true } },
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
  /** Approved reviews only; null when the product has none. */
  rating: RatingSummary | null;
};

function toCard(row: CardRow, locale: Locale): Omit<ProductCardData, "rating"> | null {
  if (row.variants.length === 0) return null;
  const cheapest = row.variants.reduce((min, v) => (v.priceCents < min.priceCents ? v : min));
  const available =
    row.type === "SERVICE"
      ? Number.POSITIVE_INFINITY
      : row.variants.reduce((sum, v) => sum + v._count.inventoryItems, 0);
  return {
    id: row.id,
    name: localized(locale, row.name, row.nameEn),
    slug: row.slug,
    imageUrl: row.imageUrl,
    type: row.type,
    createdAt: row.createdAt,
    categoryName: localized(locale, row.category.name, row.category.nameEn),
    fromPrice: { cents: cheapest.priceCents, currency: cheapest.currency },
    hasPriceRange: row.variants.some((v) => v.priceCents !== cheapest.priceCents),
    available,
  };
}

/** Builds the cards and attaches their ratings with one grouped query for the whole grid. */
async function toCards(rows: CardRow[]): Promise<ProductCardData[]> {
  const locale = await getLocale();
  const cards = rows.map((row) => toCard(row, locale)).filter((c): c is Omit<ProductCardData, "rating"> => c !== null);
  if (cards.length === 0) return [];
  const ratings = await getRatingSummaries(cards.map((c) => c.id)).catch((err: unknown) => {
    // Ratings are decoration: a failure here must not hide the catalogue.
    console.error("[store] Failed to load product ratings", err);
    return new Map<string, RatingSummary>();
  });
  return cards.map((c) => ({ ...c, rating: ratings.get(c.id) ?? null }));
}

/** Only products that can actually be bought are listed. */
const listable = { active: true, variants: { some: {} } } satisfies Prisma.ProductWhereInput;

// --- Categories -------------------------------------------------------------

export const getNavCategories = cache(async () => {
  const [locale, rows] = await Promise.all([
    getLocale(),
    prisma.category.findMany({
      where: { products: { some: listable } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, nameEn: true, slug: true, imageUrl: true, imageUrlEn: true },
    }),
  ]);
  return rows.map(({ nameEn, imageUrlEn, ...c }) => ({
    ...c,
    name: localized(locale, c.name, nameEn),
    imageUrl: localized(locale, c.imageUrl, imageUrlEn),
  }));
});

export async function getHomeCategories() {
  const locale = await getLocale();
  const rows = await prisma.category.findMany({
    where: { products: { some: listable } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      description: true,
      descriptionEn: true,
      imageUrl: true,
      imageUrlEn: true,
      _count: { select: { products: { where: listable } } },
    },
  });
  return rows.map(({ _count, nameEn, descriptionEn, imageUrlEn, ...c }) => ({
    ...c,
    name: localized(locale, c.name, nameEn),
    description: localized(locale, c.description, descriptionEn),
    imageUrl: localized(locale, c.imageUrl, imageUrlEn),
    productCount: _count.products,
  }));
}

export const getCategoryBySlug = cache(async (slug: string) => {
  const [locale, row] = await Promise.all([
    getLocale(),
    prisma.category.findUnique({
      where: { slug },
      select: { id: true, name: true, nameEn: true, slug: true, description: true, descriptionEn: true },
    }),
  ]);
  if (!row) return null;
  const { nameEn, descriptionEn, ...c } = row;
  return { ...c, name: localized(locale, c.name, nameEn), description: localized(locale, c.description, descriptionEn) };
});

export type CategorySort = "newest" | "price-asc" | "price-desc";

export async function getCategoryProducts(categoryId: string, sort: CategorySort) {
  const rows = await prisma.product.findMany({
    where: { ...listable, categoryId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: cardSelect,
    take: 200,
  });
  const cards = await toCards(rows);
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
  const locale = await getLocale();
  const product = await prisma.product.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      nameEn: true,
      slug: true,
      description: true,
      descriptionEn: true,
      imageUrl: true,
      type: true,
      active: true,
      warrantyHours: true,
      categoryId: true,
      category: { select: { name: true, nameEn: true, slug: true } },
      variants: {
        orderBy: variantOrder,
        select: { id: true, label: true, labelEn: true, priceCents: true, currency: true, ...availableCount },
      },
    },
  });
  if (!product || !product.active) return null;
  const { variants, nameEn, descriptionEn, category, ...rest } = product;
  return {
    ...rest,
    name: localized(locale, rest.name, nameEn),
    description: localized(locale, rest.description, descriptionEn),
    category: { slug: category.slug, name: localized(locale, category.name, category.nameEn) },
    variants: variants.map(({ _count, labelEn, ...v }) => ({
      ...v,
      label: localized(locale, v.label, labelEn),
      available: _count.inventoryItems,
    })),
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
      // Both languages match, whichever storefront the search comes from
      OR: [
        { name: contains },
        { nameEn: contains },
        { description: contains },
        { descriptionEn: contains },
        { category: { name: contains } },
        { category: { nameEn: contains } },
      ],
    },
    orderBy: [{ featured: "desc" }, { createdAt: "desc" }],
    select: cardSelect,
    take: 60,
  });
  return toCards(rows);
}
