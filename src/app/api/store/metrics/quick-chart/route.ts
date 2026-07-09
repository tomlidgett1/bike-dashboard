import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runGovernedQuickChart } from "@/lib/metrics/run-governed-quick-chart";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("account_type, bicycle_store")
      .eq("user_id", user.id)
      .single();

    if (!profile?.bicycle_store || profile.account_type !== "bicycle_store") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await runGovernedQuickChart({
      userId: user.id,
      prompt,
      segmentQueryOverride:
        typeof body?.segment_query === "string" ? body.segment_query : undefined,
    });
    if (result.status === "fallback") {
      return NextResponse.json(
        { error: result.reason, sql: result.sql },
        { status: result.sql ? 500 : 422 },
      );
    }
    return NextResponse.json(result.response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
