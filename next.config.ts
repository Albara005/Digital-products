import type { NextConfig } from "next";

// On Railway, fall back to the service's generated domain so a first deploy works without setting the URL by hand
const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined;

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || railwayUrl || "http://localhost:3000",
  },
};

export default nextConfig;
