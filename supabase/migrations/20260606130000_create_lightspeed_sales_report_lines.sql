-- Stores Lightspeed sales in the same line-level format used by the reports UI.
-- Rows are keyed by sale line so product, SKU, category, customer and margin
-- analytics can be answered directly without re-scanning the Lightspeed API.

CREATE TABLE IF NOT EXISTS public.lightspeed_sales_report_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  sale_id TEXT NOT NULL,
  sale_line_id TEXT NOT NULL,
  ticket_number TEXT,
  complete_time TIMESTAMPTZ,
  line_time TIMESTAMPTZ,

  employee_id TEXT,
  employee_name TEXT,
  category_id TEXT,
  category TEXT,
  item_id TEXT,
  sku TEXT,
  description TEXT NOT NULL DEFAULT '',

  quantity NUMERIC NOT NULL DEFAULT 0,
  retail NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,

  customer_id TEXT,
  customer_full_name TEXT,

  cost NUMERIC NOT NULL DEFAULT 0,
  profit NUMERIC NOT NULL DEFAULT 0,
  margin_pct NUMERIC,

  raw_sale JSONB,
  raw_line JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lightspeed_sales_report_lines_unique_line
    UNIQUE (user_id, sale_id, sale_line_id)
);

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_lines_user_complete_idx
  ON public.lightspeed_sales_report_lines (user_id, complete_time DESC);

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_lines_user_sku_idx
  ON public.lightspeed_sales_report_lines (user_id, sku);

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_lines_user_category_idx
  ON public.lightspeed_sales_report_lines (user_id, category);

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_lines_user_customer_idx
  ON public.lightspeed_sales_report_lines (user_id, customer_full_name);

CREATE TABLE IF NOT EXISTS public.lightspeed_sales_report_backfill_state (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'complete', 'error')),
  oldest_sale_at TIMESTAMPTZ,
  next_before TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_complete_time TIMESTAMPTZ,
  sales_processed INTEGER NOT NULL DEFAULT 0,
  lines_upserted INTEGER NOT NULL DEFAULT 0,
  pages_fetched INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.update_lightspeed_sales_report_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lightspeed_sales_report_lines_updated_at
  ON public.lightspeed_sales_report_lines;

CREATE TRIGGER lightspeed_sales_report_lines_updated_at
  BEFORE UPDATE ON public.lightspeed_sales_report_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lightspeed_sales_report_updated_at();

DROP TRIGGER IF EXISTS lightspeed_sales_report_backfill_state_updated_at
  ON public.lightspeed_sales_report_backfill_state;

CREATE TRIGGER lightspeed_sales_report_backfill_state_updated_at
  BEFORE UPDATE ON public.lightspeed_sales_report_backfill_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lightspeed_sales_report_updated_at();

ALTER TABLE public.lightspeed_sales_report_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lightspeed_sales_report_backfill_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own Lightspeed sales report lines"
  ON public.lightspeed_sales_report_lines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Lightspeed sales report lines"
  ON public.lightspeed_sales_report_lines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Lightspeed sales report lines"
  ON public.lightspeed_sales_report_lines FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Lightspeed sales report lines"
  ON public.lightspeed_sales_report_lines FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own Lightspeed sales report backfill state"
  ON public.lightspeed_sales_report_backfill_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Lightspeed sales report backfill state"
  ON public.lightspeed_sales_report_backfill_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Lightspeed sales report backfill state"
  ON public.lightspeed_sales_report_backfill_state FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Lightspeed sales report backfill state"
  ON public.lightspeed_sales_report_backfill_state FOR DELETE
  USING (auth.uid() = user_id);
