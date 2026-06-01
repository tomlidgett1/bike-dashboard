-- ============================================================
-- Add lightspeed_sale_id to purchases
-- ============================================================
-- When a buyer purchases a Lightspeed-sourced product the webhook
-- creates a Quote-status sale in the seller's Lightspeed account.
-- This column stores the returned saleID so the records can be
-- cross-referenced (e.g. for reconciliation or support queries).
-- Nullable — only set for Lightspeed product purchases.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS lightspeed_sale_id TEXT;
