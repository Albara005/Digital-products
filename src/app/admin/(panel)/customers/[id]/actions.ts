"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adjustWallet } from "@/lib/wallet";
import type { FormState } from "../../../_lib/form-state";
import { requireAdminAccess } from "../../../_lib/guard";
import { fail, fromZod, idSchema, ok, str } from "../../../_lib/validation";
import type { Fx } from "@/lib/fx";
import { formMoneyFx, getAdminMoney, parseMoneyInput } from "../../../_lib/money";

/**
 * "+12.50", "-5", "3.2" (also the Unicode minus and Arabic-Indic digits) typed in the admin
 * currency `fx` -> signed USD cents (the wallet's currency), at the server's rate.
 */
const signedAmount = (fx: Fx) =>
  z
    .string()
    .transform((v) =>
      v
        .trim()
        .replace(/\s+/g, "")
        .replace(/[−–]/g, "-")
        .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
        .replace(/٫/g, "."),
    )
    .transform((v, ctx) => {
      const cents = /^[+-]?\d{1,9}(\.\d+)?$/.test(v) ? parseMoneyInput(v, fx, { signed: true }) : null;
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: `أدخل مبلغاً بعملة ${fx.currency} مثل 10 أو ‎-5.50` });
        return z.NEVER;
      }
      return cents;
    })
    .refine((cents) => cents !== 0, "المبلغ لا يكون صفراً");

const adjustSchema = (fx: Fx) =>
  z.object({
    customerId: idSchema,
    amount: signedAmount(fx),
    note: z.string().trim().min(3, "اكتب سبب التعديل (3 أحرف على الأقل)").max(200, "السبب طويل جداً (200 حرف كحد أقصى)"),
  });

/** SUPER_ADMIN credit/debit of a customer's wallet. adjustWallet() locks the row and refuses overdrafts. */
export async function adjustCustomerWallet(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdminAccess("SUPER_ADMIN");
  const fx = await formMoneyFx(formData);
  if (!fx) return fail("عملة المبلغ غير متاحة. حدّث الصفحة وحاول مجدداً.", { amount: "عملة غير متاحة" });
  const parsed = adjustSchema(fx).safeParse({
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
  const money = await getAdminMoney();
  return ok(`تم ${amount > 0 ? "إضافة" : "خصم"} ${money.usd(Math.abs(amount))}. الرصيد الآن ${money.usd(result.balanceCents)}.`);
}
