-- ============================================================
-- Setup Cron Job for Inventory Stock Updates
-- Runs every 10 minutes to check for stock changes via InventoryLog
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create function to call Edge Function
CREATE OR REPLACE FUNCTION trigger_inventory_stock_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Call the Edge Function using pg_net
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/update-inventory-stock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) INTO request_id;
  
  RAISE NOTICE 'Triggered inventory stock update, request ID: %', request_id;
END;
$$;

-- Schedule cron job to run every 10 minutes
SELECT cron.schedule(
  'update-inventory-stock-every-10min',  -- Job name
  '*/10 * * * *',                        -- Every 10 minutes
  $$SELECT trigger_inventory_stock_update()$$
);

-- Note: You need to set these config values in Supabase:
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'https://lvsxdoyptioyxuwvvpgb.supabase.co';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
