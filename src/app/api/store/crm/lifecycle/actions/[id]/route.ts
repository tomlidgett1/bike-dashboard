/**
 * POST /api/store/crm/lifecycle/actions/[id] — approve (optionally with
 * copy edits) or skip a pending lifecycle action.
 * Body: { decision: "approve" | "skip", edit?: { subject?, title?, body?, ctaText?, templateKey?, content?, templateLabel? } }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  executeLifecycleAction,
  skipLifecycleAction,
  type LifecycleActionEdit,
} from "@/lib/crm/lifecycle/execute";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      decision?: string;
      edit?: LifecycleActionEdit;
    };

    if (body.decision === "skip") {
      await skipLifecycleAction(supabase, user.id, id);
      return NextResponse.json({ skipped: true });
    }
    if (body.decision === "approve") {
      const result = await executeLifecycleAction(supabase, user.id, id, body.edit);
      return NextResponse.json({ result });
    }
    return NextResponse.json({ error: "decision must be 'approve' or 'skip'" }, { status: 400 });
  } catch (error) {
    console.error("[crm/lifecycle/actions] POST failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 },
    );
  }
}
