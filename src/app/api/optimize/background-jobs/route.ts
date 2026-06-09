import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export type OptimizeBackgroundJobRow = {
  id: string;
  job_type: string;
  status: string;
  category_id: string | null;
  category_name: string | null;
  done: number;
  total: number;
  failed: number;
  skipped: number;
  message: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
};

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const activeOnly = request.nextUrl.searchParams.get("active") !== "false";

    let query = supabase
      .from("optimize_background_jobs")
      .select(
        "id, job_type, status, category_id, category_name, done, total, failed, skipped, message, error_message, created_at, updated_at, completed_at, metadata",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (activeOnly) {
      query = query.in("status", ["queued", "running"]);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ jobs: (data || []) as OptimizeBackgroundJobRow[] });
  } catch (error) {
    console.error("[optimize/background-jobs]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
