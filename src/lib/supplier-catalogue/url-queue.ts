import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScrapeUrlStatus =
  | "pending"
  | "scraping"
  | "done"
  | "failed"
  | "skipped";

export interface QueuedScrapeUrl {
  id: number;
  url: string;
  categoryUrl: string;
  attemptCount: number;
  maxAttempts: number;
}

const INSERT_BATCH = 500;
const DEFAULT_MAX_ATTEMPTS = 8;

export interface ScrapeUrlCounts {
  discovered: number;
  pending: number;
  scraping: number;
  ingested: number;
  failed: number;
  skipped: number;
  unresolved: number;
}

export async function enqueueScrapeUrls(input: {
  admin: SupabaseClient;
  runId: string;
  catalogueId: string;
  entries: Array<{
    url: string;
    categoryUrl: string;
    discoveredVia?: string[];
    evidence?: Record<string, unknown>;
  }>;
}): Promise<number> {
  if (input.entries.length === 0) return 0;

  let inserted = 0;
  for (let start = 0; start < input.entries.length; start += INSERT_BATCH) {
    const batch = input.entries.slice(start, start + INSERT_BATCH).map((entry) => ({
      run_id: input.runId,
      catalogue_id: input.catalogueId,
      url: entry.url,
      category_url: entry.categoryUrl,
      status: "pending" as const,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      discovered_via: entry.discoveredVia ?? ["page"],
      evidence: entry.evidence ?? {},
    }));

    const { error, count } = await input.admin
      .from("supplier_catalogue_scrape_urls")
      .upsert(batch, {
        onConflict: "run_id,url",
        ignoreDuplicates: true,
        count: "exact",
      });

    if (error) {
      throw new Error(error.message || "Failed to enqueue scrape URLs");
    }
    inserted += count ?? batch.length;
  }

  return inserted;
}

export async function countScrapeUrls(
  admin: SupabaseClient,
  runId: string,
  status?: ScrapeUrlStatus,
): Promise<number> {
  let query = admin
    .from("supplier_catalogue_scrape_urls")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId);

  if (status) {
    query = query.eq("status", status);
  }

  const { count, error } = await query;
  if (error) {
    throw new Error(error.message || "Failed to count scrape URLs");
  }
  return count ?? 0;
}

/**
 * Claim a batch of pending URLs for scraping.
 * Safe enough for single-chain advance + stale cron resume.
 */
export async function claimScrapeUrls(input: {
  admin: SupabaseClient;
  runId: string;
  limit: number;
}): Promise<QueuedScrapeUrl[]> {
  const { data: pending, error } = await input.admin
    .from("supplier_catalogue_scrape_urls")
    .select("id, url, category_url, attempt_count, max_attempts")
    .eq("run_id", input.runId)
    .eq("status", "pending")
    .order("id", { ascending: true })
    .limit(input.limit);

  if (error) {
    throw new Error(error.message || "Failed to load pending scrape URLs");
  }
  if (!pending?.length) return [];

  const claimed: QueuedScrapeUrl[] = [];
  const now = new Date().toISOString();

  // Group by next attempt count so each update remains set-based.
  const groups = new Map<number, typeof pending>();
  for (const row of pending) {
    const nextAttempt = Number(row.attempt_count ?? 0) + 1;
    const group = groups.get(nextAttempt) ?? [];
    group.push(row);
    groups.set(nextAttempt, group);
  }

  for (const [attemptCount, rows] of groups) {
    const ids = rows.map((row) => row.id as number);
    const { data, error: claimError } = await input.admin
      .from("supplier_catalogue_scrape_urls")
      .update({
        status: "scraping",
        attempt_count: attemptCount,
        last_attempt_at: now,
        next_retry_at: null,
        updated_at: now,
      })
      .in("id", ids)
      .eq("status", "pending")
      .select("id, url, category_url, attempt_count, max_attempts");

    if (claimError) {
      throw new Error(claimError.message || "Failed to claim scrape URLs");
    }

    for (const row of data ?? []) {
      claimed.push({
        id: row.id as number,
        url: row.url as string,
        categoryUrl: (row.category_url as string) || "",
        attemptCount: Number(row.attempt_count ?? attemptCount),
        maxAttempts: Number(row.max_attempts ?? DEFAULT_MAX_ATTEMPTS),
      });
    }
  }

  return claimed;
}

