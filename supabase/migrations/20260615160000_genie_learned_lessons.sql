-- Self-learning Genie: a per-store playbook the agent grows from its own runs and
-- from owner 👍/👎 feedback. Lessons are distilled (deduped) by a reflector model,
-- injected into the agent's system prompt, and fully visible/reversible to the owner.

CREATE TABLE IF NOT EXISTS genie_learned_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- sql | xero | deputy | gmail | storefront | formatting | strategy | general
  scope TEXT NOT NULL DEFAULT 'general',
  -- avoid (don't repeat a mistake) | prefer (keep doing this well)
  kind TEXT NOT NULL DEFAULT 'avoid',
  lesson TEXT NOT NULL,
  evidence TEXT,
  -- error_recovery | recheck | verification | user_feedback | reflection
  source TEXT NOT NULL DEFAULT 'reflection',
  reinforced_count INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_genie_learned_lessons_user_active
  ON genie_learned_lessons(user_id, active, reinforced_count DESC);

ALTER TABLE genie_learned_lessons ENABLE ROW LEVEL SECURITY;

-- Owner can read, toggle (active), and delete their own lessons. Inserts/upserts
-- come from the server-side reflector via the service-role client (bypasses RLS).
CREATE POLICY "genie_learned_lessons_owner_all"
  ON genie_learned_lessons FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 👍/👎 on individual Genie answers — the positive/negative signal that feeds
-- reflection. One row per (user, message); re-rating updates in place.
CREATE TABLE IF NOT EXISTS genie_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id TEXT,
  message_id TEXT NOT NULL,
  rating TEXT NOT NULL, -- up | down
  question TEXT,
  answer TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_genie_message_feedback_user_created
  ON genie_message_feedback(user_id, created_at DESC);

ALTER TABLE genie_message_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "genie_message_feedback_owner_all"
  ON genie_message_feedback FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
