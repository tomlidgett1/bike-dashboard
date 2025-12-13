-- Check all connections
SELECT 
  user_id, 
  status, 
  account_id,
  account_name,
  CASE 
    WHEN access_token_encrypted IS NOT NULL THEN 'YES' 
    ELSE 'NO' 
  END as has_access_token,
  CASE 
    WHEN refresh_token_encrypted IS NOT NULL THEN 'YES' 
    ELSE 'NO' 
  END as has_refresh_token,
  token_expires_at,
  last_error,
  connected_at,
  last_sync_at
FROM lightspeed_connections
ORDER BY connected_at DESC;












