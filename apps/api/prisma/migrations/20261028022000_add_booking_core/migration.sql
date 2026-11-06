CREATE TABLE "bookings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "dp_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "dp_paid" BOOLEAN NOT NULL DEFAULT false,
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "quota_value" INTEGER NOT NULL,
  "quota_type" TEXT NOT NULL,
  "refund_rule" TEXT NOT NULL,
  "pay_deadline_minutes" INTEGER NOT NULL,
  "dp_creditable" BOOLEAN NOT NULL DEFAULT true,
  "product_sku" TEXT,
  "customer_name" TEXT NOT NULL,
  "customer_phone" TEXT,
  "customer_email" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_by" TEXT,
  "cancelled_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),

  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bookings_tenant_id_status_created_at_idx"
  ON "bookings"("tenant_id", "status", "created_at");
CREATE INDEX "bookings_tenant_id_type_status_idx"
  ON "bookings"("tenant_id", "type", "status");
