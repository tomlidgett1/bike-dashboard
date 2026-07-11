/**
 * GET /api/store/crm/lifecycle/stages/[stage] — members of a lifecycle
 * stage (top 100 by lifetime spend) for the stage drill-in dialog.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadStageMembers } from "@/lib/crm/lifecycle/overview";
import { isLifecycleStage } from "@/lib/crm/lifecycle/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stage: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { stage } = await params;
    if (!isLifecycleStage(stage)) {
      return NextResponse.json({ error: "Unknown lifecycle stage" }, { status: 400 });
    }

    const result = await loadStageMembers(supabase, user.id, stage);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[crm/lifecycle/stages] GET failed:", error);
    return NextResponse.json({ error: "Failed to load stage members" }, { status: 500 });
  }
}
