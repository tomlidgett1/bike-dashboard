import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CopyBatchFields, CopyBatchJobMetadata } from "@/lib/optimize/copy-batch-job-types";
import { readSSE } from "@/lib/optimize/read-sse";

export type CopyBatchJobParams = {
  jobId: string;
  origin: string;
  cookieHeader: string;
};

type DescriptionMode = "both" | "description" | "specs" | "bicycle";

async function updateJob(jobId: string, patch: Record<string, unknown>) {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("optimize_background_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", jobId);

  if (error) {
    console.error("[copy-batch-job] update failed", jobId, error.message);
  }
}

async function loadJobMetadata(jobId: string): Promise<CopyBatchJobMetadata | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("optimize_background_jobs")
    .select("metadata")
    .eq("id", jobId)
    .maybeSingle();

  return (data?.metadata as CopyBatchJobMetadata | null) ?? null;
}

async function isJobCancelled(jobId: string): Promise<boolean> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("optimize_background_jobs")
    .select("status")
    .eq("id", jobId)
    .maybeSingle();

  return data?.status === "cancelled";
}

async function persistMetadata(jobId: string, metadata: CopyBatchJobMetadata) {
  await updateJob(jobId, { metadata });
}

async function runTitlesForProduct(
  origin: string,
  cookieHeader: string,
  productId: string,
): Promise<boolean> {
  const response = await fetch(`${origin}/api/products/generate-titles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ productIds: [productId] }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Title generation failed");
  }

  let success = true;
  await readSSE(response.body, (event) => {
    if (event.event !== "product_complete" || event.productId !== productId) return;
    success = event.success === true;
  });

  return success;
}

async function runDescriptionsForProduct(
  origin: string,
  cookieHeader: string,
  productId: string,
  mode: DescriptionMode,
  bicycleOverrides: Record<string, boolean>,
): Promise<boolean> {
  const response = await fetch(`${origin}/api/products/generate-product-descriptions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({
      productIds: [productId],
      mode,
      bicycleOverrides,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error("Copy generation failed");
  }

  let success = true;
  await readSSE(response.body, (event) => {
    if (event.event !== "product_complete" || event.productId !== productId) return;
    success = event.success === true;
  });

  return success;
}

function descriptionMode(copyFields: CopyBatchFields): DescriptionMode | null {
  if (copyFields.description && copyFields.specs) return "both";
  if (copyFields.description) return "description";
  if (copyFields.specs) return "specs";
  return null;
}

async function runProductCopy(
  origin: string,
  cookieHeader: string,
  productId: string,
  copyFields: CopyBatchFields,
  bicycleOverrides: Record<string, boolean>,
): Promise<boolean> {
  const tasks: Promise<boolean>[] = [];
  const descMode = descriptionMode(copyFields);
  const runsCopyContent = copyFields.description || copyFields.specs;

  if (copyFields.title) {
    tasks.push(runTitlesForProduct(origin, cookieHeader, productId));
  }

  if (descMode) {
    tasks.push(
      runDescriptionsForProduct(origin, cookieHeader, productId, descMode, bicycleOverrides),
    );
  }

  if (!runsCopyContent) {
    tasks.push(
      runDescriptionsForProduct(origin, cookieHeader, productId, "bicycle", bicycleOverrides),
    );
  }

  if (tasks.length === 0) return true;

  const results = await Promise.all(tasks);
  return results.every(Boolean);
}

export async function runCopyBatchJob(params: CopyBatchJobParams): Promise<void> {
  const { jobId, origin, cookieHeader } = params;

  try {
    const metadata = await loadJobMetadata(jobId);
    if (!metadata?.productIds?.length) {
      throw new Error("Copy batch job is missing product IDs");
    }

    const productIds = metadata.productIds;
    const copyFields = metadata.copyFields;
    const bicycleOverrides = metadata.bicycleOverrides ?? {};
    const completedProductIds = new Set(metadata.completedProductIds ?? []);
    const failedProductIds = new Set(metadata.failedProductIds ?? []);

    await updateJob(jobId, {
      status: "running",
      started_at: new Date().toISOString(),
      total: productIds.length,
      done: completedProductIds.size,
      failed: failedProductIds.size,
      message: "Generating copy…",
    });

    let done = completedProductIds.size;
    let failed = failedProductIds.size;

    for (const productId of productIds) {
      if (await isJobCancelled(jobId)) {
        await updateJob(jobId, {
          message: "Copy generation cancelled",
          completed_at: new Date().toISOString(),
        });
        return;
      }

      if (completedProductIds.has(productId) || failedProductIds.has(productId)) {
        continue;
      }

      await updateJob(jobId, {
        message: `Generating copy (${done + 1} of ${productIds.length})…`,
      });

      try {
        const success = await runProductCopy(
          origin,
          cookieHeader,
          productId,
          copyFields,
          bicycleOverrides,
        );

        if (success) {
          completedProductIds.add(productId);
          done += 1;
        } else {
          failedProductIds.add(productId);
          failed += 1;
        }
      } catch (error) {
        failedProductIds.add(productId);
        failed += 1;
        console.error(
          "[copy-batch-job] product failed",
          productId,
          error instanceof Error ? error.message : error,
        );
      }

      await persistMetadata(jobId, {
        ...metadata,
        completedProductIds: [...completedProductIds],
        failedProductIds: [...failedProductIds],
      });

      await updateJob(jobId, { done, failed });
    }

    await updateJob(jobId, {
      status: "completed",
      done,
      failed,
      message: "Copy generation complete",
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copy generation failed";
    console.error("[copy-batch-job]", jobId, message);
    await updateJob(jobId, {
      status: "failed",
      error_message: message,
      message,
      completed_at: new Date().toISOString(),
    });
  }
}
