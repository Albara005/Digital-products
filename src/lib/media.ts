import "server-only";
import sharp, { type OutputInfo } from "sharp";
import { prisma } from "@/lib/prisma";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);

export class UploadError extends Error {}

/** Public URL of a stored asset. */
export function mediaUrl(id: string) {
  return `/media/${id}.webp`;
}

/** True when a form field actually carries a chosen file (browsers send an empty File otherwise). */
export function hasFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "size" in value && value.size > 0;
}

/**
 * Validates an admin upload, re-encodes it as WebP (transparency kept, metadata stripped,
 * longest side ≤ maxSide) and stores it in the database. Re-encoding means only decoded pixels
 * are ever served, never the uploaded bytes. Returns the public URL.
 */
export async function storeImageUpload(file: File, { maxSide = 1200 } = {}): Promise<string> {
  if (!ACCEPTED.has(file.type)) throw new UploadError("الصيغ المدعومة: PNG أو JPG أو WebP أو AVIF.");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("حجم الصورة أكبر من 5 ميجابايت.");

  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new UploadError("تعذّر قراءة الصورة. جرّب ملفاً آخر.");
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      contentType: "image/webp",
      bytes: new Uint8Array(output.data),
      width: output.info.width,
      height: output.info.height,
      size: output.info.size,
    },
    select: { id: true },
  });
  return mediaUrl(asset.id);
}
