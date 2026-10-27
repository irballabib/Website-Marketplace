-- Add idempotency key for automatic journals
ALTER TABLE "journal_entries"
  ADD CONSTRAINT "journal_entries_tenant_id_reference_type_reference_id_key"
  UNIQUE ("tenant_id", "reference_type", "reference_id");

-- Sequential journal numbers per tenant
CREATE TABLE "accounting_sequences" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "accounting_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_sequences_tenant_id_key" ON "accounting_sequences"("tenant_id");
