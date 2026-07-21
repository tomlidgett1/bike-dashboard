import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CopyBatchFields, CopyBatchJobMetadata } from "@/lib/optimize/copy-batch-job-types";
import { fetchCategoryProductsNeedingCopy } from "@/lib/optimize/fetch-category-copy-products";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_COPY_FIELDS: CopyBatchFields = {
  title: true,
  description: true,
  specs: true,
  subDescription: true,
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

    const body = await request.json();
    const categoryId = body.categoryId as string | undefined;
    const categoryName = (body.categoryName as string | undefined) || "Category";

    if (!categoryId || categoryId === "all") {
      return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
    }

    const productIds = await fetchCategoryProductsNeedingCopy(user.id, categoryId);
    if (productIds.length === 0) {
      return NextResponse.json({ error: "No products in this category need copy" }, { status: 400 });
    }

    const metadata: CopyBatchJobMetadata = {
      productIds,
      copyFields: DEFAULT_COPY_FIELDS,
      bicycleOverrides: {},
      completedProductIds: [],
      failedProductIds: [],
    };

    const label = `Copy · ${categoryName}`;

    const { data: job, error: insertError } = await supabase
      .from("optimize_background_jobs")
      .insert({
        user_id: user.id,
        job_type: "copy_batch",
        status: "queued",
        category_id: categoryId,
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
    const cronSecret = process.env.CRON_SECRET ?? "";

    after(async () => {
      try {
        await fetch(`${origin}/api/optimize/advance-copy-batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-internal-secret": cronSecret,
          },
          body: JSON.stringify({ jobId: job.id }),
        });
      } catch (error) {
        console.error("[start-category-copy] failed to advance job", job.id, error);
      }
    });

    return NextResponse.json({ jobId: job.id, total: productIds.length });
  } catch (error) {
    console.error("[start-category-copy]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
