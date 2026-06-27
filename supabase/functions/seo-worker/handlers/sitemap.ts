// sitemap — submit the sitemap index to Search Console (a hint, not a guarantee).
// Next.js serves /sitemap.xml itself; this just nudges Google. No-ops without creds.
import type { Handler } from '../../_shared/seo-types.ts';
import { getGoogleAccessToken, gscSiteProperty, GSC_SCOPE_FULL } from '../../_shared/google-auth.ts';

export const sitemap: Handler = async (_task, { site }) => {
  const siteProperty = gscSiteProperty();
  if (!siteProperty) return { skipped: 'GSC_SITE_URL not set (Next still serves /sitemap.xml)' };

  const token = await getGoogleAccessToken([GSC_SCOPE_FULL]);
  if (!token) return { skipped: 'no Google service account (Next still serves /sitemap.xml)' };

  const feed = `${site}/sitemap.xml`;
  const endpoint = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteProperty)}/sitemaps/${encodeURIComponent(feed)}`;
  const res = await fetch(endpoint, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok && res.status !== 204) {
    throw new Error(`sitemap submit ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return { submitted: feed };
};
