"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adjustWallet } from "@/lib/wallet";
import type { FormState } from "../../../_lib/form-state";
import { requireAdminAccess } from "../../../_lib/guard";
import { fail, fromZod, idSchema, ok, str } from "../../../_lib/validation";
import { formatPrice } from "@/lib/format";

/** "+12.50", "-5", "3.2" (also accepts the Unicode minus and Arabic-Indic digits) -> signed cents. */
const signedDollars = z
  .string()
  .transform((v) =>
    v
      .trim()
      .replace(/\s+/g, "")
      .replace(/[−–]/g, "-")
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/٫/g, "."),
  )
  .refine((v) => /^[+-]?\d{1,5}(\.\d{1,2})?$/.test(v), "أدخل مبلغاً بالدولار مثل 10 أو ‎-5.50")
  .transform((v) => {
    const sign = v.startsWith("-") ? -1 : 1;
    const [whole, frac = ""] = v.replace(/^[+-]/, "").split(".");
    return sign * (Number(whole) * 100 + Number((frac + "00").slice(0, 2)));
  })
  .refine((cents) => cents !== 0, "المبلغ لا يكون صفراً");

const adjustSchema = z.object({
  customerId: idSchema,
  amount: signedDollars,
  note: z.string().trim().min(3, "اكتب سبب التعديل (3 أحرف على الأقل)").max(200, "السبب طويل جداً (200 حرف كحد أقصى)"),
});

/** SUPER_ADMIN credit/debit of a customer's wallet. adjustWallet() locks the row and refuses overdrafts. */
export async function adjustCustomerWallet(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const parsed = adjustSchema.safeParse({
    customerId: str(formData, "customerId"),
    amount: str(formData, "amount"),
    note: str(formData, "note"),
  });
  if (!parsed.success) return fromZod(parsed.error);
  const { customerId, amount, note } = parsed.data;

  const result = await adjustWallet(customerId, amount, note, { adminId: session.adminId, email: session.email });
  if (!result.ok) return fail(result.error, { amount: result.error });

  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath("/admin/customers");
  return ok(`تم ${amount > 0 ? "إضافة" : "خصم"} ${formatPrice(Math.abs(amount))}. الرصيد الآن ${formatPrice(result.balanceCents)}.`);
}
