import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Asset ids never change content, so browsers and CDNs may cache them forever.
export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  const match = /^([a-z0-9]{20,32})\.webp$/.exec(file);
  if (!match) return new Response("Not found", { status: 404 });

  const asset = await prisma.mediaAsset.findUnique({ where: { id: match[1] }, select: { bytes: true, contentType: true } });
  if (!asset) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
