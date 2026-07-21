import { NextRequest, NextResponse } from "next/server";
import { isNestMessagingConfigured } from "@/lib/nest/config";
import { resolveStoreNestBrandKey } from "@/lib/nest/resolve-store-brand-key";
import {
  generateStorefrontProactiveNudge,
  type StorefrontBrowseContextPayload,
} from "@/lib/nest/storefront-proactive-agent";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normaliseProduct(item: unknown) {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const name = typeof row.name === "string" ? row.name.trim().slice(0, 120) : "";
  if (!name) return null;
  return {
    name,
    brand: typeof row.brand === "string" ? row.brand.trim().slice(0, 80) : null,
    category:
      typeof row.category === "string" ? row.category.trim().slice(0, 80) : null,
    price: typeof row.price === "number" ? row.price : null,
    dwellSeconds:
      typeof row.dwellSeconds === "number"
        ? Math.max(0, Math.min(row.dwellSeconds, 600))
        : undefined,
  };
}

function normaliseBrowseContext(value: unknown): StorefrontBrowseContextPayload {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const products = Array.isArray(raw.products)
    ? raw.products
        .slice(0, 8)
        .map(normaliseProduct)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  const currentlyVisible = Array.isArray(raw.currentlyVisible)
    ? raw.currentlyVisible
        .slice(0, 6)
        .map(normaliseProduct)
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];
  const focusProduct = normaliseProduct(raw.focusProduct);

  const stringList = (key: string, max: number) =>
    Array.isArray(raw[key])
      ? raw[key]
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().slice(0, 80))
          .filter(Boolean)
          .slice(0, max)
      : [];

  const priceBandRaw =
    raw.priceBand && typeof raw.priceBand === "object"
      ? (raw.priceBand as Record<string, unknown>)
      : null;

  return {
    scrollEngagementSeconds:
      typeof raw.scrollEngagementSeconds === "number"
        ? Math.max(0, Math.min(raw.scrollEngagementSeconds, 600))
        : undefined,
    maxScrollDepthPct:
      typeof raw.maxScrollDepthPct === "number"
        ? Math.max(0, Math.min(raw.maxScrollDepthPct, 100))
        : undefined,
    focusProduct,
    currentlyVisible,
    products,
    brands: stringList("brands", 6),
    categories: stringList("categories", 6),
    searches: stringList("searches", 6),
    tabs: stringList("tabs", 4),
    activeCategory:
      typeof raw.activeCategory === "string"
        ? raw.activeCategory.trim().slice(0, 80)
        : null,
    activeTab:
      typeof raw.activeTab === "string" ? raw.activeTab.trim().slice(0, 40) : null,
    priceBand:
      priceBandRaw &&
      typeof priceBandRaw.min === "number" &&
      typeof priceBandRaw.max === "number"
        ? { min: priceBandRaw.min, max: priceBandRaw.max }
        : null,
    path: typeof raw.path === "string" ? raw.path.trim().slice(0, 200) : null,
    interestSummary:
      typeof raw.interestSummary === "string"
        ? raw.interestSummary.trim().slice(0, 500)
        : undefined,
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ storeId: string }> },
) {
  try {
    if (!isNestMessagingConfigured()) {
      return json({ error: "Messaging is not available right now." }, 503);
    }

    const { storeId } = await context.params;
    if (!storeId || !UUID_RE.test(storeId)) {
      return json({ error: "Invalid store." }, 400);
    }

    const supabase = createServiceRoleClient();
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("user_id, business_name, nest_brand_key, bicycle_store, account_type")
      .eq("user_id", storeId)
      .maybeSingle();

    if (profileError) {
      console.error("[marketplace/store/nest-proactive] profile load failed:", profileError);
      return json({ error: "Could not load this store." }, 500);
    }

    if (
      !profile ||
      profile.account_type !== "bicycle_store" ||
      profile.bicycle_store !== true
    ) {
      return json({ error: "Store not found." }, 404);
    }

    const brandKey = resolveStoreNestBrandKey(profile);
    if (!brandKey) {
      return json({ error: "This store is not linked to messaging yet." }, 400);
    }

    let body: { browseContext?: unknown };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return json({ error: "Invalid request." }, 400);
    }

    const browse = normaliseBrowseContext(body.browseContext);
    const hasSignal =
      Boolean(browse.focusProduct?.name) ||
      (browse.currentlyVisible?.length ?? 0) > 0 ||
      (browse.products?.length ?? 0) > 0 ||
      (browse.brands?.length ?? 0) > 0 ||
      (browse.categories?.length ?? 0) > 0 ||
      (browse.searches?.length ?? 0) > 0 ||
      Boolean(browse.activeCategory) ||
      (browse.maxScrollDepthPct ?? 0) >= 12;

    if (!hasSignal) {
      return json({ error: "Not enough browse context yet." }, 400);
    }

    const nudge = await generateStorefrontProactiveNudge({
      brandKey,
      storeName: profile.business_name?.trim() || "Store",
      browse,
    });

    return json({
      question: nudge.question,
      assistantLabel: nudge.assistantLabel,
      storeName: nudge.storeName,
      brandKey,
    });
  } catch (error) {
    console.error("[marketplace/store/nest-proactive] failed:", error);
    return json(
      {
        error:
          error instanceof Error ? error.message : "Could not generate a shopping question.",
      },
      500,
    );
  }
}
