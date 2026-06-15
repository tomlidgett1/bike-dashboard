import { createServiceRoleClient } from "@/lib/supabase/server";
import type { CopyBatchFields, CopyBatchJobMetadata } from "@/lib/optimize/copy-batch-job-types";
import { readSSE } from "@/lib/optimize/read-sse";

export type CopyBatchJobParams = {
  jobId: string;
  origin: string;
  userId: string;
  internalSecret: string;
  maxProducts?: number;
};

const PRODUCT_TIMEOUT_MS = 90_000;

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

function internalHeaders(internalSecret: string, userId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-internal-secret": internalSecret,
    "x-internal-user-id": userId,
  };
}

async function runTitlesForProduct(
  origin: string,
  internalSecret: string,
  userId: string,
  productId: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRODUCT_TIMEOUT_MS);

  try {
    const response = await fetch(`${origin}/api/products/generate-titles`, {
      method: "POST",
      headers: internalHeaders(internalSecret, userId),
      body: JSON.stringify({ productIds: [productId] }),
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }
}

type DescriptionMode = "both" | "description" | "specs" | "bicycle";

async function runDescriptionsForProduct(
  origin: string,
  internalSecret: string,
  userId: string,
  productId: string,
  mode: DescriptionMode,
  bicycleOverrides: Record<string, boolean>,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRODUCT_TIMEOUT_MS);

  try {
    const response = await fetch(`${origin}/api/products/generate-product-descriptions`, {
      method: "POST",
      headers: internalHeaders(internalSecret, userId),
      body: JSON.stringify({ productIds: [productId], mode, bicycleOverrides }),
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }
}

function descriptionMode(copyFields: CopyBatchFields): DescriptionMode | null {
  if (copyFields.description && copyFields.specs) return "both";
  if (copyFields.description) return "description";
  if (copyFields.specs) return "specs";
  return null;
}

async function runProductCopy(
  origin: string,
  internalSecret: string,
  userId: string,
  productId: string,
  copyFields: CopyBatchFields,
  bicycleOverrides: Record<string, boolean>,
): Promise<boolean> {
  const descMode = descriptionMode(copyFields);
  const runsCopyContent = copyFields.description || copyFields.specs;
  let success = true;

  // Title cleaning must complete first — description/specs are derived from the cleaned title.
  if (copyFields.title) {
    success = (await runTitlesForProduct(origin, internalSecret, userId, productId)) && success;
  }

  if (descMode) {
    success =
      (await runDescriptionsForProduct(
        origin,
        internalSecret,
        userId,
        productId,
        descMode,
        bicycleOverrides,
      )) && success;
  }

  if (!runsCopyContent) {
    success =
      (await runDescriptionsForProduct(
        origin,
        internalSecret,
        userId,
        productId,
        "bicycle",
        bicycleOverrides,
      )) && success;
  }

  if (!copyFields.title && !descMode && !runsCopyContent) return true;

  return success;
}

/**
 * Returns true when the job is fully complete (or cancelled/failed).
 * Returns false when maxProducts was reached and more products remain.
 */
export async function runCopyBatchJob(params: CopyBatchJobParams): Promise<boolean> {
  const { jobId, origin, userId, internalSecret, maxProducts } = params;

  try {
    const metadata = await loadJobMetadata(jobId);
    if (!metadata?.productIds?.length) {
      throw new Error("Copy batch job is missing product IDs");
    }

    const { productIds, copyFields, bicycleOverrides = {} } = metadata;
    const completedProductIds = new Set(metadata.completedProductIds ?? []);
    const failedProductIds = new Set(metadata.failedProductIds ?? []);

    const pending = productIds.filter(
      (id) => !completedProductIds.has(id) && !failedProductIds.has(id),
    );

    if (pending.length === 0) {
      await updateJob(jobId, {
        status: "completed",
        done: completedProductIds.size,
        failed: failedProductIds.size,
        message: "Copy generation complete",
        completed_at: new Date().toISOString(),
      });
      return true;
    }

    await updateJob(jobId, {
      status: "running",
      total: productIds.length,
      done: completedProductIds.size,
      failed: failedProductIds.size,
      message: "Generating copy…",
    });

    let done = completedProductIds.size;
    let failed = failedProductIds.size;
    let processed = 0;

    for (const productId of pending) {
      if (maxProducts !== undefined && processed >= maxProducts) {
        await persistMetadata(jobId, {
          ...metadata,
          completedProductIds: [...completedProductIds],
          failedProductIds: [...failedProductIds],
        });
        await updateJob(jobId, { done, failed });
        return false;
      }

      if (await isJobCancelled(jobId)) {
        await updateJob(jobId, {
          message: "Copy generation cancelled",
          completed_at: new Date().toISOString(),
        });
        return true;
      }

      await updateJob(jobId, {
        message: `Generating copy (${done + 1} of ${productIds.length})…`,
      });

      try {
        const success = await runProductCopy(
          origin,
          internalSecret,
          userId,
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

      processed += 1;

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
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Copy generation failed";
    console.error("[copy-batch-job]", jobId, message);
    await updateJob(jobId, {
      status: "failed",
      error_message: message,
      message,
      completed_at: new Date().toISOString(),
    });
    return true;
  }
}
