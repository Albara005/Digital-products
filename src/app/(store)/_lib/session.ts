import "server-only";
import { cache } from "react";
import { getCustomerSession } from "@/lib/customer-auth";
import { prisma } from "@/lib/prisma";

export type SignedInCustomer = {
  id: string;
  email: string;
  walletBalanceCents: number;
  createdAt: Date;
};

/**
 * The signed-in customer, re-read from the database on every request. A valid cookie whose
 * customer no longer exists (or whose email no longer matches) counts as signed out, so pages
 * that redirect signed-out visitors to /login can never loop.
 */
export const getSignedInCustomer = cache(async (): Promise<SignedInCustomer | null> => {
  const session = await getCustomerSession();
  if (!session) return null;
  const customer = await prisma.customer.findUnique({
    where: { id: session.customerId },
    select: { id: true, email: true, walletBalanceCents: true, createdAt: true },
  });
  if (!customer || customer.email.toLowerCase() !== session.email.toLowerCase()) return null;
  return customer;
});
