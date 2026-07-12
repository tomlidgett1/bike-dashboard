import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";

type InsightPayload = {
  kpis?: {
    customers?: number;
    customerValue?: number;
    attributedRevenue?: number;
    openTasks?: number;
    completedWorkorders?: number;
    interactions?: number;
  };
  consentHealth?: Record<string, number>;
  performance?: Record<string, { p95Ms?: number }>;
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;
    const body = await request.json().catch(() => null) as { query?: unknown } | null;
    const query = typeof body?.query === "string" ? body.query.trim().slice(0, 500) : "";
    if (!query) return NextResponse.json({ error: "Ask a CRM question." }, { status: 400 });

    const { data: store, error: storeError } = await auth.supabase
      .from("stores")
      .select("id")
      .eq("owner_user_id", auth.user.id)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) return NextResponse.json({ error: "CRM store is not initialised." }, { status: 409 });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [customerResult, insightResult] = await Promise.all([
      auth.supabase.rpc("crm_search_customers", {
        p_store_id: store.id,
        p_query: query,
        p_filter: "all",
        p_cursor_updated_at: null,
        p_cursor_id: null,
        p_limit: 5,
      }),
      auth.supabase.rpc("crm_store_insights", {
        p_store_id: store.id,
        p_since: since,
      }),
    ]);
    if (customerResult.error) throw customerResult.error;
    if (insightResult.error) throw insightResult.error;

    const customers = (customerResult.data ?? []) as Array<{
      id: string;
      display_name: string;
      total_spend: number | string | null;
    }>;
    const insights = (insightResult.data ?? {}) as InsightPayload;
    const lower = query.toLowerCase();
    const grounds: Array<{ label: string; href: string }> = [];
    let answer: string;

    if (customers.length > 0) {
      const matches = customers.slice(0, 3).map((customer) => {
        grounds.push({
          label: String(customer.display_name),
          href: `/settings/store/crm/customers/${customer.id}`,
        });
        const spend = Number(customer.total_spend ?? 0).toLocaleString("en-AU", {
          style: "currency",
          currency: "AUD",
          maximumFractionDigits: 0,
        });
        return `${String(customer.display_name)} (${spend} lifetime spend)`;
      });
      answer = `I found ${customers.length} matching customer${customers.length === 1 ? "" : "s"}: ${matches.join(", ")}.`;
    } else if (lower.includes("revenue") || lower.includes("value")) {
      const attributed = Number(insights.kpis?.attributedRevenue ?? 0).toLocaleString("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0,
      });
      const value = Number(insights.kpis?.customerValue ?? 0).toLocaleString("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0,
      });
      answer = `The customer base represents ${value} in recorded lifetime spend. CRM programmes have ${attributed} in attributed revenue over the last 30 days.`;
      grounds.push({ label: "CRM insights", href: "/settings/store/crm/insights" });
    } else if (lower.includes("workshop") || lower.includes("service")) {
      answer = `${Number(insights.kpis?.completedWorkorders ?? 0).toLocaleString("en-AU")} workshop jobs were completed in the last 30 days, with ${Number(insights.kpis?.openTasks ?? 0).toLocaleString("en-AU")} CRM tasks currently open.`;
      grounds.push({ label: "Workshop insights", href: "/settings/store/crm/insights" });
    } else if (lower.includes("fast") || lower.includes("speed") || lower.includes("latency")) {
      const searchP95 = insights.performance?.search?.p95Ms;
      const profileP95 = insights.performance?.customer_summary?.p95Ms;
      answer = searchP95 || profileP95
        ? `CRM search is ${searchP95 ?? "not yet measured"} ms p95 and customer summaries are ${profileP95 ?? "not yet measured"} ms p95.`
        : "There are not enough real-user performance samples yet to report CRM latency.";
      grounds.push({ label: "Performance insights", href: "/settings/store/crm/insights" });
    } else {
      answer = `There are ${Number(insights.kpis?.customers ?? 0).toLocaleString("en-AU")} customer records, ${Number(insights.kpis?.openTasks ?? 0).toLocaleString("en-AU")} open tasks and ${Number(insights.kpis?.interactions ?? 0).toLocaleString("en-AU")} recorded interactions in the last 30 days.`;
      grounds.push(
        { label: "Today queue", href: "/settings/store/crm/today" },
        { label: "CRM insights", href: "/settings/store/crm/insights" },
      );
    }

    return NextResponse.json({
      answer,
      grounding: grounds,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[store/crm/ask] POST failed:", error);
    return NextResponse.json({ error: "Yellow Jersey could not answer that CRM question." }, { status: 500 });
  }
}
