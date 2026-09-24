-- Orders and wallet top-ups are charged in the shopper's currency. Every *Cents field of an Order
-- (and OrderItem.unitPriceCents) is in minor units of Order.currency; the wallet stays in USD.
-- Generated with `prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel`, then
-- edited to backfill existing rows (all charged in USD so far) before the NOT NULL columns lock in.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fxRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "totalUsdCents" INTEGER,
ADD COLUMN     "walletDebitUsdCents" INTEGER NOT NULL DEFAULT 0;

-- Backfill: USD orders are their own USD equivalent; the wallet part was debited 1:1
UPDATE "Order" SET "fxRate" = 1, "totalUsdCents" = "totalCents", "walletDebitUsdCents" = "walletAppliedCents"
WHERE currency = 'USD';
-- Any non-USD order predates this change and was never priced from a rate: keep its value as is
UPDATE "Order" SET "totalUsdCents" = "totalCents" WHERE "totalUsdCents" IS NULL;

ALTER TABLE "Order" ALTER COLUMN "totalUsdCents" SET NOT NULL;

-- AlterTable
ALTER TABLE "WalletTopup" ADD COLUMN     "creditUsdCents" INTEGER,
ADD COLUMN     "fxRate" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Backfill: every top-up so far was charged and credited in USD
UPDATE "WalletTopup" SET "creditUsdCents" = "amountCents" WHERE "creditUsdCents" IS NULL;

ALTER TABLE "WalletTopup" ALTER COLUMN "creditUsdCents" SET NOT NULL;
