-- CreateTable
CREATE TABLE "pos_shifts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "opening_cash" DECIMAL(18,2) NOT NULL,
    "closing_cash" DECIMAL(18,2),
    "expected_cash" DECIMAL(18,2),
    "difference" DECIMAL(18,2),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "shift_id" TEXT NOT NULL,
    "cashier_id" TEXT NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "customer_name" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "payment_total" DECIMAL(18,2) NOT NULL,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sale_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "pos_sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_sequences" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pos_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_shifts_tenant_id_location_id_status_idx" ON "pos_shifts"("tenant_id", "location_id", "status");

-- CreateIndex
CREATE INDEX "pos_shifts_tenant_id_cashier_id_status_idx" ON "pos_shifts"("tenant_id", "cashier_id", "status");

-- CreateIndex
CREATE INDEX "pos_sales_tenant_id_location_id_created_at_idx" ON "pos_sales"("tenant_id", "location_id", "created_at");

-- CreateIndex
CREATE INDEX "pos_sales_tenant_id_shift_id_idx" ON "pos_sales"("tenant_id", "shift_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_tenant_id_receipt_number_key" ON "pos_sales"("tenant_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sales_tenant_id_idempotency_key_key" ON "pos_sales"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "pos_sale_items_tenant_id_sale_id_idx" ON "pos_sale_items"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "pos_payments_tenant_id_sale_id_idx" ON "pos_payments"("tenant_id", "sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "pos_sequences_tenant_id_location_id_key" ON "pos_sequences"("tenant_id", "location_id");

-- AddForeignKey
ALTER TABLE "pos_sales" ADD CONSTRAINT "pos_sales_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "pos_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_sale_items" ADD CONSTRAINT "pos_sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_payments" ADD CONSTRAINT "pos_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "pos_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
