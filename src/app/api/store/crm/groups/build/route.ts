/**
 * Build a smart customer group from a natural-language cohort prompt.
 *
 * POST /api/store/crm/groups/build
 * Body:
 *   { prompt: string }                         → preview (exact count, rules, sample)
 *   { action: "create", preview: { ... } }     → persist smart group + members
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createCohortFromPreview,
  previewCohortFromPrompt,
  type CohortBuildPreview,
} from "@/lib/crm/build-cohort";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type BuildBody = {
  prompt?: string;
  action?: "preview" | "create";
  preview?: Pick<CohortBuildPreview, "name" | "description" | "reason" | "rules">;
};

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

    const body = (await request.json().catch(() => null)) as BuildBody | null;
    if (!body) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (body.action === "create") {
      if (!body.preview) {
        return NextResponse.json({ error: "Preview payload required to create" }, { status: 400 });
      }
      const result = await createCohortFromPreview(supabase, user.id, body.preview);
      if (result.status === "error") {
        const status = result.code === "zero" ? 422 : 400;
        return NextResponse.json({ error: result.error, code: result.code }, { status });
      }
      return NextResponse.json(result);
    }

    const { data: storeRow } = await supabase
      .from("users")
      .select("business_name, name")
      .eq("user_id", user.id)
      .maybeSingle();
    const storeName = storeRow?.business_name || storeRow?.name || "Your Bike Store";

    const result = await previewCohortFromPrompt(
      supabase,
      user.id,
      String(body.prompt ?? ""),
      storeName,
    );

    if (result.status === "error") {
      const status =
        result.code === "empty"
          ? 400
          : result.code === "zero" || result.code === "duplicate" || result.code === "invalid"
            ? 422
            : 400;
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[crm] cohort build failed:", error);
    return NextResponse.json({ error: "Failed to build cohort" }, { status: 500 });
  }
}
