import Image from "next/image";
import type { ProductType } from "@prisma/client";
import { ProductTypeIcon } from "./icons";
import { initials } from "./site";

// Gradient anchor differs per type so a grid of placeholders doesn't look copy-pasted.
const glow: Record<ProductType, string> = {
  CARD: "bg-[radial-gradient(90%_90%_at_100%_0%,rgba(212,255,61,0.22),transparent_60%)]",
  SUBSCRIPTION: "bg-[radial-gradient(90%_90%_at_0%_0%,rgba(212,255,61,0.20),transparent_60%)]",
  ACCOUNT: "bg-[radial-gradient(90%_90%_at_100%_100%,rgba(212,255,61,0.20),transparent_60%)]",
  SERVICE: "bg-[radial-gradient(90%_90%_at_0%_100%,rgba(212,255,61,0.20),transparent_60%)]",
};

/**
 * Product artwork, or a branded placeholder tile when the product has no image.
 * The parent controls the size/aspect ratio; this fills it.
 */
export function ProductMedia({
  name,
  type,
  imageUrl,
  sizes,
  priority = false,
  size = "md",
}: {
  name: string;
  type: ProductType;
  imageUrl: string | null;
  sizes: string;
  priority?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  if (imageUrl) {
    return (
      <div className="relative size-full overflow-hidden bg-surface-2">
        {/* Admin-provided URLs can live on any host, so skip the optimizer (no remotePatterns needed). */}
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized
          className="object-cover"
        />
      </div>
    );
  }

  const iconSize = { sm: "size-6", md: "size-10", lg: "size-16" }[size];
  const letterSize = { sm: "text-4xl", md: "text-[5.5rem]", lg: "text-[11rem]" }[size];

  return (
    <div
      role="img"
      aria-label={name}
      className="relative isolate size-full overflow-hidden bg-linear-to-br from-surface-2 to-bg"
    >
      <div aria-hidden="true" className={`absolute inset-0 ${glow[type]}`} />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(var(--color-volt)_1px,transparent_1px),linear-gradient(90deg,var(--color-volt)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(circle_at_center,black,transparent_75%)]"
      />
      <span
        aria-hidden="true"
        dir="ltr"
        className={`absolute -bottom-[0.18em] end-[0.08em] font-display font-bold leading-none tracking-tighter text-volt/[0.09] select-none ${letterSize}`}
      >
        {initials(name)}
      </span>
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
        <div className="grid place-items-center rounded-2xl bg-bg/60 p-3 text-volt shadow-[0_0_40px_-8px_rgba(212,255,61,0.45)] ring-1 ring-volt/30 backdrop-blur-sm">
          <ProductTypeIcon type={type} className={iconSize} />
        </div>
      </div>
    </div>
  );
}
