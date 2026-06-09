import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runCategoryPreloadJob } from "@/lib/optimize/run-category-preload-job";

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

    const body = await request.json();
    const categoryId = body.categoryId as string | undefined;
    const categoryName = (body.categoryName as string | undefined) || "Category";
    const force = body.force === true;

    if (!categoryId || categoryId === "all") {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    const { data: job, error: insertError } = await supabase
      .from("optimize_background_jobs")
      .insert({
        user_id: user.id,
        job_type: "category_image_preload",
        status: "queued",
        category_id: categoryId,
        category_name: categoryName,
        force_reload: force,
        message: "Queued…",
      })
      .select("id")
      .single();

    if (insertError || !job) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to create preload job" },
        { status: 500 },
      );
    }

    const origin = request.nextUrl.origin;
    const cookieHeader = request.headers.get("cookie") ?? "";

    after(async () => {
      try {
        await runCategoryPreloadJob({
          jobId: job.id,
          userId: user.id,
          categoryId,
          categoryName,
          force,
          origin,
          cookieHeader,
        });
      } catch (error) {
        console.error("[preload-category-images] background job failed", job.id, error);
      }
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("[preload-category-images]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
