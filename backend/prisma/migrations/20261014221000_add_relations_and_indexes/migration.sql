-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payments_gateway_payment_id_key" ON "payments"("gateway_payment_id");

-- AddForeignKey for payments.driver_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payments_driver_id_fkey'
    ) THEN
        ALTER TABLE "payments" ADD CONSTRAINT "payments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payouts_gateway_payout_id_key" ON "payouts"("gateway_payout_id");

-- AddForeignKeys for payouts
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payouts_driver_id_fkey'
    ) THEN
        ALTER TABLE "payouts" ADD CONSTRAINT "payouts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'payouts_ride_id_fkey'
    ) THEN
        ALTER TABLE "payouts" ADD CONSTRAINT "payouts_ride_id_fkey" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- Partial unique indexes for domain integrity
CREATE UNIQUE INDEX IF NOT EXISTS "idx_rides_one_active_per_rider" ON "rides"("rider_id") WHERE status NOT IN ('COMPLETED', 'CANCELLED');
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payouts_one_live_per_payment" ON "payouts"("payment_id") WHERE status IN ('PENDING', 'PROCESSING', 'PROCESSED');
