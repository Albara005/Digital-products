"use client";

import NextLink from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "@/i18n/client";
import { localizePath } from "@/i18n/config";

/**
 * next/link that keeps the visitor in their language: internal string hrefs ("/cart") get the
 * locale prefix ("/en/cart") on the English storefront. Every storefront link goes through here,
 * so a client-side navigation never mixes an English shell with an Arabic page.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  const locale = useLocale();
  return <NextLink href={typeof href === "string" ? localizePath(href, locale) : href} {...props} />;
}
