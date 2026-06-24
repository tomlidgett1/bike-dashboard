-- Lightspeed OAuth hardening: monotonic token generation + audit events.
-- token_generation lets refresh/oauth writers compare-and-set so stale workers
-- cannot mark a newer connection expired after reconnect.

ALTER TABLE lightspeed_connections
  ADD COLUMN IF NOT EXISTS token_generation BIGINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN lightspeed_connections.token_generation IS
  'Monotonic row version for OAuth token writes. Incremented on connect, refresh, disconnect, and expiry so stale refresh attempts can be suppressed.';

CREATE TABLE IF NOT EXISTS lightspeed_connection_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES lightspeed_connections(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  source TEXT,
  previous_status TEXT,
  new_status TEXT,
  token_generation BIGINT,
  token_expires_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lightspeed_connection_events_user_id_idx
  ON lightspeed_connection_events(user_id);

CREATE INDEX IF NOT EXISTS lightspeed_connection_events_created_at_idx
  ON lightspeed_connection_events(created_at DESC);

CREATE INDEX IF NOT EXISTS lightspeed_connection_events_event_type_idx
  ON lightspeed_connection_events(event_type);

ALTER TABLE lightspeed_connection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own connection events"
  ON lightspeed_connection_events FOR SELECT
  USING (auth.uid() = user_id);
