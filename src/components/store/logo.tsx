import Image from "next/image";
import Link from "next/link";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-12" : "size-10";
  return (
    <Link href="/" aria-label="Nitro Store — الرئيسية" className="group flex shrink-0 items-center gap-2">
      {/* The artwork sits on black; screen blending drops the box against any dark surface. */}
      <span className={`relative ${box} overflow-hidden`}>
        <Image
          src="/brand/nitro-logo.webp"
          alt=""
          fill
          sizes="48px"
          priority
          className="scale-[1.35] object-contain mix-blend-screen transition duration-300 group-hover:scale-[1.45]"
        />
      </span>
      <span dir="ltr" className="font-display text-lg leading-none font-bold tracking-tight">
        Nitro<span className="text-volt"> Store</span>
      </span>
    </Link>
  );
}
