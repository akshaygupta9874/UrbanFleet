-- AlterTable
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "driver_id" UUID;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "gateway" VARCHAR(50) NOT NULL DEFAULT 'RAZORPAY';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "method" VARCHAR(50);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "fare_breakdown" JSONB;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "attempt_number" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "failure_reason" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "failure_code" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "last_failed_gateway_payment_id" VARCHAR(255);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refunded_amount_paise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refunds" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "ledger_transaction_id" VARCHAR(255);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "captured_at" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "driver_id" UUID NOT NULL,
    "payment_id" UUID,
    "ride_id" UUID NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'INR',
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "mode" VARCHAR(20) NOT NULL DEFAULT 'IMPS',
    "gateway_payout_id" VARCHAR(255),
    "utr" VARCHAR(255),
    "ledger_transaction_id" VARCHAR(255),
    "reversal_ledger_transaction_id" VARCHAR(255),
    "failure_reason" TEXT,
    "metadata" JSONB,
    "processed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "reversed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payouts_driver_id_idx" ON "payouts"("driver_id");
CREATE INDEX IF NOT EXISTS "payouts_ride_id_idx" ON "payouts"("ride_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payouts_payment_id_fkey'
    ) THEN
        ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
