/**
 * CRM campaign detail
 *
 * GET    /api/store/crm/campaigns/[id] — campaign + per-recipient send history
 * DELETE /api/store/crm/campaigns/[id] — remove a campaign (recipients cascade)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchAllPostgrestPages, POSTGREST_PAGE_SIZE } from "@/lib/crm/postgrest-page";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: campaign, error } = await supabase
      .from("crm_campaigns")
      .select(
        "id, subject, template_key, content, sender_email, status, intended_count, sent_count, failed_count, delivered_count, opened_count, clicked_count, bounced_count, created_at, sent_at",
      )
      .eq("user_id", user.id)
      .eq("id", id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    // Must page — PostgREST max_rows is 1000; .limit(2000) was silently capped.
    const recipients = await fetchAllPostgrestPages({
      fetchPage: async (from, to) =>
        supabase
          .from("crm_campaign_recipients")
          .select(
            "email, status, error, sent_at, delivered_at, opened_at, clicked_at, bounced_at",
          )
          .eq("user_id", user.id)
          .eq("campaign_id", id)
          .order("id", { ascending: true })
          .range(from, to),
      pageSize: POSTGREST_PAGE_SIZE,
    });

    return NextResponse.json({ campaign, recipients });
  } catch (error) {
    console.error("[crm] campaign detail failed:", error);
    return NextResponse.json({ error: "Failed to load campaign" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const { id } = await params;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data: existing, error: lookupError } = await supabase
      .from("crm_campaigns")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existing.status === "sending") {
      return NextResponse.json(
        { error: "This campaign is still sending. Try again when it finishes." },
        { status: 409 },
      );
    }

    const { data: deleted, error } = await supabase
      .from("crm_campaigns")
      .delete()
      .eq("user_id", user.id)
      .eq("id", id)
      .select("id");
    if (error) throw error;

    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[crm] campaign delete failed:", error);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
