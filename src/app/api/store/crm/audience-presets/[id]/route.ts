/**
 * Delete audience preset.
 *
 * DELETE /api/store/crm/audience-presets/[id]
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      .from("crm_audience_presets")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[crm] audience preset delete failed:", error);
    return NextResponse.json({ error: "Failed to delete preset" }, { status: 500 });
  }
}
