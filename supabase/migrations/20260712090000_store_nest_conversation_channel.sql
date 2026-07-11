-- Persist Nest channel classification so inbox list reads never scan message history.

ALTER TABLE store_nest_conversations
  ADD COLUMN IF NOT EXISTS channel TEXT;

WITH first_messages AS (
  SELECT DISTINCT ON (user_id, chat_id)
    user_id,
    chat_id,
    role,
    handle,
    metadata->>'source' AS source
  FROM store_nest_messages
  ORDER BY user_id, chat_id, created_at ASC
)
UPDATE store_nest_conversations AS conversation
SET channel = CASE
  WHEN conversation.triggered_by_twilio THEN 'missed_call'
  WHEN first_message.source = 'twilio-voice-webhook' THEN 'missed_call'
  WHEN first_message.handle LIKE 'staff@%'
    OR first_message.source LIKE 'brand_portal_%' THEN 'store_outreach'
  WHEN first_message.role = 'user' THEN 'website_chat'
  WHEN conversation.has_manual_messages
    AND conversation.last_customer_message_at IS NULL
    AND conversation.preview_role <> 'user' THEN 'store_outreach'
  ELSE 'website_chat'
END
FROM first_messages AS first_message
WHERE conversation.user_id = first_message.user_id
  AND conversation.chat_id = first_message.chat_id;

UPDATE store_nest_conversations
SET channel = CASE
  WHEN triggered_by_twilio THEN 'missed_call'
  WHEN has_manual_messages
    AND last_customer_message_at IS NULL
    AND preview_role <> 'user' THEN 'store_outreach'
  ELSE 'website_chat'
END
WHERE channel IS NULL;

ALTER TABLE store_nest_conversations
  ALTER COLUMN channel SET DEFAULT 'website_chat',
  ALTER COLUMN channel SET NOT NULL;

ALTER TABLE store_nest_conversations
  DROP CONSTRAINT IF EXISTS store_nest_conversations_channel_check;

ALTER TABLE store_nest_conversations
  ADD CONSTRAINT store_nest_conversations_channel_check
  CHECK (channel IN ('website_chat', 'missed_call', 'store_outreach'));
