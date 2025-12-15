-- ============================================================
-- ENABLE SUPABASE REALTIME FOR MESSAGES AND OFFERS
-- ============================================================
-- This migration enables Realtime subscriptions for messaging
-- and offers tables to allow instant updates without polling.
--
-- Tables enabled:
-- - messages: For instant message delivery
-- - conversations: For new conversation notifications
-- - conversation_participants: For unread count updates
-- - offers: For offer status changes
-- ============================================================

-- Enable Realtime for messages table (instant message delivery)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    RAISE NOTICE 'Added messages table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'messages table already in supabase_realtime publication';
  END IF;
END $$;

-- Enable Realtime for conversations table (new conversation notifications)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
    RAISE NOTICE 'Added conversations table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'conversations table already in supabase_realtime publication';
  END IF;
END $$;

-- Enable Realtime for conversation_participants table (unread count updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'conversation_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;
    RAISE NOTICE 'Added conversation_participants table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'conversation_participants table already in supabase_realtime publication';
  END IF;
END $$;

-- Enable Realtime for offers table (offer status changes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE offers;
    RAISE NOTICE 'Added offers table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'offers table already in supabase_realtime publication';
  END IF;
END $$;

-- ============================================================
-- IMPORTANT: Realtime RLS Considerations
-- ============================================================
-- For Realtime to work with Row Level Security (RLS), ensure:
-- 1. Tables have RLS enabled
-- 2. Appropriate SELECT policies exist for authenticated users
-- 3. The anon key can read relevant rows
--
-- The existing RLS policies should already handle this for
-- messages, conversations, and offers.
-- ============================================================
