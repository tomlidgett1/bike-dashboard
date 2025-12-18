# Lightspeed Token Refresh - Setup Guide

## Overview

This system automatically refreshes all Lightspeed OAuth tokens every 6 hours to prevent expiration and keep your marketplace connections active.

## What Was Created

### 1. Edge Function: `refresh-lightspeed-tokens`
- **Location**: `supabase/functions/refresh-lightspeed-tokens/`
- **Purpose**: Refreshes OAuth tokens for all connected Lightspeed accounts
- **Features**:
  - Fetches all connected accounts from the database
  - Refreshes each account's access and refresh tokens
  - Encrypts and stores new tokens securely
  - Handles errors gracefully (marks expired connections)
  - Provides detailed logging

### 2. Scheduled Cron Job
- **Frequency**: Every 6 hours (at 00:00, 06:00, 12:00, 18:00 UTC)
- **Method**: Uses PostgreSQL `pg_cron` extension
- **Setup File**: `SETUP_AUTO_TOKEN_REFRESH.sql`

## Setup Instructions

### Step 1: Verify the Function is Deployed

The function has already been deployed. You can verify it in your Supabase Dashboard:
- Go to: https://supabase.com/dashboard/project/lvsxdoyptioyxuwvvpgb/functions
- Look for `refresh-lightspeed-tokens`

### Step 2: Set Up the Cron Schedule

1. Go to your Supabase SQL Editor
2. Open the file `SETUP_AUTO_TOKEN_REFRESH.sql`
3. Copy and paste the entire contents
4. Click "Run"

This will:
- Enable the `pg_cron` and `pg_net` extensions
- Create a helper function
- Schedule the token refresh to run every 6 hours

### Step 3: Test It Manually (Recommended)

Before waiting 6 hours, test it now:

```sql
SELECT refresh_lightspeed_tokens();
```

You should see a notice like: "Token refresh triggered with request ID: 123"

### Step 4: Reconnect Your Lightspeed Account

Since your current tokens are expired, reconnect once:

1. Go to `/connect-lightspeed` in your app
2. Click "Disconnect from Lightspeed" (if needed)
3. Click "Connect to Lightspeed"
4. Complete the OAuth flow

After this initial connection, the automatic refresh will keep the tokens fresh!

## How It Works

### Token Lifecycle

1. **Initial Connection**: User connects Lightspeed account via OAuth
   - Access token expires in 30 minutes
   - Refresh token expires after 30 days of inactivity

2. **Automatic Refresh** (every 6 hours):
   - Cron job triggers the Edge Function
   - Function fetches all connected accounts
   - For each account:
     - Uses refresh token to get new tokens
     - Stores new access token and refresh token
     - Updates expiry time

3. **On API Calls** (via `update-inventory-stock`):
   - Checks if token is expired or expiring soon
   - If yes, refreshes on-demand before making API calls
   - Retries failed requests with new token

### Error Handling

- **Invalid Refresh Token**: Connection marked as `expired`, user needs to reconnect
- **Network Errors**: Connection marked as `error`, will retry on next schedule
- **Rate Limiting**: 200ms delay between refresh requests

## Monitoring

### View Scheduled Jobs

```sql
SELECT jobid, jobname, schedule, active 
FROM cron.job 
WHERE jobname = 'refresh-lightspeed-tokens-every-6h';
```

### View Job History

```sql
SELECT * FROM cron.job_run_details 
WHERE jobid = (
  SELECT jobid FROM cron.job 
  WHERE jobname = 'refresh-lightspeed-tokens-every-6h'
)
ORDER BY start_time DESC 
LIMIT 10;
```

### Check Connection Status

```sql
SELECT 
  user_id,
  status,
  account_name,
  token_expires_at,
  last_token_refresh_at,
  last_error
FROM lightspeed_connections
ORDER BY last_token_refresh_at DESC;
```

## Maintenance

### Temporarily Disable

```sql
SELECT cron.unschedule('refresh-lightspeed-tokens-every-6h');
```

### Re-enable

```sql
SELECT cron.schedule(
  'refresh-lightspeed-tokens-every-6h',
  '0 */6 * * *',
  $$SELECT refresh_lightspeed_tokens();$$
);
```

### Change Schedule

To refresh more frequently (e.g., every 3 hours):

```sql
SELECT cron.unschedule('refresh-lightspeed-tokens-every-6h');
SELECT cron.schedule(
  'refresh-lightspeed-tokens-every-6h',
  '0 */3 * * *',  -- Changed to every 3 hours
  $$SELECT refresh_lightspeed_tokens();$$
);
```

## Troubleshooting

### Tokens Still Expiring

1. Check if cron job is active:
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'refresh-lightspeed-tokens-every-6h';
   ```

2. Check recent job runs:
   ```sql
   SELECT * FROM cron.job_run_details 
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'refresh-lightspeed-tokens-every-6h')
   ORDER BY start_time DESC LIMIT 5;
   ```

3. Manually trigger to see errors:
   ```sql
   SELECT refresh_lightspeed_tokens();
   ```

### "Missing Lightspeed Credentials" Error

Verify secrets are set in Supabase:
```bash
npx supabase secrets list
```

Should show:
- `LIGHTSPEED_CLIENT_ID`
- `LIGHTSPEED_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY`

### Connection Shows as "Expired"

This means the refresh token is no longer valid. The user needs to:
1. Disconnect from Lightspeed
2. Reconnect via OAuth

## Benefits

✅ **No Manual Intervention**: Tokens refresh automatically every 6 hours
✅ **Prevents Downtime**: Marketplace listings stay active
✅ **Error Recovery**: On-demand refresh if scheduled refresh fails
✅ **Multiple Accounts**: Handles all connected users automatically
✅ **Secure**: Tokens encrypted at rest using AES-256-GCM

## Summary

Your Lightspeed integration now has:
1. ✅ Automatic token refresh every 6 hours
2. ✅ On-demand refresh when inventory updates detect expired tokens
3. ✅ Proper error handling and connection status tracking
4. ✅ Detailed logging for monitoring

Just reconnect your Lightspeed account once, and the system will maintain the connection automatically!















