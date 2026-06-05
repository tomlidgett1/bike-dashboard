"use client";

import * as React from "react";

export type LightspeedSyncStatus = "syncing" | "success" | "error" | null;

export interface LightspeedSyncResult {
  itemsSynced?: number;
  itemsWithStock?: number;
  totalItems?: number;
  totalItemsInCategories?: number;
}

export function useLightspeedSseSync(onComplete?: () => void | Promise<void>) {
  const [modalOpen, setModalOpen] = React.useState(false);
  const [status, setStatus] = React.useState<LightspeedSyncStatus>(null);
  const [progress, setProgress] = React.useState(0);
  const [phase, setPhase] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [result, setResult] = React.useState<LightspeedSyncResult | undefined>();
  const [error, setError] = React.useState("");
  const [syncingItemId, setSyncingItemId] = React.useState<string | null>(null);

  const runSync = React.useCallback(
    async (requestBody: { categoryIds?: string[]; itemIds?: string[] }) => {
      setModalOpen(true);
      setStatus("syncing");
      setProgress(0);
      setPhase("Initialising sync…");
      setMessage("Preparing to sync your inventory");
      setError("");

      const singleItem = requestBody.itemIds?.length === 1 ? requestBody.itemIds[0] : null;
      setSyncingItemId(singleItem);

      try {
        const response = await fetch("/api/lightspeed/sync-sse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          throw new Error(`Sync request failed: ${response.status}`);
        }
        if (!response.body) {
          throw new Error("No response body for sync stream");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;
            const eventMatch = line.match(/^event: (.+)$/m);
            const dataMatch = line.match(/^data: (.+)$/m);
            if (!dataMatch) continue;

            try {
              const data = JSON.parse(dataMatch[1]);
              if (eventMatch?.[1] === "complete") {
                setProgress(100);
                setStatus("success");
                setResult({
                  ...data,
                  totalItems: data.totalItems ?? data.totalItemsInCategories ?? 0,
                });
                setSyncingItemId(null);
                await onComplete?.();
              } else if (eventMatch?.[1] === "error") {
                setStatus("error");
                setError(data.error || "Sync failed");
                setSyncingItemId(null);
              } else {
                if (data.phase) {
                  setPhase(
                    data.phase.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase())
                  );
                }
                if (data.message) setMessage(data.message);
                if (typeof data.progress === "number") {
                  setProgress(Math.min(data.progress, 99));
                }
              }
            } catch {
              console.error("[Lightspeed sync] Failed to parse SSE event");
            }
          }
        }
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Sync failed");
        setSyncingItemId(null);
      }
    },
    [onComplete]
  );

  const closeModal = React.useCallback(() => {
    setModalOpen(false);
    setStatus(null);
    setProgress(0);
    setPhase("");
    setMessage("");
    setResult(undefined);
    setError("");
    setSyncingItemId(null);
  }, []);

  return {
    modalOpen,
    status,
    progress,
    phase,
    message,
    result,
    error,
    syncingItemId,
    runSync,
    closeModal,
  };
}
