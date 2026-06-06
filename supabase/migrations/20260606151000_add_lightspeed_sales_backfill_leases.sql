ALTER TABLE public.lightspeed_sales_report_backfill_state
  ADD COLUMN IF NOT EXISTS lease_owner TEXT,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS lightspeed_sales_report_backfill_state_lease_idx
  ON public.lightspeed_sales_report_backfill_state (status, lease_expires_at);

COMMENT ON COLUMN public.lightspeed_sales_report_backfill_state.lease_owner IS
  'Short-lived worker lease owner used to prevent concurrent historical backfill workers from processing the same checkpoint.';

COMMENT ON COLUMN public.lightspeed_sales_report_backfill_state.lease_expires_at IS
  'When the current historical backfill worker lease expires. Expired leases can be safely claimed by the next worker invocation.';

COMMENT ON COLUMN public.lightspeed_sales_report_backfill_state.last_heartbeat_at IS
  'Last time the active historical backfill worker refreshed its lease.';
