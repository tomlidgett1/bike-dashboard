/**
 * CRM contacts
 *
 * GET /api/store/crm/contacts?search=&filter=all|opted_in|opted_out&offset=&limit=
 * Returns a page of contacts plus overall counts for the header stats.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 50;

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
    const offset = Math.max(0, Number.parseInt(searchParams.get("offset") ?? "0", 10) || 0);
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(searchParams.get("limit") ?? String(PAGE_SIZE), 10) || PAGE_SIZE),
    );

    let query = supabase
      .from("crm_contacts")
      .select(
        "id, email, first_name, last_name, phone, lightspeed_customer_id, source, opted_out, opted_out_at, opt_out_reason, created_at, updated_at",
        { count: "exact" },
      )
      .eq("user_id", user.id);

    if (filter === "opted_in") query = query.eq("opted_out", false);
    if (filter === "opted_out") query = query.eq("opted_out", true);

    if (search) {
      // Commas/parens would break PostgREST or() syntax — strip them.
      const term = search.replace(/[,()]/g, " ").trim();
      if (term) {
        query = query.or(
          `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`,
        );
      }
    }

    const [{ data: contacts, count, error }, totals, optedOutTotal] = await Promise.all([
      query.order("created_at", { ascending: false }).range(offset, offset + limit - 1),
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
