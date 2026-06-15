import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { VariantDetectionScope } from "@/lib/variants/run-detection-job";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

    const { data: profile } = await supabase
      .from("users")
      .select("account_type, bicycle_store")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
      return NextResponse.json({ error: "Only verified bike stores can find variants" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const rawScope = (body.scope ?? {}) as Partial<VariantDetectionScope>;
    const scope: VariantDetectionScope = {
      categories: Array.isArray(rawScope.categories) ? rawScope.categories.filter(Boolean) : [],
      brands: Array.isArray(rawScope.brands) ? rawScope.brands.filter(Boolean) : [],
      all_products: rawScope.all_products === true,
    };

    if (!scope.all_products && scope.categories.length === 0 && scope.brands.length === 0) {
      return NextResponse.json(
        { error: "Choose at least one category or brand, or scan all products" },
        { status: 400 },
      );
    }

    const { data: run, error: insertError } = await supabase
      .from("product_variant_detection_runs")
      .insert({
        user_id: user.id,
        status: "queued",
        scope,
        phase: "preparing",
        message: "Queued…",
      })
      .select("id")
      .single();

    if (insertError || !run) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to start variant scan" },
        { status: 500 },
      );
    }

    const origin = request.nextUrl.origin;
    const cronSecret = process.env.CRON_SECRET ?? "";

    after(async () => {
      try {
        await fetch(`${origin}/api/optimize/variants/advance-detection`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-internal-secret": cronSecret },
          body: JSON.stringify({ runId: run.id }),
        });
      } catch (error) {
        console.error("[start-detection] failed to advance run", run.id, error);
      }
    });

    return NextResponse.json({ runId: run.id });
  } catch (error) {
    console.error("[start-detection]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
