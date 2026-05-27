-- Fix the inventory stock update trigger used by pg_cron.
-- The previous function read from app.settings.supabase_url and
-- app.settings.service_role_key, but those settings are not configured in prod,
-- so the job failed every 10 minutes before it could call the edge function.

CREATE OR REPLACE FUNCTION trigger_inventory_stock_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
BEGIN
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL')
      || '/functions/v1/update-inventory-stock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'SUPABASE_SERVICE_ROLE_KEY'
      )
    ),
    body := '{}'::jsonb
  ) INTO request_id;

  RAISE NOTICE 'Triggered inventory stock update, request ID: %', request_id;
END;
$$;
