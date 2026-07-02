/**
 * CRM contacts
 *
 * GET /api/store/crm/contacts?search=&filter=&sort=&groupId=&offset=&limit=
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CrmContactSort } from "@/lib/crm/types";

const PAGE_SIZE = 50;

const SORT_OPTIONS: Record<CrmContactSort, { column: string; ascending: boolean }> = {
  recent: { column: "created_at", ascending: false },
  name_asc: { column: "first_name", ascending: true },
  joined_newest: { column: "lightspeed_joined_at", ascending: false },
  joined_oldest: { column: "lightspeed_joined_at", ascending: true },
  spend_high: { column: "total_spend", ascending: false },
  spend_low: { column: "total_spend", ascending: true },
  visits_high: { column: "sale_count", ascending: false },
  visits_low: { column: "sale_count", ascending: true },
  last_purchase: { column: "last_purchase_at", ascending: false },
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const search = (searchParams.get("search") ?? "").trim();
    const filter = searchParams.get("filter") ?? "all";
    const sort = (searchParams.get("sort") ?? "recent") as CrmContactSort;
    const groupId = (searchParams.get("groupId") ?? "").trim();
    const offset = Math.max(0, Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(searchParams.get("limit") ?? String(PAGE_SIZE), 10) || PAGE_SIZE),
    );

    const sortConfig = SORT_OPTIONS[sort] ?? SORT_OPTIONS.recent;

    let contactIdsInGroup: string[] | null = null;
    if (groupId) {
      const { data: members } = await supabase
        .from("crm_contact_group_members")
        .select("contact_id")
        .eq("user_id", user.id)
        .eq("group_id", groupId);
      contactIdsInGroup = (members ?? []).map((row) => String(row.contact_id));
      if (contactIdsInGroup.length === 0) {
        return NextResponse.json({
          contacts: [],
          filteredCount: 0,
          stats: { total: 0, optedOut: 0, eligible: 0 },
        });
      }
    }

    let query = supabase
      .from("crm_contacts")
      .select(
        "id, email, first_name, last_name, phone, lightspeed_customer_id, source, opted_out, opted_out_at, opt_out_reason, lightspeed_joined_at, last_purchase_at, total_spend, sale_count, enriched_at, created_at, updated_at",
        { count: "exact" },
      )
      .eq("user_id", user.id);

    if (contactIdsInGroup) query = query.in("id", contactIdsInGroup);
    if (filter === "opted_in") query = query.eq("opted_out", false);
    if (filter === "opted_out") query = query.eq("opted_out", true);

    if (search) {
      const term = search.replace(/[,()]/g, " ").trim();
      if (term) {
        query = query.or(
          `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
        );
      }
    }

    const [{ data: contacts, count, error }, totals, optedOutTotal] = await Promise.all([
      query
        .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false })
        .order("email", { ascending: true })
        .range(offset, offset + limit - 1),
      supabase
        .from("crm_contacts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("crm_contacts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("opted_out", true),
    ]);

    if (error) throw error;

    const total = totals.count ?? 0;
    const optedOut = optedOutTotal.count ?? 0;

    return NextResponse.json({
      contacts: contacts ?? [],
      filteredCount: count ?? 0,
      stats: { total, optedOut, eligible: total - optedOut },
    });
  } catch (error) {
    console.error("[crm] contacts list failed:", error);
    return NextResponse.json({ error: "Failed to load contacts" }, { status: 500 });
  }
}
