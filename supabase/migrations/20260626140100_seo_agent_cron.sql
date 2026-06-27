-- ============================================================================
-- Search Dominance Agent — activation (pg_cron + pg_net).
--
-- ⚠️  GATED: scheduling this turns the agent ON. Before applying, store two
-- secrets in Supabase Vault (no secrets in git):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'seo_project_url');
--   select vault.create_secret('<service_role_key>',                'seo_service_key');
--
-- The cron bodies are stored as text and only evaluate the Vault lookups when
-- they FIRE, so applying this migration before the secrets exist is harmless —
-- the jobs simply no-op (and you can add the secrets later). To pause the agent:
--   select cron.unschedule('yj-seo-orchestrator-hourly');
--   select cron.unschedule('yj-seo-worker-drain');
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: build the Authorization header value from the Vault service key.
-- (Inlined in each job below so there's no SECURITY DEFINER surface.)

-- Hourly: seed a fresh run (the orchestrator enqueues the pipeline).
select cron.unschedule('yj-seo-orchestrator-hourly')
where exists (select 1 from cron.job where jobname = 'yj-seo-orchestrator-hourly');

select cron.schedule(
  'yj-seo-orchestrator-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'seo_project_url') || '/functions/v1/seo-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'seo_service_key')
    ),
    body := '{"source":"cron","cadence":"hourly"}'::jsonb
  );
  $$
);

-- Every 5 minutes: drain the task queue (handles work the orchestrator seeded,
-- including page-generator/validator fan-out and any retries with backoff).
select cron.unschedule('yj-seo-worker-drain')
where exists (select 1 from cron.job where jobname = 'yj-seo-worker-drain');

select cron.schedule(
  'yj-seo-worker-drain',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'seo_project_url') || '/functions/v1/seo-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'seo_service_key')
    ),
    body := '{"trigger":"cron"}'::jsonb
  );
  $$
);
