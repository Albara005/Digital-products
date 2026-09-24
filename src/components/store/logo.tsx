import Image from "next/image";
import { getDictionary } from "@/i18n/server";
import Link from "./link";

export async function Logo({ priority = false }: { priority?: boolean }) {
  const t = await getDictionary();
  return (
    <Link href="/" aria-label={t.headerNav.logoHome} className="group flex shrink-0 items-center gap-2">
      {/* The artwork sits on black; screen blending drops the box against any dark surface. */}
      <span className="relative size-10 overflow-hidden">
        <Image
          src="/brand/nitro-logo.webp"
          alt=""
          fill
          sizes="48px"
          priority={priority}
          className="scale-[1.35] object-contain mix-blend-screen transition duration-300 group-hover:scale-[1.45]"
        />
      </span>
      <span dir="ltr" className="font-display text-lg leading-none font-bold tracking-tight">
        Nitro<span className="text-volt"> Store</span>
      </span>
    </Link>
  );
}
