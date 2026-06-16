-- Root-cause fix for the Lightspeed "keep having to reconnect" bug.
--
-- Lightspeed R-Series uses SINGLE-USE ROTATING refresh tokens. Per the API docs:
--   "After a refresh token has been used, a new access token and a new refresh
--    token will be issued. Once the new access token is used to authenticate a
--    request, the old refresh token will be revoked."
-- i.e. a given refresh token may only be redeemed once.
--
-- We had TWO proactive refreshers running on the EXACT SAME schedule (*/20 * * * *):
--   1. Vercel cron     -> GET /api/cron/refresh-lightspeed-tokens   (vercel.json)
--   2. Supabase pg_cron -> edge function "refresh-lightspeed-tokens"
--      (scheduled by migration 20260530120000_fix_lightspeed_token_refresh_schedule.sql)
-- Both jobs fire at HH:00 / HH:20 / HH:40, both select the same connections whose
-- token is near expiry, both decrypt the SAME stored refresh token, and both POST it
-- to Lightspeed within the same second. Lightspeed rotates the token for the first
-- request and revokes that family when the duplicate request reuses it -> the next
-- refresh returns `invalid_grant` -> the connection is marked 'expired' -> the store
-- is forced to log in again on the settings page. This happened roughly every cycle.
--
-- Fix: keep ONLY the Vercel cron as the single proactive refresher, remove the
-- duplicate pg_cron job, and add a short-lived per-connection lock so the remaining
-- cron and any on-demand (401 / pre-expiry) refresh can never consume the rotating
-- refresh token concurrently.

-- 1. Remove the duplicate pg_cron refresher. No-op if it isn't currently scheduled.
SELECT cron.unschedule('refresh-lightspeed-tokens')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-lightspeed-tokens');

-- 2. Per-connection refresh lock. Set while a refresh is in flight; auto-expires
--    after 60s (handled in token-manager.ts) so a crashed refresher can't wedge it.
ALTER TABLE lightspeed_connections
  ADD COLUMN IF NOT EXISTS token_refresh_locked_at TIMESTAMPTZ;

COMMENT ON COLUMN lightspeed_connections.token_refresh_locked_at IS
  'Advisory lock for OAuth token refresh. Set while a refresh is in flight so concurrent refreshers never redeem the same single-use rotating refresh token. Auto-expires after 60s (see refreshAccessToken in src/lib/services/lightspeed/token-manager.ts).';
