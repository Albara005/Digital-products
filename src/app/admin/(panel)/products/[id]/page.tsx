import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ActionButton } from "@/components/admin/ActionButton";
import { ProductForm } from "@/components/admin/ProductForm";
import { ExternalIcon, LayersIcon, TrashIcon } from "@/components/admin/icons";
import { Callout, PageHeader, ProductTypeBadge, btnSm } from "@/components/admin/ui";
import { requireAdminAccess } from "../../../_lib/guard";
import { deleteProduct, saveProduct } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "تعديل منتج" };

function centsToDollars(cents: number) {
  return (cents / 100).toFixed(2);
}

export default async function EditProductPage({ params, searchParams }: PageProps<"/admin/products/[id]">) {
  await requireAdminAccess();
  const { id } = await params;
  const { created } = await searchParams;

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        categoryId: true,
        type: true,
        description: true,
        imageUrl: true,
        active: true,
        featured: true,
        warrantyHours: true,
        updatedAt: true,
        variants: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            label: true,
            priceCents: true,
            costCents: true,
            sortOrder: true,
            _count: { select: { orderItems: true, inventoryItems: true } },
          },
        },
      },
    }),
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
  ]);
  if (!product) notFound();

  const orders = product.variants.reduce((s, v) => s + v._count.orderItems, 0);
  const stock = product.variants.reduce((s, v) => s + v._count.inventoryItems, 0);
  const deletable = orders === 0 && stock === 0;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {product.name}
            <ProductTypeBadge type={product.type} />
            {!product.active && <span className="badge bg-surface-2 text-muted ring-1 ring-border">معطّل</span>}
          </span>
        }
        back={{ href: "/admin/products", label: "المنتجات" }}
        actions={
          <>
            {product.type !== "SERVICE" && (
              <Link href={`/admin/products/${product.id}/inventory`} className={btnSm.ghost}>
                <LayersIcon className="size-3.5" />
                إدارة المخزون
              </Link>
            )}
            {product.active && (
              <a href={`${siteUrl}/product/${product.slug}`} target="_blank" rel="noreferrer" className={btnSm.ghost}>
                <ExternalIcon className="size-3.5" />
                عرض في المتجر
              </a>
            )}
            <ActionButton
              action={deleteProduct}
              fields={{ id: product.id }}
              variant="danger"
              confirm={
                deletable
                  ? {
                      title: "حذف المنتج نهائياً؟",
                      body: `سيتم حذف «${product.name}» وكل خياراته. لا يمكن التراجع.`,
                      confirmLabel: "حذف المنتج",
                    }
                  : undefined
              }
              title={deletable ? undefined : "لهذا المنتج طلبات أو مخزون — عطّله بدلاً من حذفه"}
            >
              <TrashIcon className="size-3.5" />
              حذف
            </ActionButton>
          </>
        }
      />

      {created && (
        <div className="mb-6">
          <Callout tone="success">
            تم إنشاء المنتج.{" "}
            {product.type !== "SERVICE" ? (
              <>
                الخطوة التالية:{" "}
                <Link href={`/admin/products/${product.id}/inventory`} className="font-semibold text-volt underline-offset-4 hover:underline">
                  أضف المخزون
                </Link>{" "}
                ليصبح قابلاً للتسليم التلقائي.
              </>
            ) : (
              "منتجات الخدمة تُسلَّم يدوياً من صفحة الطلب."
            )}
          </Callout>
        </div>
      )}

      <ProductForm
        action={saveProduct}
        categories={categories}
        product={{
          id: product.id,
          version: product.updatedAt.toISOString(),
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          type: product.type,
          description: product.description ?? "",
          imageUrl: product.imageUrl ?? "",
          active: product.active,
          featured: product.featured,
          warrantyHours: product.warrantyHours,
          variants: product.variants.map((v) => ({
            id: v.id,
            label: v.label,
            price: centsToDollars(v.priceCents),
            cost: v.costCents === null ? "" : centsToDollars(v.costCents),
            sortOrder: v.sortOrder,
            orders: v._count.orderItems,
            stock: v._count.inventoryItems,
          })),
        }}
      />
    </>
  );
}
