import { NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchAllPostgrestPages,
  POSTGREST_PAGE_SIZE,
} from "@/lib/crm/postgrest-page";

function relationUnavailable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error
    && (
      error.code === "42P01"
      || error.code === "PGRST205"
      || error.code === "PGRST202"
      || /schema cache|does not exist/i.test(error.message ?? "")
    ),
  );
}

async function legacyInsights(supabase: SupabaseClient, userId: string) {
  const [contacts, stages, campaigns, inquiries] = await Promise.all([
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_contacts")
          .select("id, total_spend, opted_out")
          .eq("user_id", userId)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }),
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_lifecycle_states")
          .select("id, stage")
          .eq("user_id", userId)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }),
    fetchAllPostgrestPages({
      fetchPage: (from, to) =>
        supabase
          .from("crm_campaigns")
          .select("id, sent_count")
          .eq("user_id", userId)
          .eq("status", "sent")
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    }),
    supabase
      .from("store_customer_inquiries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["new", "processing", "draft_ready", "error"]),
  ]);
  const lifecycleStages: Record<string, number> = {};
  for (const row of stages) {
    const key = String(row.stage ?? "unknown");
    lifecycleStages[key] = (lifecycleStages[key] ?? 0) + 1;
  }
  const customerValue = contacts.reduce(
    (sum, row) => sum + Number(row.total_spend ?? 0),
    0,
  );
  const interactions = campaigns.reduce(
    (sum, row) => sum + Number(row.sent_count ?? 0),
    0,
  );
  return {
    periodDays: 30,
    kpis: {
      customers: contacts.length,
      customerValue,
      attributedRevenue: 0,
      openTasks: inquiries.count ?? 0,
      completedTasks: 0,
      completedWorkorders: 0,
      interactions,
    },
    lifecycleStages,
    activityByChannel: { email: interactions },
    activityByType: {},
    workordersByStatus: {},
    consentHealth: {
      withdrawn: contacts.filter((row) => row.opted_out).length,
      unknown: contacts.filter((row) => !row.opted_out).length,
    },
    performance: {},
    legacy: true,
  };
}

export async function GET() {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const { data: store, error: storeError } = await auth.supabase
      .from("stores")
      .select("id")
      .eq("owner_user_id", auth.user.id)
      .maybeSingle();
    if (storeError && relationUnavailable(storeError)) {
      return NextResponse.json(await legacyInsights(auth.supabase, auth.user.id));
    }
    if (storeError) throw storeError;
    if (!store) {
      return NextResponse.json(await legacyInsights(auth.supabase, auth.user.id));
    }

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await auth.supabase.rpc("crm_store_insights", {
      p_store_id: store.id,
      p_since: since,
    });
    if (error && relationUnavailable(error)) {
      return NextResponse.json(await legacyInsights(auth.supabase, auth.user.id));
    }
    if (error) throw error;
    return NextResponse.json(data ?? {});
  } catch (error) {
    console.error("[store/crm/insights] GET failed:", error);
    return NextResponse.json({ error: "Could not load CRM insights." }, { status: 500 });
  }
}
