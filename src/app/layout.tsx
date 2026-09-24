import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Inter, Space_Grotesk } from "next/font/google";
import { localeDir } from "@/i18n/config";
import { getDictionary, getLocale } from "@/i18n/server";
import "./globals.css";

const arabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
});

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700"],
});

// Body text of the English storefront (Arabic keeps IBM Plex Sans Arabic).
const latin = Inter({
  variable: "--font-latin",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: "Nitro Store", template: "%s | Nitro Store" },
    description: t.meta.siteDescription,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set by src/proxy.ts from the URL ("/en/..." = English); the admin panel is always Arabic.
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={localeDir(locale)}
      className={`${arabic.variable} ${display.variable} ${latin.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
