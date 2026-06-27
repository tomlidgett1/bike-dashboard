// business-profile-sync — keep Ashburton Cycles' (and authorised partners')
// Google Business Profile fresh and surface review signals. Requires the
// Business Profile API (business.manage scope) + a location id, which Google
// gates behind per-account approval — so this no-ops cleanly until configured.
import type { Handler } from '../../_shared/seo-types.ts';
import { getGoogleAccessToken, BUSINESS_SCOPE } from '../../_shared/google-auth.ts';

export const businessProfileSync: Handler = async (_task, _ctx) => {
  const accountId = Deno.env.get('GBP_ACCOUNT_ID');
  const locationId = Deno.env.get('GBP_LOCATION_ID');
  if (!accountId || !locationId) {
    return { skipped: 'GBP_ACCOUNT_ID/GBP_LOCATION_ID not set' };
  }
  const token = await getGoogleAccessToken([BUSINESS_SCOPE]);
  if (!token) return { skipped: 'no Google service account configured' };

  // Read current reviews so the agent can react to new/negative ones.
  try {
    const res = await fetch(
      `https://mybusiness.googleapis.com/v4/accounts/${accountId}/locations/${locationId}/reviews`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return { error: `GBP reviews ${res.status}`, note: 'check API enablement + scope approval' };
    const data = await res.json();
    const summary = {
      total: data?.totalReviewCount ?? 0,
      average: data?.averageRating ?? null,
      checked_at: new Date().toISOString(),
    };
    // Returned into the task result for the dashboard; we don't clobber the
    // owned-store page params (a jsonb merge would need an RPC).
    return summary;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
};
