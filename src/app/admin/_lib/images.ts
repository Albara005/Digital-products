import "server-only";
import { z } from "zod";
import { UploadError, hasFile, storeImageUpload } from "@/lib/media";

/** Image link typed or kept by the form: "" (none), a site path (/media/…) or an http(s) URL. */
export const imageUrlSchema = z
  .string()
  .trim()
  .max(2000, "الرابط طويل جداً")
  .refine((v) => {
    if (v === "" || /^\/(?!\/)/.test(v)) return true;
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "رابط صورة غير صالح");

/**
 * Final image URL for an <ImageField>: a newly chosen file wins over the link field.
 * Call it only after the rest of the form validated, so failed saves don't leave orphan uploads.
 */
export async function resolveImageField(
  formData: FormData,
  field: string,
  currentUrl: string,
  maxSide = 1200,
): Promise<{ ok: true; url: string | null } | { ok: false; error: string }> {
  const file = formData.get(`${field}File`);
  if (!hasFile(file)) return { ok: true, url: currentUrl || null };
  try {
    return { ok: true, url: await storeImageUpload(file, { maxSide }) };
  } catch (e) {
    if (e instanceof UploadError) return { ok: false, error: e.message };
    throw e;
  }
}
