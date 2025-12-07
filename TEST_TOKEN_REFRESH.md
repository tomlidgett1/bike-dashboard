# Test Token Refresh Function

## Manual Test

Run this in your terminal to manually trigger the token refresh:

```bash
curl -X POST \
  "https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/refresh-lightspeed-tokens" \
  -H "Authorization: Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Replace `YOUR_SUPABASE_SERVICE_ROLE_KEY` with your actual service role key from your Supabase dashboard.

## Or test via SQL Editor

Run this in your Supabase SQL Editor:

```sql
SELECT net.http_post(
  url := 'https://lvsxdoyptioyxuwvvpgb.supabase.co/functions/v1/refresh-lightspeed-tokens',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
  ),
  body := '{}'::jsonb
);
```

## Expected Response

You should see a response like:
```json
{
  "success": true,
  "message": "Token refresh complete",
  "refreshed": 2,
  "failed": 0
}
```

If it works, then we can set up the automated schedule!








