/**
 * Update or delete scheduled campaign.
 *
 * PATCH  /api/store/crm/schedules/[id]
 * DELETE /api/store/crm/schedules/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
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

    const body = (await request.json()) as { enabled?: boolean };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

    const { data, error } = await supabase
      .from("crm_scheduled_campaigns")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, enabled")
      .single();
    if (error) throw error;

    return NextResponse.json({ schedule: data });
  } catch (error) {
    console.error("[crm] schedule update failed:", error);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
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

    const { error } = await supabase
      .from("crm_scheduled_campaigns")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[crm] schedule delete failed:", error);
    return NextResponse.json({ error: "Failed to delete schedule" }, { status: 500 });
  }
}
