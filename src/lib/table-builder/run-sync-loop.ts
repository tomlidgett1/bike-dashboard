/**
 * Browser-side Lightspeed sync loop for Build a Table / Analytics refresh.
 * Chunks the pull and backs off when Lightspeed is rate-limited instead of failing.
 */

export type ApiBuilderSyncChunkResult = {
  success?: boolean;
  complete?: boolean;
  throttled?: boolean;
  retryable?: boolean;
  retryAfterMs?: number;
  syncKind?: "full" | "incremental";
  rowsUpserted?: number;
  salesFetched?: number;
  nextCursor?: string | null;
  error?: string;
};

export type RunApiBuilderSyncLoopOptions = {
  tableId: string;
  /** Pages per request. Shrinks automatically while recovering from throttle. */
  maxPages?: number;
  /**
   * "auto" (default): resume any in-flight sync, then refresh incrementally —
   * or rebuild in full if the table schema changed. "full": force a rebuild.
   */
  mode?: "auto" | "full";
  /** Abort when this returns false (e.g. a newer loop started). */
  shouldContinue?: () => boolean;
  onProgress?: (message: string, chunk: ApiBuilderSyncChunkResult) => void;
};

const DEFAULT_MAX_PAGES = 2;
const THROTTLE_MAX_PAGES = 1;
const MAX_THROTTLE_STREAK = 24;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function isApiBuilderSyncThrottle(
  responseOk: boolean,
  data: ApiBuilderSyncChunkResult | null | undefined,
): boolean {
  if (!data) return false;
  if (data.throttled || data.retryable) return true;
  const error = typeof data.error === "string" ? data.error : "";
  if (/busy|rate.?limit|retry shortly|retry requested after|429/i.test(error)) {
    return true;
  }
  // Server may still return 500 with a busy message from older builds.
  if (!responseOk && /busy|rate.?limit|retry shortly/i.test(error)) return true;
  return false;
}

export function apiBuilderSyncRetryAfterMs(
  data: ApiBuilderSyncChunkResult | null | undefined,
  throttleStreak: number,
): number {
  if (typeof data?.retryAfterMs === "number" && Number.isFinite(data.retryAfterMs)) {
    return Math.min(Math.max(data.retryAfterMs, 1_000), 120_000);
  }
  const error = typeof data?.error === "string" ? data.error : "";
  const match = error.match(/after\s+(\d+)\s*ms/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(Math.max(parsed, 1_000), 120_000);
    }
  }
  // 5s, 10s, 20s… capped at 60s
  return Math.min(5_000 * 2 ** Math.min(throttleStreak, 4), 60_000);
}

/**
 * Pull a custom table from Lightspeed in small chunks, resuming across rate limits.
 */
export async function runApiBuilderSyncLoop(
  options: RunApiBuilderSyncLoopOptions,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const shouldContinue = options.shouldContinue ?? (() => true);
  let firstRequest = true;
  let throttleStreak = 0;
  let maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES);

  while (shouldContinue()) {
    // Only the first request may force a rebuild; later chunks always resume
    // the run the server started.
    const mode = firstRequest ? options.mode ?? "auto" : "auto";
    const response = await fetch("/api/store/table-builder/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableId: options.tableId,
        maxPages,
        mode,
      }),
    });
    firstRequest = false;

    let data: ApiBuilderSyncChunkResult = {};
    try {
      data = (await response.json()) as ApiBuilderSyncChunkResult;
    } catch {
      data = { error: "Sync failed" };
    }

    if (!shouldContinue()) {
      return { ok: false, error: "Sync cancelled" };
    }

    if (isApiBuilderSyncThrottle(response.ok, data)) {
      throttleStreak += 1;
      if (throttleStreak > MAX_THROTTLE_STREAK) {
        return {
          ok: false,
          error: "Lightspeed stayed busy for too long. Try refresh again in a minute.",
        };
      }
      maxPages = THROTTLE_MAX_PAGES;
      const waitMs = apiBuilderSyncRetryAfterMs(data, throttleStreak - 1);
      const waitSec = Math.max(1, Math.ceil(waitMs / 1000));
      options.onProgress?.(
        `Lightspeed is busy — retrying in ${waitSec}s…`,
        { ...data, throttled: true, retryAfterMs: waitMs },
      );
      await sleep(waitMs);
      continue;
    }

    if (!response.ok || data.success === false) {
      return {
        ok: false,
        error: typeof data.error === "string" ? data.error : "Sync failed",
      };
    }

    throttleStreak = 0;
    maxPages = Math.max(1, options.maxPages ?? DEFAULT_MAX_PAGES);
    const incremental = data.syncKind === "incremental";
    const salesFetched = Number(data.salesFetched ?? 0);
    options.onProgress?.(
      data.complete
        ? incremental
          ? salesFetched > 0
            ? `Up to date — refreshed ${salesFetched.toLocaleString()} recent sale${salesFetched === 1 ? "" : "s"}`
            : "Already up to date"
          : "Sync complete"
        : incremental
          ? `Checking recent sales… ${salesFetched.toLocaleString()} pulled`
          : `Synced ${Number(data.rowsUpserted ?? 0).toLocaleString()} rows…`,
      data,
    );

    if (data.complete) return { ok: true };
    await sleep(120);
  }

  return { ok: false, error: "Sync cancelled" };
}
