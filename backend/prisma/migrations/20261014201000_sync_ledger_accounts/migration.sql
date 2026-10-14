-- AlterEnum
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'RIDER';
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'PLATFORM';
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'DRIVER';
ALTER TYPE "LedgerAccount" ADD VALUE IF NOT EXISTS 'BANK';

-- AlterTable
ALTER TABLE "ledger_entries" ALTER COLUMN "owner_id" TYPE VARCHAR(255);
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "leg_index" INTEGER;
ALTER TABLE "ledger_entries" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ledger_entries_idempotency_key_leg_index_key" ON "ledger_entries"("idempotency_key", "leg_index");
