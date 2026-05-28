-- ============================================================
-- FIX REPLICA IDENTITY FOR REALTIME FILTERING
-- ============================================================
-- conversation_participants has a surrogate PK (id UUID).
-- Without REPLICA IDENTITY FULL, Postgres only logs the PK column
-- in the WAL for UPDATE/DELETE events. This means Supabase Realtime's
-- server-side column filters (e.g. user_id=eq.UUID) silently drop
-- every event because the filtered column is not present in the WAL
-- record.
--
-- Setting REPLICA IDENTITY FULL causes Postgres to log ALL column
-- values for every UPDATE/DELETE, allowing Supabase Realtime to
-- evaluate column-based filters correctly.
--
-- Impact: slightly larger WAL entries for this table. conversation_
-- participants is low-write (one row per user per conversation), so
-- the overhead is negligible.
-- ============================================================

ALTER TABLE conversation_participants REPLICA IDENTITY FULL;

-- messages table also benefits — keeps INSERT-based subscriptions
-- fully functional and allows future UPDATE filters (e.g. soft deletes).
ALTER TABLE messages REPLICA IDENTITY FULL;
