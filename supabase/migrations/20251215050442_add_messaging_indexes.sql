-- ============================================================
-- MESSAGING PERFORMANCE INDEXES
-- ============================================================
-- Optimizes queries for conversation and message lookups

-- Index for fetching user's conversations (most common query)
-- Used by: quick-list, conversations list
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_archived 
ON conversation_participants(user_id, is_archived);

-- Index for looking up participants by conversation
-- Used by: fetching other participants in a conversation
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_user 
ON conversation_participants(conversation_id, user_id);

-- Index for fetching messages by conversation ordered by time
-- Used by: getting last message for each conversation
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON messages(conversation_id, created_at DESC);

-- Index for notifications lookup by user
-- Used by: notifications API
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created 
ON notifications(user_id, is_read, created_at DESC);

-- Index for conversations by last message time
-- Used by: ordering conversations
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
ON conversations(last_message_at DESC);

-- Index for conversations status filter
CREATE INDEX IF NOT EXISTS idx_conversations_status 
ON conversations(status);

