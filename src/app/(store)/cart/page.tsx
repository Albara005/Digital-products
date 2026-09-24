import type { Metadata } from "next";
import { getCheckoutOptions } from "@/lib/payments";
import { CartView } from "@/components/store/cart-view";
import type { PaymentProviderOption } from "@/components/store/topup-form";
import { type Dictionary, getDictionary } from "@/i18n/server";
import { getSignedInCustomer } from "../_lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getDictionary()).cartPage.title,
    robots: { index: false, follow: true },
  };
}

/** Enabled gateways with their labels in the shopper's language. */
async function loadCheckoutOptions(t: Dictionary): Promise<{ providers: PaymentProviderOption[]; devMode: boolean }> {
  try {
    const options = await getCheckoutOptions();
    return {
      providers: options.providers.map((p) => ({ id: p.id, label: t.cartPage.providers[p.id] ?? p.label })),
      devMode: options.devMode,
    };
  } catch (err) {
    console.error("[cart] Could not load payment options", err);
    return { providers: [], devMode: false };
  }
}

export default async function CartPage() {
  const t = await getDictionary();
  const [customer, options] = await Promise.all([
    getSignedInCustomer().catch((err: unknown) => {
      console.error("[cart] Could not read the customer session", err);
      return null;
    }),
    loadCheckoutOptions(t),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-12">
      <h1 className="text-3xl font-bold sm:text-4xl">{t.cartPage.title}</h1>
      <CartView
        account={customer ? { email: customer.email, walletBalanceCents: customer.walletBalanceCents } : null}
        providers={options.providers}
        devMode={options.devMode}
      />
    </div>
  );
}
