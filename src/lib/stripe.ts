import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Stripe is optional: without STRIPE_SECRET_KEY the store runs in dev mode (non-production only). */
export function isStripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

/** Lazily created so builds and pages that never touch payments don't need the key. */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!client) {
    client = new Stripe(key, {
      appInfo: { name: "Nitro Store" },
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return client;
}
