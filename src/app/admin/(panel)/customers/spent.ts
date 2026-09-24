import type { OrderStatus } from "@prisma/client";

/** Orders that count toward what a customer has spent: paid and not refunded. */
export const SPENT_STATUSES: OrderStatus[] = ["PAID", "FULFILLED"];
