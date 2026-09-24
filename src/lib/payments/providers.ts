import "server-only";
import { stripeProvider } from "./stripe";
import { tapProvider } from "./tap";
import type { PaymentProviderAdapter, ProviderId } from "./types";

/** In display order; the first enabled one is the default. Tap first: it covers mada, KNET and Apple Pay. */
const PROVIDERS: readonly PaymentProviderAdapter[] = [tapProvider, stripeProvider];

export type CheckoutOptions = {
  providers: { id: ProviderId; label: string }[];
  /** No gateway configured outside production: orders and top-ups complete without a real charge. */
  devMode: boolean;
};

/** Payment methods to offer at checkout / wallet top-up. A provider is enabled when its secret key is set. */
export function getCheckoutOptions(): CheckoutOptions {
  const providers = PROVIDERS.filter((p) => p.isEnabled()).map(({ id, label }) => ({ id, label }));
  return { providers, devMode: providers.length === 0 && process.env.NODE_ENV !== "production" };
}

export function getProvider(id: ProviderId): PaymentProviderAdapter {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) throw new Error(`Unknown payment provider ${id}`);
  return provider;
}

/** The requested provider if it is enabled, else (when none was requested) the default; null if unavailable. */
export function resolveProvider(requested?: ProviderId | null): ProviderId | null {
  const enabled = PROVIDERS.filter((p) => p.isEnabled());
  if (requested) return enabled.some((p) => p.id === requested) ? requested : null;
  return enabled[0]?.id ?? null;
}
