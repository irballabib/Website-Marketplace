-- AlterTable
ALTER TABLE "stock_ledger" ADD COLUMN     "qty_reserved_delta" DECIMAL(18,4) NOT NULL DEFAULT 0,
ALTER COLUMN "qty_delta" SET DEFAULT 0;

-- Invariants: stock can never go negative and reservations cannot exceed on-hand stock.
ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_qty_on_hand_non_negative" CHECK ("qty_on_hand" >= 0),
  ADD CONSTRAINT "stock_balances_qty_reserved_non_negative" CHECK ("qty_reserved" >= 0),
  ADD CONSTRAINT "stock_balances_qty_reserved_lte_on_hand" CHECK ("qty_reserved" <= "qty_on_hand");

