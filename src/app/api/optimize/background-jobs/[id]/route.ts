import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("optimize_background_jobs")
      .select(
        "id, job_type, status, category_id, category_name, done, total, failed, skipped, message, error_message, created_at, updated_at, completed_at, metadata",
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({ job: data });
  } catch (error) {
    console.error("[optimize/background-jobs/[id]] GET", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action as string | undefined;

    if (action !== "cancel") {
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("optimize_background_jobs")
      .update({
        status: "cancelled",
        message: "Cancelled",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .in("status", ["queued", "running"])
      .select("id, status")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Job not found or already finished" }, { status: 404 });
    }

    return NextResponse.json({ job: data });
  } catch (error) {
    console.error("[optimize/background-jobs/[id]] PATCH", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
