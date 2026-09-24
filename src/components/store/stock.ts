import type { ProductType } from "@prisma/client";

export type StockState = "in" | "low" | "out" | "manual";

export const LOW_STOCK_THRESHOLD = 5;

export function stockState(type: ProductType, available: number): StockState {
  if (type === "SERVICE") return "manual";
  if (available <= 0) return "out";
  if (available <= LOW_STOCK_THRESHOLD) return "low";
  return "in";
}
