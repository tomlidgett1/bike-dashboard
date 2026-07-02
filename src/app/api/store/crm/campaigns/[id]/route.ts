/**
 * CRM campaign detail
 *
 * GET    /api/store/crm/campaigns/[id] — campaign + per-recipient send history
 * DELETE /api/store/crm/campaigns/[id] — remove a draft (sent history is kept)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    const [{ data: campaign, error }, { data: recipients, error: recipientsError }] =
      await Promise.all([
        supabase
          .from("crm_campaigns")
          .select(
            "id, subject, template_key, content, sender_email, status, intended_count, sent_count, failed_count, delivered_count, opened_count, clicked_count, bounced_count, created_at, sent_at",
          )
          .eq("user_id", user.id)
          .eq("id", id)
          .single(),
        supabase
          .from("crm_campaign_recipients")
          .select(
            "email, status, error, sent_at, delivered_at, opened_at, clicked_at, bounced_at",
          )
          .eq("user_id", user.id)
          .eq("campaign_id", id)
          .order("email")
          .limit(2000),
      ]);

    if (error || !campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (recipientsError) throw recipientsError;

    return NextResponse.json({ campaign, recipients: recipients ?? [] });
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

    const { data: deleted, error } = await supabase
      .from("crm_campaigns")
      .delete()
      .eq("user_id", user.id)
      .eq("id", id)
      .eq("status", "draft")
      .select("id");
    if (error) throw error;

    if (!deleted || deleted.length === 0) {
      return NextResponse.json(
        { error: "Only draft campaigns can be deleted" },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[crm] campaign delete failed:", error);
    return NextResponse.json({ error: "Failed to delete campaign" }, { status: 500 });
  }
}
