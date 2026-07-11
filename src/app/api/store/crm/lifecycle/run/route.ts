/**
 * POST /api/store/crm/lifecycle/run — force a full engine tick now
 * (classify → attribute → plan → auto-execute). Used for the first-run
 * experience and the "Run now" button.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runLifecycleTickForStore } from "@/lib/crm/lifecycle/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const summary = await runLifecycleTickForStore(supabase, user.id, { force: true });
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("[crm/lifecycle/run] failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Run failed" },
      { status: 500 },
    );
  }
}
