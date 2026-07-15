export type SupplierLogLevel = "info" | "detail" | "warn" | "error" | "success";

export interface SupplierLogEntry {
  id: string;
  timestamp: string;
  elapsedMs: number;
  level: SupplierLogLevel;
  step: string;
  message: string;
  meta?: Record<string, unknown>;
}

type SupplierLogListener = (entry: SupplierLogEntry) => void;

let entryCounter = 0;

function nextEntryId(): string {
  entryCounter += 1;
  return `log-${entryCounter}`;
}

export class SupplierScraperLogger {
  private readonly startedAt = Date.now();
  private readonly entries: SupplierLogEntry[] = [];
  private readonly listeners = new Set<SupplierLogListener>();

  onEntry(listener: SupplierLogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getEntries(): SupplierLogEntry[] {
    return [...this.entries];
  }

  step(
    step: string,
    message: string,
    meta?: Record<string, unknown>,
    level: SupplierLogLevel = "info",
  ): SupplierLogEntry {
    const entry: SupplierLogEntry = {
      id: nextEntryId(),
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - this.startedAt,
      level,
      step,
      message,
      ...(meta && Object.keys(meta).length > 0 ? { meta } : {}),
    };
    this.entries.push(entry);
    const metaSuffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.log(
      `[supplier-scraper +${entry.elapsedMs}ms] [${entry.level}] ${entry.step}: ${entry.message}${metaSuffix}`,
    );
    for (const listener of this.listeners) listener(entry);
    return entry;
  }

  detail(step: string, message: string, meta?: Record<string, unknown>): SupplierLogEntry {
    return this.step(step, message, meta, "detail");
  }

  warn(step: string, message: string, meta?: Record<string, unknown>): SupplierLogEntry {
    return this.step(step, message, meta, "warn");
  }

  error(step: string, message: string, meta?: Record<string, unknown>): SupplierLogEntry {
    return this.step(step, message, meta, "error");
  }

  success(step: string, message: string, meta?: Record<string, unknown>): SupplierLogEntry {
    return this.step(step, message, meta, "success");
  }
}

export function createSupplierSseStream(
  handler: (send: (payload: Record<string, unknown>) => void, logger: SupplierScraperLogger) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const logger = new SupplierScraperLogger();
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      const unsubscribe = logger.onEntry((entry) => {
        send({ event: "log", entry });
      });

      try {
        await handler(send, logger);
        send({ event: "done" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "The supplier scraper request failed.";
        logger.error("failed", message);
        send({ event: "error", message, logs: logger.getEntries() });
      } finally {
        unsubscribe();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function consumeSupplierSse<T>(
  response: Response,
  onLog?: (entry: SupplierLogEntry) => void,
  onEvent?: (event: Record<string, unknown>) => void,
): Promise<T> {
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      typeof payload.error === "string"
        ? payload.error
        : `Supplier scraper request failed (${response.status}).`,
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: T | null = null;
  let errorMessage: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (onEvent) onEvent(event);
        if (event.event === "log" && onLog) {
          onLog(event.entry as SupplierLogEntry);
        }
        if (event.event === "result") {
          result = event as T;
        }
        if (event.event === "error" && typeof event.message === "string") {
          errorMessage = event.message;
        }
      } catch {
        // Ignore malformed SSE chunks.
      }
    }
  }

  if (errorMessage) throw new Error(errorMessage);
  if (!result) throw new Error("YJ finished without returning a result.");
  return result;
}
