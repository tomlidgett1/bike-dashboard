-- Reset last_sync_at to 24 hours ago to force recheck of recent changes
UPDATE lightspeed_connections 
SET last_sync_at = NOW() - INTERVAL '24 hours'
WHERE status = 'connected';

-- Verify the update
SELECT user_id, last_sync_at, status 
FROM lightspeed_connections 
WHERE status = 'connected';
