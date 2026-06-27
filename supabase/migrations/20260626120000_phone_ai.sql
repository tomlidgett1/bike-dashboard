-- Phone AI: Twilio inbound numbers + OpenAI Realtime call sessions (Test Tom)

CREATE TABLE IF NOT EXISTS phone_ai_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  twilio_phone_number_e164 TEXT NOT NULL,
  twilio_phone_number_sid TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  openai_model TEXT NOT NULL DEFAULT 'gpt-realtime-2',
  voice TEXT NOT NULL DEFAULT 'marin',
  instructions TEXT NOT NULL DEFAULT 'You are a friendly bike shop phone assistant. Keep replies short and conversational — one or two sentences. Use Australian English.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT phone_ai_numbers_e164_unique UNIQUE (twilio_phone_number_e164),
  CONSTRAINT phone_ai_numbers_sid_unique UNIQUE (twilio_phone_number_sid),
  CHECK (char_length(trim(twilio_phone_number_e164)) > 0),
  CHECK (char_length(trim(twilio_phone_number_sid)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_phone_ai_numbers_user_id
  ON phone_ai_numbers(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS phone_ai_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_ai_number_id UUID REFERENCES phone_ai_numbers(id) ON DELETE SET NULL,
  call_sid TEXT NOT NULL,
  stream_sid TEXT,
  from_e164 TEXT,
  to_e164 TEXT,
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'active', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT phone_ai_call_sessions_call_sid_unique UNIQUE (call_sid)
);

CREATE INDEX IF NOT EXISTS idx_phone_ai_call_sessions_created
  ON phone_ai_call_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phone_ai_call_sessions_to_e164
  ON phone_ai_call_sessions(to_e164, created_at DESC);

ALTER TABLE phone_ai_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_ai_call_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Verified stores can view their phone AI numbers" ON phone_ai_numbers;
CREATE POLICY "Verified stores can view their phone AI numbers"
  ON phone_ai_numbers FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Verified stores can insert their phone AI numbers" ON phone_ai_numbers;
CREATE POLICY "Verified stores can insert their phone AI numbers"
  ON phone_ai_numbers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Verified stores can update their phone AI numbers" ON phone_ai_numbers;
CREATE POLICY "Verified stores can update their phone AI numbers"
  ON phone_ai_numbers FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Verified stores can delete their phone AI numbers" ON phone_ai_numbers;
CREATE POLICY "Verified stores can delete their phone AI numbers"
  ON phone_ai_numbers FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Verified stores can view their phone AI calls" ON phone_ai_call_sessions;
CREATE POLICY "Verified stores can view their phone AI calls"
  ON phone_ai_call_sessions FOR SELECT
  USING (
    phone_ai_number_id IN (
      SELECT id FROM phone_ai_numbers WHERE user_id = auth.uid()
    )
    OR to_e164 IN (
      SELECT twilio_phone_number_e164 FROM phone_ai_numbers WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service role manages phone AI numbers" ON phone_ai_numbers;
CREATE POLICY "Service role manages phone AI numbers"
  ON phone_ai_numbers FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

DROP POLICY IF EXISTS "Service role manages phone AI call sessions" ON phone_ai_call_sessions;
CREATE POLICY "Service role manages phone AI call sessions"
  ON phone_ai_call_sessions FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE phone_ai_numbers IS
  'Twilio numbers configured for OpenAI Realtime inbound phone AI (Test Tom).';

COMMENT ON TABLE phone_ai_call_sessions IS
  'Inbound call sessions bridged to OpenAI Realtime via Twilio Media Streams.';
