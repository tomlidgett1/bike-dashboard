-- ============================================================
-- Add lightspeed_workorder_id to purchases
-- ============================================================
-- When a buyer purchases a Lightspeed-sourced product the webhook now creates
-- a "YELLOW JERSEY SALE" Workorder in the seller's Lightspeed account (instead
-- of completing a sale / deducting stock-on-hand). The store processes the sale
-- themselves. This column stores the returned workorderID so the records can be
-- cross-referenced (e.g. for reconciliation or support queries).
-- Nullable — only set for Lightspeed product purchases.

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS lightspeed_workorder_id TEXT;
