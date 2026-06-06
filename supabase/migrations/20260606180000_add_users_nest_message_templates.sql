-- Per-store Nest outbound message intro and signoff templates.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nest_message_intro TEXT,
  ADD COLUMN IF NOT EXISTS nest_message_signoff TEXT;

COMMENT ON COLUMN users.nest_message_intro IS
  'Nest SMS intro template. Supports {name} and {store} placeholders.';

COMMENT ON COLUMN users.nest_message_signoff IS
  'Nest SMS signoff template. Supports {name} and {store} placeholders.';
