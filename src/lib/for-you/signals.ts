import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type {
  BehaviouralSignals,
  ForYouIdentity,
  PriceBand,
  RecentProductSignal,
  WeightedValue,
} from "./types";

// ============================================================
// Behavioural signal collection
// ============================================================
// One RPC round trip for decayed interaction aggregates, plus three cheap
// lookups (dismissals, follows, onboarding prefs) in parallel. The RPC is
// SECURITY DEFINER and service-role only.

const EMPTY_SIGNALS: BehaviouralSignals = {
  recentProducts: [],
  categories: [],
  subcategories: [],
  brands: [],
  stores: [],
  priceBand: { p25: null, p50: null, p75: null, n: 0 },
  searches: [],
  ignoredProductIds: [],
  dismissedProductIds: [],
  hiddenCarouselKeys: [],
  followedStoreIds: [],
  onboarding: null,
  totals: { events: 0, products: 0 },
};

function asWeighted(raw: unknown): WeightedValue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is { value: string; weight: number } =>
        !!item && typeof item === "object" && typeof (item as any).value === "string",
    )
    .map((item) => ({ value: item.value, weight: Number((item as any).weight) || 0 }));
}

export async function collectSignals(identity: ForYouIdentity): Promise<BehaviouralSignals> {
  if (!identity.userId && !identity.anonymousId) return { ...EMPTY_SIGNALS };

  const supabase = createServiceRoleClient();

  const [signalsResult, dismissalsResult, followsResult, onboardingResult] = await Promise.all([
    supabase.rpc("get_for_you_signals", {
      p_user_id: identity.userId,
      p_anonymous_id: identity.anonymousId,
      p_session_id: identity.sessionId ?? null,
    }),
    fetchDismissals(supabase, identity),
    identity.userId
      ? supabase
          .from("user_follows")
          .select("following_id")
          .eq("follower_id", identity.userId)
          .limit(20)
      : Promise.resolve({ data: null, error: null } as const),
    identity.userId
      ? supabase
          .from("users")
          .select("preferences")
          .eq("user_id", identity.userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
  ]);

  if (signalsResult.error) {
    console.error("[for-you] get_for_you_signals failed:", signalsResult.error.message);
  }

  const raw = (signalsResult.data || {}) as Record<string, unknown>;
  const priceBandRaw = (raw.price_band || {}) as Record<string, unknown>;
  const priceBand: PriceBand = {
    p25: priceBandRaw.p25 != null ? Number(priceBandRaw.p25) : null,
    p50: priceBandRaw.p50 != null ? Number(priceBandRaw.p50) : null,
    p75: priceBandRaw.p75 != null ? Number(priceBandRaw.p75) : null,
    n: Number(priceBandRaw.n) || 0,
  };

  const totalsRaw = (raw.totals || {}) as Record<string, unknown>;

  return {
    recentProducts: Array.isArray(raw.recent_products)
      ? (raw.recent_products as RecentProductSignal[]).map((p) => ({
          ...p,
          price: p.price != null ? Number(p.price) : null,
        }))
      : [],
    categories: asWeighted(raw.categories),
    subcategories: asWeighted(raw.subcategories) as BehaviouralSignals["subcategories"],
    brands: asWeighted(raw.brands),
    stores: asWeighted(raw.stores),
    priceBand,
    searches: Array.isArray(raw.searches)
      ? (raw.searches as unknown[]).filter((s): s is string => typeof s === "string").slice(0, 10)
      : [],
    ignoredProductIds: Array.isArray(raw.ignored_product_ids)
      ? (raw.ignored_product_ids as string[])
      : [],
    dismissedProductIds: dismissalsResult.productIds,
    hiddenCarouselKeys: dismissalsResult.carouselKeys,
    followedStoreIds: (followsResult.data || []).map((f: { following_id: string }) => f.following_id),
    onboarding:
      onboardingResult.data?.preferences &&
      typeof onboardingResult.data.preferences === "object"
        ? (onboardingResult.data.preferences as BehaviouralSignals["onboarding"])
        : null,
    totals: {
      events: Number(totalsRaw.events) || 0,
      products: Number(totalsRaw.products) || 0,
    },
  };
}

async function fetchDismissals(
  supabase: SupabaseClient,
  identity: ForYouIdentity,
): Promise<{ productIds: string[]; carouselKeys: string[] }> {
  const since = new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
  let query = supabase
    .from("recommendation_dismissals")
    .select("product_id, carousel_key")
    .gte("created_at", since)
    .limit(300);

  if (identity.userId && identity.anonymousId) {
    query = query.or(`user_id.eq.${identity.userId},anonymous_id.eq.${identity.anonymousId}`);
  } else if (identity.userId) {
    query = query.eq("user_id", identity.userId);
  } else if (identity.anonymousId) {
    query = query.eq("anonymous_id", identity.anonymousId);
  } else {
    return { productIds: [], carouselKeys: [] };
  }

  const { data, error } = await query;
  if (error) {
    console.error("[for-you] dismissals lookup failed:", error.message);
    return { productIds: [], carouselKeys: [] };
  }

  const productIds = new Set<string>();
  const carouselKeys = new Set<string>();
  for (const row of data || []) {
    if (row.product_id) productIds.add(row.product_id);
    if (row.carousel_key) carouselKeys.add(row.carousel_key);
  }
  return { productIds: [...productIds], carouselKeys: [...carouselKeys] };
}

/**
 * Persist a derived preference snapshot. Fire-and-forget from the feed
 * builder — never blocks rendering.
 */
export async function persistPreferenceProfile(
  identity: ForYouIdentity,
  signals: BehaviouralSignals,
): Promise<void> {
  if (!identity.userId && !identity.anonymousId) return;
  if (signals.totals.events === 0) return;

  try {
    const supabase = createServiceRoleClient();
    const profile = {
      categories: signals.categories,
      subcategories: signals.subcategories,
      brands: signals.brands,
      stores: signals.stores,
      price_band: signals.priceBand,
      searches: signals.searches,
      // Confidence grows with evidence; capped at 1.
      confidence: Math.min(1, signals.totals.events / 50),
    };

    const row = {
      profile,
      signal_counts: signals.totals,
      last_event_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (identity.userId) {
      await supabase
        .from("preference_profiles")
        .upsert({ ...row, user_id: identity.userId }, { onConflict: "user_id" });
    } else if (identity.anonymousId) {
      await supabase
        .from("preference_profiles")
        .upsert({ ...row, anonymous_id: identity.anonymousId }, { onConflict: "anonymous_id" });
    }
  } catch (error) {
    console.error("[for-you] failed to persist preference profile:", error);
  }
}
