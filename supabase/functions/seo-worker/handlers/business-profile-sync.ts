// business-profile-sync — keep Ashburton Cycles' Google Business Profile in
// lockstep with the live store data (website link, opening hours, service menu)
// and surface review signals. GBP is the dominant ranking surface for
// "bike service near me" map-pack queries, so the listing must always carry the
// current service menu + hours from the store profile, not a stale copy.
//
// Requires the Business Profile APIs (business.manage scope) + account/location
// ids, which Google gates behind per-account approval — no-ops cleanly until
// configured. Safety: runs in DRY-RUN mode (reports the would-be diff) unless
// GBP_APPLY=true, so the first configured run shows exactly what would change
// in the /admin/seo cockpit before anything touches the public listing.
//
// Env:
//   GBP_ACCOUNT_ID   — numeric account id (accounts/{id})
//   GBP_LOCATION_ID  — numeric location id (locations/{id})
//   GBP_WEBSITE_URI  — optional override for the listing's website link
//                      (defaults to the Ashburton storefront URL)
//   GBP_APPLY        — 'true' to actually PATCH the listing; otherwise dry-run
import type { Handler } from '../../_shared/seo-types.ts';
import { getGoogleAccessToken, BUSINESS_SCOPE } from '../../_shared/google-auth.ts';

const INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const REVIEWS_API = 'https://mybusiness.googleapis.com/v4';

const ASHBURTON_USER_ID = '3acef09d-8b28-46e8-a0c3-45ce59c61972';
const DEFAULT_WEBSITE = 'https://yellowjersey.store/marketplace/store/ashburton-cycles';

const DAY_MAP: Record<string, string> = {
  monday: 'MONDAY',
  tuesday: 'TUESDAY',
  wednesday: 'WEDNESDAY',
  thursday: 'THURSDAY',
  friday: 'FRIDAY',
  saturday: 'SATURDAY',
  sunday: 'SUNDAY',
};

interface DayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

interface GbpTimeOfDay {
  hours: number;
  minutes?: number;
}

interface GbpPeriod {
  openDay: string;
  openTime: GbpTimeOfDay;
  closeDay: string;
  closeTime: GbpTimeOfDay;
}

function toGbpTime(hhmm: string): GbpTimeOfDay | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return minutes ? { hours, minutes } : { hours };
}

/** Store profile opening_hours jsonb -> GBP regularHours.periods. */
function buildPeriods(opening: Record<string, DayHours> | null): GbpPeriod[] {
  if (!opening) return [];
  const periods: GbpPeriod[] = [];
  for (const [day, gbpDay] of Object.entries(DAY_MAP)) {
    const h = opening[day];
    if (!h || h.closed || !h.open || !h.close) continue;
    const openTime = toGbpTime(h.open);
    const closeTime = toGbpTime(h.close);
    if (!openTime || !closeTime) continue;
    periods.push({ openDay: gbpDay, openTime, closeDay: gbpDay, closeTime });
  }
  return periods;
}

/** Canonical string forms so diffs don't fire on key ordering. */
function periodsFingerprint(periods: unknown): string {
  const list = Array.isArray(periods) ? (periods as GbpPeriod[]) : [];
  return list
    .map((p) => `${p.openDay} ${p.openTime?.hours ?? 0}:${p.openTime?.minutes ?? 0}-${p.closeTime?.hours ?? 0}:${p.closeTime?.minutes ?? 0}`)
    .sort()
    .join('|');
}

interface ServiceRow {
  name: string;
  price: number | null;
  price_from: boolean | null;
  includes: string[] | null;
  is_active: boolean;
  display_order: number;
}

/** store_services rows -> GBP freeForm service items (category comes from the
 *  location's own primary category so the API accepts them). */
function buildServiceItems(services: ServiceRow[], categoryName: string | undefined) {
  return services.map((s) => {
    const description = (s.includes ?? []).join(', ').slice(0, 250);
    const item: Record<string, unknown> = {
      freeFormServiceItem: {
        ...(categoryName ? { category: categoryName } : {}),
        label: {
          displayName: s.name.slice(0, 140),
          ...(description ? { description } : {}),
        },
      },
    };
    if (typeof s.price === 'number' && s.price > 0 && !s.price_from) {
      item.price = { currencyCode: 'AUD', units: String(Math.trunc(s.price)) };
    }
    return item;
  });
}

function servicesFingerprint(items: unknown): string {
  const list = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  return list
    .map((i) => {
      const ff = i.freeFormServiceItem as { label?: { displayName?: string } } | undefined;
      const price = i.price as { units?: string } | undefined;
      return `${ff?.label?.displayName ?? ''}@${price?.units ?? ''}`;
    })
    .sort()
    .join('|');
}

