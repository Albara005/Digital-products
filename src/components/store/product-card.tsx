import type { ProductCardData } from "@/app/(store)/_lib/queries";
import { type Dictionary, getDictionary } from "@/i18n/server";
import { IconArrow, IconStar } from "./icons";
import Link from "./link";
import { ProductMedia } from "./product-media";
import { formatRating, productHref } from "./site";
import { Price, StockIndicator, TypeBadge, stockState } from "./ui";

function ProductCard({ product, priority = false, t }: { product: ProductCardData; priority?: boolean; t: Dictionary }) {
  const state = stockState(product.type, product.available);
  const soldOut = state === "out";

  return (
    <Link
      href={productHref(product.slug)}
      className="group card relative flex w-full flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-volt/50 hover:shadow-[0_18px_50px_-24px_rgba(212,255,61,0.45)] focus-visible:border-volt focus-visible:outline-none"
    >
      <div className={`aspect-[4/3] border-b border-border ${soldOut ? "opacity-50 grayscale" : ""}`}>
        <ProductMedia
          name={product.name}
          type={product.type}
          imageUrl={product.imageUrl}
          priority={priority}
          sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
        />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TypeBadge type={product.type} />
          <StockIndicator state={state} />
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold leading-6 sm:text-base">{product.name}</h3>

        {product.rating ? (
          <p className="-mt-1 flex items-center gap-1 text-xs text-muted">
            <span className="sr-only">
              {t.productCard.rating(formatRating(product.rating.average), t.common.reviewCount(product.rating.count))}
            </span>
            <IconStar filled className="size-3.5 text-volt" />
            <span aria-hidden="true" dir="ltr" className="font-display font-bold text-text tabular-nums">
              {formatRating(product.rating.average)}
            </span>
            <span aria-hidden="true" dir="ltr" className="font-display tabular-nums">
              ({product.rating.count})
            </span>
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <div className="flex min-w-0 flex-col">
            {product.hasPriceRange ? <span className="text-[11px] text-muted">{t.productCard.from}</span> : null}
            <Price
              cents={product.fromPrice.cents}
              currency={product.fromPrice.currency}
              className="text-base text-text sm:text-lg"
            />
          </div>
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted transition group-hover:border-volt group-hover:bg-volt group-hover:text-bg"
          >
            <IconArrow className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

export async function ProductGrid({ products, priorityCount = 0 }: { products: ProductCardData[]; priorityCount?: number }) {
  const t = await getDictionary();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <ProductCard product={p} priority={i < priorityCount} t={t} />
        </li>
      ))}
    </ul>
  );
}
