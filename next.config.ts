import type { NextConfig } from "next";

// On Railway, fall back to the service's generated domain so a first deploy works without setting the URL by hand
const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined;

const nextConfig: NextConfig = {
  // Admin forms upload images (category/product artwork); the default 1MB action limit is too small
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || railwayUrl || "http://localhost:3000",
  },
};

export default nextConfig;