export const businessProfileSync: Handler = async (_task, ctx) => {
  const accountId = Deno.env.get('GBP_ACCOUNT_ID');
  const locationId = Deno.env.get('GBP_LOCATION_ID');
  if (!accountId || !locationId) {
    return { skipped: 'GBP_ACCOUNT_ID/GBP_LOCATION_ID not set' };
  }
  const token = await getGoogleAccessToken([BUSINESS_SCOPE]);
  if (!token) return { skipped: 'no Google service account configured' };
  const auth = { Authorization: `Bearer ${token}` };
  const apply = Deno.env.get('GBP_APPLY') === 'true';

  const result: Record<string, unknown> = { mode: apply ? 'apply' : 'dry-run' };

  // ---- live store truth ------------------------------------------------
  const [{ data: storeUser }, { data: serviceRows }] = await Promise.all([
    ctx.db.from('users').select('opening_hours, phone').eq('user_id', ASHBURTON_USER_ID).maybeSingle(),
    ctx.db
      .from('store_services')
      .select('name, price, price_from, includes, is_active, display_order')
      .eq('user_id', ASHBURTON_USER_ID)
      .eq('is_active', true)
      .order('display_order', { ascending: true }),
  ]);

  // ---- current GBP location --------------------------------------------
  const readMask = 'name,title,websiteUri,regularHours,serviceItems,categories';
  const locRes = await fetch(`${INFO_API}/locations/${locationId}?readMask=${readMask}`, { headers: auth });
  if (!locRes.ok) {
    return {
      ...result,
      error: `GBP location read ${locRes.status}: ${(await locRes.text()).slice(0, 200)}`,
      note: 'check Business Information API enablement + that the service account manages the location',
    };
  }
  const location = await locRes.json();

  // ---- compute the diff --------------------------------------------------
  const wantWebsite = Deno.env.get('GBP_WEBSITE_URI') || DEFAULT_WEBSITE;
  const wantPeriods = buildPeriods((storeUser?.opening_hours as Record<string, DayHours>) ?? null);
  const primaryCategory = location?.categories?.primaryCategory?.name as string | undefined;
  const wantServices = buildServiceItems((serviceRows ?? []) as ServiceRow[], primaryCategory);

  const patch: Record<string, unknown> = {};
  const masks: string[] = [];
  const diff: string[] = [];

  if (wantWebsite !== location.websiteUri) {
    patch.websiteUri = wantWebsite;
    masks.push('websiteUri');
    diff.push(`websiteUri: ${location.websiteUri ?? '(unset)'} -> ${wantWebsite}`);
  }
  if (wantPeriods.length && periodsFingerprint(wantPeriods) !== periodsFingerprint(location.regularHours?.periods)) {
    patch.regularHours = { periods: wantPeriods };
    masks.push('regularHours');
    diff.push(`regularHours: ${wantPeriods.length} periods from store profile`);
  }
  if (wantServices.length && servicesFingerprint(wantServices) !== servicesFingerprint(location.serviceItems)) {
    patch.serviceItems = wantServices;
    masks.push('serviceItems');
    diff.push(`serviceItems: ${wantServices.length} services from live menu`);
  }

  result.location = location.title ?? locationId;
  result.diff = diff.length ? diff : ['in sync'];

  // ---- apply (only with explicit consent) --------------------------------
  if (masks.length && apply) {
    const patchRes = await fetch(
      `${INFO_API}/locations/${locationId}?updateMask=${masks.join(',')}`,
      {
        method: 'PATCH',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      },
    );
    if (!patchRes.ok) {
      result.patch_error = `GBP patch ${patchRes.status}: ${(await patchRes.text()).slice(0, 300)}`;
    } else {
      result.patched = masks;
    }
  } else if (masks.length) {
    result.pending = masks;
    result.note = 'dry-run — set GBP_APPLY=true to push these changes to the listing';
  }

  // ---- reviews (read-only signal for the dashboard/alerts) ---------------
  try {
    const revRes = await fetch(
      `${REVIEWS_API}/accounts/${accountId}/locations/${locationId}/reviews`,
      { headers: auth },
    );
    if (revRes.ok) {
      const data = await revRes.json();
      result.total = data?.totalReviewCount ?? 0;
      result.average = data?.averageRating ?? null;
    } else {
      result.reviews_error = `GBP reviews ${revRes.status}`;
    }
  } catch (err) {
    result.reviews_error = err instanceof Error ? err.message : String(err);
  }

  result.checked_at = new Date().toISOString();
  return result;
};