export async function markScrapeUrlsDone(
  admin: SupabaseClient,
  completions: Array<{ id: number; productId: string | null }>,
): Promise<void> {
  if (completions.length === 0) return;
  const now = new Date().toISOString();
  for (const completion of completions) {
    const { error } = await admin
      .from("supplier_catalogue_scrape_urls")
      .update({
        status: "done",
        product_id: completion.productId,
        completed_at: now,
        updated_at: now,
        error_message: null,
        next_retry_at: null,
      })
      .eq("id", completion.id);

    if (error) {
      throw new Error(error.message || "Failed to mark scrape URL done");
    }
  }
}

/** Mark a queued URL done by run + URL (used by stream-as-you-discover ingest). */
export async function markScrapeUrlDoneByUrl(
  admin: SupabaseClient,
  runId: string,
  url: string,
  productId: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("supplier_catalogue_scrape_urls")
    .update({
      status: "done",
      product_id: productId,
      completed_at: now,
      updated_at: now,
      error_message: null,
      next_retry_at: null,
    })
    .eq("run_id", runId)
    .eq("url", url);

  if (error) {
    throw new Error(error.message || "Failed to mark scrape URL done by URL");
  }
}

export async function recordScrapeUrlFailures(input: {
  admin: SupabaseClient;
  failures: Array<{
    id: number;
    error: string;
    attemptCount: number;
    maxAttempts: number;
  }>;
}): Promise<{ retrying: number; terminal: number }> {
  let retrying = 0;
  let terminal = 0;
  const now = new Date().toISOString();

  for (const failure of input.failures) {
    const isTerminal = failure.attemptCount >= failure.maxAttempts;
    const { error } = await input.admin
      .from("supplier_catalogue_scrape_urls")
      .update({
        status: isTerminal ? "failed" : "pending",
        error_message: failure.error.slice(0, 500),
        updated_at: now,
        // Retry in the next durable chunk. A fresh browser/login is used.
        next_retry_at: null,
      })
      .eq("id", failure.id);

    if (error) {
      throw new Error(error.message || "Failed to record scrape URL failure");
    }
    if (isTerminal) terminal += 1;
    else retrying += 1;
  }

  return { retrying, terminal };
}

export async function getScrapeUrlCounts(
  admin: SupabaseClient,
  runId: string,
): Promise<ScrapeUrlCounts> {
  const count = async (
    status?: ScrapeUrlStatus,
    productLinked?: boolean,
  ): Promise<number> => {
    let query = admin
      .from("supplier_catalogue_scrape_urls")
      .select("id", { count: "exact", head: true })
      .eq("run_id", runId);
    if (status) query = query.eq("status", status);
    if (productLinked === true) query = query.not("product_id", "is", null);
    if (productLinked === false) query = query.is("product_id", null);
    const { count: value, error } = await query;
    if (error) {
      throw new Error(error.message || "Failed to reconcile scrape URL queue");
    }
    return value ?? 0;
  };

  const [
    discovered,
    pending,
    scraping,
    ingested,
    failed,
    skipped,
    doneWithoutProduct,
  ] = await Promise.all([
    count(),
    count("pending"),
    count("scraping"),
    count("done", true),
    count("failed"),
    count("skipped"),
    count("done", false),
  ]);

  const counts: ScrapeUrlCounts = {
    discovered,
    pending,
    scraping,
    ingested,
    failed,
    skipped,
    unresolved: doneWithoutProduct,
  };
  counts.unresolved +=
    counts.pending + counts.scraping + counts.failed + counts.skipped;
  return counts;
}

/** Re-queue URLs left in scraping after a crashed/timed-out chunk. */
export async function requeueStaleScrapingUrls(
  admin: SupabaseClient,
  runId: string,
): Promise<number> {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("supplier_catalogue_scrape_urls")
    .update({
      status: "pending",
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId)
    .eq("status", "scraping")
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${staleBefore}`)
    .select("id");

  if (error) {
    throw new Error(error.message || "Failed to requeue stale scrape URLs");
  }
  return data?.length ?? 0;
}

export function hashSourceImageUrl(url: string): string {
  return createHash("sha256").update(url.trim()).digest("hex");
}
