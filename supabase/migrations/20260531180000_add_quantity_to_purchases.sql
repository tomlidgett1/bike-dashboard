-- ============================================================
-- Add quantity to purchases (cart multi-unit support)
-- ============================================================
-- A single purchase row can now represent multiple units of the same product
-- (e.g. 3 of a shop-inventory item). item_price stays the UNIT price; the line
-- total is item_price * quantity, and platform_fee / seller_payout_amount are
-- computed on that line total in the webhook.
--
-- Backward compatible: existing rows and any code path that omits the column
-- default to quantity = 1, so the column can be added before the new app code
-- ships without breaking older writers.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Guard against zero / negative quantities slipping in.
ALTER TABLE purchases
  DROP CONSTRAINT IF EXISTS purchases_quantity_positive;
ALTER TABLE purchases
  ADD CONSTRAINT purchases_quantity_positive CHECK (quantity > 0);
