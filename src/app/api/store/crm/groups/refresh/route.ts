/**
 * Refresh smart group membership against live Lightspeed/CRM data.
 *
 * POST /api/store/crm/groups/refresh
 * Body: { groupId?: string } — one smart group, or all when omitted.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshAllSmartGroups, refreshSmartGroup } from "@/lib/crm/smart-groups";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { groupId?: string };
    const results = body?.groupId
      ? [await refreshSmartGroup(supabase, user.id, String(body.groupId))]
      : await refreshAllSmartGroups(supabase, user.id);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("[crm] group refresh failed:", error);
    const message = error instanceof Error ? error.message : "Failed to refresh groups";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
