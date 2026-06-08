import { NextRequest, NextResponse } from "next/server";
import { getLightspeedOverviewData } from "@/lib/lightspeed/not-synced-products";
import { getWebTrackingAnalytics } from "@/lib/store/web-tracking-analytics";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

async function getInventoryStats(service: ReturnType<typeof createServiceRoleClient>, userId: string) {
  const [liveRes, individualRes, totalRes] = await Promise.all([
    service
      .from("marketplace_ready_products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    service
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("listing_type", "private_listing"),
    service
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  if (liveRes.error) throw liveRes.error;
  if (individualRes.error) throw individualRes.error;
  if (totalRes.error) throw totalRes.error;

  const marketplaceLive = liveRes.count ?? 0;
  const totalProducts = totalRes.count ?? 0;

  return {
    marketplaceLive,
    individualListings: individualRes.count ?? 0,
    totalProducts,
    notYetLive: Math.max(0, totalProducts - marketplaceLive),
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: profile, error: profileError } = await service
    .from("users")
    .select("user_id, account_type, bicycle_store, business_name, first_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.account_type !== "bicycle_store" || profile.bicycle_store !== true) {
    return NextResponse.json({ error: "Store overview is only available to verified bike stores" }, { status: 403 });
  }

  const chartDays = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("chartDays") || 30) || 30, 365));
  const topDays = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("topDays") || 7) || 7, 365));

  try {
    const [inventory, lightspeed, webAnalytics, chartAnalytics, topAnalytics] = await Promise.all([
      getInventoryStats(service, user.id),
      getLightspeedOverviewData(service, user.id),
      getWebTrackingAnalytics(service, user.id),
      service.rpc("get_store_analytics_summary", {
        p_store_owner_id: user.id,
        p_days: chartDays,
      }),
      service.rpc("get_store_analytics_summary", {
        p_store_owner_id: user.id,
        p_days: topDays,
      }),
    ]);

    if (chartAnalytics.error) throw chartAnalytics.error;
    if (topAnalytics.error) throw topAnalytics.error;

    const displayName =
      profile.business_name?.trim() ||
      profile.first_name?.trim() ||
      "your store";

    return NextResponse.json({
      storeOwnerId: user.id,
      displayName,
      chartDays,
      topDays,
      inventory,
      lightspeed,
      webAnalytics,
      analytics: chartAnalytics.data,
      topProductsWeek: (topAnalytics.data as { topProducts?: unknown[] })?.topProducts ?? [],
    });
  } catch (error) {
    console.error("[store overview] failed", error);
    return NextResponse.json({ error: "Failed to load store overview" }, { status: 500 });
  }
}
