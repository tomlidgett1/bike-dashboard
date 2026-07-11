/**
 * List Google Business accounts/locations and resolve a public review URL.
 */

import { GOOGLE_BUSINESS_OAUTH } from "@/lib/google/business-oauth-config";

export type GoogleBusinessAccountOption = {
  accountId: string;
  name: string;
  type: string | null;
};

export type GoogleBusinessLocationOption = {
  accountId: string;
  locationId: string;
  title: string;
  placeId: string | null;
  mapsUri: string | null;
  newReviewUri: string | null;
  /** Best URL to send customers for leaving a review. */
  reviewUrl: string | null;
};

function stripPrefix(resource: string, prefix: string): string {
  return resource.startsWith(prefix) ? resource.slice(prefix.length) : resource;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  email: string | null;
  name: string | null;
}> {
  const res = await fetch(GOOGLE_BUSINESS_OAUTH.USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return { email: null, name: null };
  const data = (await res.json()) as { email?: string; name?: string };
  return { email: data.email?.trim() || null, name: data.name?.trim() || null };
}

export async function listGoogleBusinessAccounts(
  accessToken: string,
): Promise<GoogleBusinessAccountOption[]> {
  const res = await fetch(`${GOOGLE_BUSINESS_OAUTH.ACCOUNT_API}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`Could not list Google Business accounts (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    accounts?: Array<{ name?: string; accountName?: string; type?: string }>;
  };
  return (data.accounts ?? [])
    .map((account) => {
      const resource = account.name?.trim();
      if (!resource) return null;
      const accountId = stripPrefix(resource, "accounts/");
      return {
        accountId,
        name: account.accountName?.trim() || accountId,
        type: account.type ?? null,
      } satisfies GoogleBusinessAccountOption;
    })
    .filter((item): item is GoogleBusinessAccountOption => Boolean(item));
}

function resolveReviewUrl(options: {
  newReviewUri?: string | null;
  mapsUri?: string | null;
  placeId?: string | null;
}): string | null {
  if (options.newReviewUri?.trim()) return options.newReviewUri.trim();
  if (options.placeId?.trim()) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(options.placeId.trim())}`;
  }
  if (options.mapsUri?.trim()) return options.mapsUri.trim();
  return null;
}

export async function listGoogleBusinessLocations(
  accessToken: string,
  accountId: string,
): Promise<GoogleBusinessLocationOption[]> {
  const readMask = "name,title,metadata";
  const params = new URLSearchParams({
    readMask,
    pageSize: "100",
  });
  const url = `${GOOGLE_BUSINESS_OAUTH.INFO_API}/accounts/${accountId}/locations?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 400);
    throw new Error(`Could not list Google Business locations (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    locations?: Array<{
      name?: string;
      title?: string;
      metadata?: {
        placeId?: string;
        mapsUri?: string;
        newReviewUri?: string;
      };
    }>;
  };

  return (data.locations ?? [])
    .map((location) => {
      const resource = location.name?.trim();
      if (!resource) return null;
      // Resource is accounts/{a}/locations/{l} or locations/{l}
      const locationId = resource.includes("/locations/")
        ? resource.split("/locations/").pop()!
        : stripPrefix(resource, "locations/");
      const placeId = location.metadata?.placeId?.trim() || null;
      const mapsUri = location.metadata?.mapsUri?.trim() || null;
      const newReviewUri = location.metadata?.newReviewUri?.trim() || null;
      return {
        accountId,
        locationId,
        title: location.title?.trim() || locationId,
        placeId,
        mapsUri,
        newReviewUri,
        reviewUrl: resolveReviewUrl({ newReviewUri, mapsUri, placeId }),
      } satisfies GoogleBusinessLocationOption;
    })
    .filter((item): item is GoogleBusinessLocationOption => Boolean(item));
}

export async function listAllGoogleBusinessLocations(
  accessToken: string,
): Promise<GoogleBusinessLocationOption[]> {
  const accounts = await listGoogleBusinessAccounts(accessToken);
  const all: GoogleBusinessLocationOption[] = [];
  for (const account of accounts) {
    try {
      const locations = await listGoogleBusinessLocations(accessToken, account.accountId);
      for (const location of locations) {
        all.push({
          ...location,
          // Prefer account display name when useful in the picker label.
          title:
            accounts.length > 1
              ? `${location.title} (${account.name})`
              : location.title,
        });
      }
    } catch (error) {
      console.warn(
        "[gbp-oauth] locations failed for account",
        account.accountId,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return all;
}
