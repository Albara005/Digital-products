import type { Metadata } from "next";
import { getCheckoutOptions } from "@/lib/payments";
import { CartView } from "@/components/store/cart-view";
import type { PaymentProviderOption } from "@/components/store/topup-form";
import { getSignedInCustomer } from "../_lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "سلة المشتريات",
  robots: { index: false, follow: true },
};

async function loadCheckoutOptions(): Promise<{ providers: PaymentProviderOption[]; devMode: boolean }> {
  try {
    const options = await getCheckoutOptions();
    return { providers: options.providers, devMode: options.devMode };
  } catch (err) {
    console.error("[cart] Could not load payment options", err);
    return { providers: [], devMode: false };
  }
}

export default async function CartPage() {
  const [customer, options] = await Promise.all([
    getSignedInCustomer().catch((err: unknown) => {
      console.error("[cart] Could not read the customer session", err);
      return null;
    }),
    loadCheckoutOptions(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
      <h1 className="text-3xl font-bold sm:text-4xl">سلة المشتريات</h1>
      <CartView
        account={customer ? { email: customer.email, walletBalanceCents: customer.walletBalanceCents } : null}
        providers={options.providers}
        devMode={options.devMode}
      />
    </div>
  );
}
