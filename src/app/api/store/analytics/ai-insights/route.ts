import { NextRequest, NextResponse } from "next/server";
import { generateStoreAnalyticsAiInsights } from "@/lib/store/analytics-ai-insights";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const { data: profile, error: profileError } = await service
    .from("users")
    .select("user_id, account_type, bicycle_store, business_name, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile ||
    profile.account_type !== "bicycle_store" ||
    profile.bicycle_store !== true
  ) {
    return NextResponse.json(
      { error: "Store analytics are only available to verified bike stores" },
      { status: 403 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const days = Math.max(1, Math.min(Number(body.days || 30) || 30, 365));
  const storeName =
    typeof profile.business_name === "string" && profile.business_name.trim()
      ? profile.business_name.trim()
      : typeof profile.name === "string" && profile.name.trim()
        ? profile.name.trim()
        : "this bicycle store";

  try {
    const insights = await generateStoreAnalyticsAiInsights({
      service,
      userId: user.id,
      storeName,
      days,
    });

    return NextResponse.json(insights);
  } catch (error) {
    console.error("[store analytics AI] failed", error);
    const message =
      error instanceof Error && error.message === "OPENAI_API_KEY is not configured"
        ? "AI analytics is not configured in this environment"
        : "Failed to generate AI analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
