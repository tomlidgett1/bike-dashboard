import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runCopyBatchJob } from "@/lib/optimize/run-copy-batch-job";
import type { CopyBatchFields, CopyBatchJobMetadata } from "@/lib/optimize/copy-batch-job-types";

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
    const productIds = body.productIds as string[] | undefined;
    const copyFields = body.copyFields as CopyBatchFields | undefined;
    const bicycleOverrides = (body.bicycleOverrides as Record<string, boolean> | undefined) ?? {};
    const label = (body.label as string | undefined) || "Copy batch";

    if (!productIds?.length) {
      return NextResponse.json({ error: "productIds is required" }, { status: 400 });
    }

    if (!copyFields || (!copyFields.title && !copyFields.description && !copyFields.specs)) {
      return NextResponse.json({ error: "At least one copy field must be selected" }, {
        status: 400,
      });
    }

    const metadata: CopyBatchJobMetadata = {
      productIds,
      copyFields,
      bicycleOverrides,
      completedProductIds: [],
      failedProductIds: [],
    };

    const { data: job, error: insertError } = await supabase
      .from("optimize_background_jobs")
      .insert({
        user_id: user.id,
        job_type: "copy_batch",
        status: "queued",
        category_name: label,
        total: productIds.length,
        message: "Queued…",
        metadata,
      })
      .select("id")
      .single();

    if (insertError || !job) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to create copy batch job" },
        { status: 500 },
      );
    }

    const origin = request.nextUrl.origin;
    const cookieHeader = request.headers.get("cookie") ?? "";

    after(async () => {
      try {
        await runCopyBatchJob({
          jobId: job.id,
          origin,
          cookieHeader,
        });
      } catch (error) {
        console.error("[start-copy-batch] background job failed", job.id, error);
      }
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("[start-copy-batch]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
