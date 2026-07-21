import type { SupplierLogEntry } from "@/lib/scrapers/supplier-logger";
import type { SupplierScraperLogger } from "@/lib/scrapers/supplier-logger";

const MAX_CRAWL_LOGS = 200;

export type CrawlLogLine = {
  id: string;
  timestamp: string;
  elapsedMs: number;
  level: string;
  step: string;
  message: string;
};

function entryKey(entry: Pick<CrawlLogLine, "timestamp" | "step" | "message">): string {
  return `${entry.timestamp}|${entry.step}|${entry.message}`;
}

function sanitiseEntry(entry: SupplierLogEntry | CrawlLogLine): CrawlLogLine {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    elapsedMs: entry.elapsedMs,
    level: entry.level,
    step: entry.step,
    message: entry.message.slice(0, 500),
  };
}

/**
 * Rolling log buffer persisted on scrape_runs.progress.logs for live UI tooltips.
 */
export class CrawlLogBuffer {
  private logs: CrawlLogLine[] = [];
  private seen = new Set<string>();

  constructor(previous?: unknown) {
    if (!Array.isArray(previous)) return;
    for (const raw of previous) {
      if (!raw || typeof raw !== "object") continue;
      const entry = raw as Partial<CrawlLogLine>;
      if (!entry.timestamp || !entry.step || !entry.message) continue;
      this.push({
        id: typeof entry.id === "string" ? entry.id : entryKey(entry as CrawlLogLine),
        timestamp: entry.timestamp,
        elapsedMs: typeof entry.elapsedMs === "number" ? entry.elapsedMs : 0,
        level: typeof entry.level === "string" ? entry.level : "info",
        step: entry.step,
        message: entry.message,
      });
    }
  }

  push(entry: SupplierLogEntry | CrawlLogLine): void {
    const line = sanitiseEntry(entry);
    const key = entryKey(line);
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.logs.push(line);
    while (this.logs.length > MAX_CRAWL_LOGS) {
      const dropped = this.logs.shift();
      if (dropped) this.seen.delete(entryKey(dropped));
    }
  }

  watch(logger: SupplierScraperLogger): () => void {
    return logger.onEntry((entry) => this.push(entry));
  }

  snapshot(): CrawlLogLine[] {
    return [...this.logs];
  }

  withProgress(progress: Record<string, unknown>): Record<string, unknown> {
    return {
      ...progress,
      logs: this.snapshot(),
      logsUpdatedAt: new Date().toISOString(),
    };
  }
}
