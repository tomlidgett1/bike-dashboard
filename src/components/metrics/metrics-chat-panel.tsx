"use client";

import * as React from "react";
import { Sparkles } from "@/components/layout/app-sidebar/dashboard-icons";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { GenieMarkdownContent } from "@/components/genie/genie-markdown-content";
import { GenieChart } from "@/components/genie/genie-chart";
import { GenieDataTable } from "@/components/genie/genie-data-table";
import {
  applyGenieSseEvent,
  createEmptyGenieAssistant,
} from "@/lib/genie/accumulate-genie-sse-event";
import { readSSE } from "@/lib/optimize/read-sse";
import {
  consumeMetricsPendingPrompt,
  METRICS_PROMPT_EVENT,
} from "@/lib/metrics/metrics-navigation";
import { looksLikeQuickChartPrompt } from "@/lib/metrics/metric-chart-runner";
import type { GenieChartPayload, GenieTablePayload } from "@/lib/genie/visual-payloads";
import type { MetricsInvestigationState } from "@/components/metrics/metrics-investigation-panel";
import { cn } from "@/lib/utils";

const STARTER_PROMPTS = [
  "Show me a graph with total general services sold each week",
  "Why did net sales change week on week? Break down the drivers by category.",
  "Build a line chart of net sales by day for the last 30 days.",
  "Show gross margin % trend by month and flag any categories dragging margin down.",
  "Which products sold the most units this month? Show as a table I can pin.",
];

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
};

export function MetricsChatPanel({
  onInvestigationChange,
  className,
}: {
  onInvestigationChange: (state: MetricsInvestigationState | null) => void;
  className?: string;
}) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pendingPromptRef = React.useRef<string | null>(null);

  const submitPrompt = React.useCallback(
    async (rawPrompt: string) => {
      const prompt = rawPrompt.trim();
      if (!prompt || isRunning) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: prompt,
      };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInput("");
      setIsRunning(true);
      setStatus("Planning analysis");

      let assistant = createEmptyGenieAssistant();
      onInvestigationChange({
        content: "",
        isStreaming: true,
        status: "Planning analysis",
      });

      try {
        if (looksLikeQuickChartPrompt(prompt)) {
          setStatus("Building chart");
          const quickResponse = await fetch("/api/store/metrics/quick-chart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
            signal: controller.signal,
          });

          const quickBody = (await quickResponse.json()) as {
            content?: string;
            chart?: GenieChartPayload;
            table?: GenieTablePayload;
            error?: string;
          };

          if (!quickResponse.ok) {
            throw new Error(quickBody.error ?? "Quick chart request failed.");
          }

          const content = quickBody.content ?? "Chart ready.";
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content,
              charts: quickBody.chart ? [quickBody.chart] : undefined,
              tables: quickBody.table ? [quickBody.table] : undefined,
            },
          ]);
          onInvestigationChange({
            content,
            charts: quickBody.chart ? [quickBody.chart] : undefined,
            tables: quickBody.table ? [quickBody.table] : undefined,
            isStreaming: false,
          });
          return;
        }

        const response = await fetch("/api/store/metrics/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: nextMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(
            typeof errorBody.error === "string"
              ? errorBody.error
              : "Metrics agent request failed.",
          );
        }

        await readSSE(response.body, async (event) => {
          if (event.event === "status" && typeof event.text === "string") {
            setStatus(event.text);
          }

          assistant = applyGenieSseEvent(event, assistant);
          onInvestigationChange({
            content: assistant.content,
            analysisPlan: assistant.analysisPlan,
            analysisQueries: assistant.analysisQueries,
            charts: assistant.charts,
            tables: assistant.tables,
            pivotTables: assistant.pivotTables,
            isStreaming: true,
            status: typeof event.text === "string" ? event.text : status ?? undefined,
          });
        });

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: assistant.content,
            charts: assistant.charts,
            tables: assistant.tables,
          },
        ]);
        onInvestigationChange({
          content: assistant.content,
          analysisPlan: assistant.analysisPlan,
          analysisQueries: assistant.analysisQueries,
          charts: assistant.charts,
          tables: assistant.tables,
          pivotTables: assistant.pivotTables,
          isStreaming: false,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Something went wrong.";
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: message },
        ]);
        onInvestigationChange({
          content: message,
          isStreaming: false,
        });
      } finally {
        setIsRunning(false);
        setStatus(null);
      }
    },
    [isRunning, messages, onInvestigationChange, status],
  );

  React.useEffect(() => {
    const pending = consumeMetricsPendingPrompt();
    if (pending) {
      pendingPromptRef.current = pending;
    }

    const onPrompt = () => {
      const queued = consumeMetricsPendingPrompt();
      if (queued) pendingPromptRef.current = queued;
    };

    window.addEventListener(METRICS_PROMPT_EVENT, onPrompt);
    return () => window.removeEventListener(METRICS_PROMPT_EVENT, onPrompt);
  }, []);

  React.useEffect(() => {
    if (!pendingPromptRef.current || isRunning) return;
    const prompt = pendingPromptRef.current;
    pendingPromptRef.current = null;
    void submitPrompt(prompt);
  }, [isRunning, submitPrompt]);

  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, isRunning, status]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col rounded-md border border-gray-200 bg-white shadow-sm", className)}>
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 bg-gray-50">
            <Sparkles className="h-4 w-4 text-gray-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Metrics analyst</p>
            <p className="text-xs text-muted-foreground">
              Governed metrics, charts, and driver analysis
            </p>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm leading-6 text-muted-foreground">
              Describe the metric, chart, or investigation you need. The agent will ground terms in the approved catalog, run diagnostic queries, and explain drivers with evidence.
            </p>
            <div className="grid gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void submitPrompt(prompt)}
                  className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-left text-sm text-gray-800 transition-colors hover:border-gray-300 hover:bg-white"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "rounded-md px-3 py-2.5 text-sm leading-6",
                message.role === "user"
                  ? "ml-8 bg-gray-100 text-gray-900"
                  : "mr-4 border border-gray-200 bg-white text-gray-800",
              )}
            >
              {message.role === "assistant" ? (
                <div className="space-y-3">
                  <GenieMarkdownContent content={message.content} />
                  {message.charts?.map((chart, index) => (
                    <div key={`${chart.title}-${index}`} className="rounded-md border border-gray-200 bg-white p-2">
                      <GenieChart chart={chart} variant="panel" embedded />
                    </div>
                  ))}
                  {message.tables?.map((table, index) => (
                    <div key={`${table.title}-${index}`} className="rounded-md border border-gray-200 bg-white p-2">
                      <GenieDataTable table={table} variant="panel" embedded />
                    </div>
                  ))}
                </div>
              ) : (
                message.content
              )}
            </div>
          ))
        )}

        {isRunning ? (
          <div className="mr-4 rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-muted-foreground">
            {status ?? "Investigating…"}
          </div>
        ) : null}
      </div>

      <div className="border-t border-gray-200 p-3">
        <HomeV2ChatInput
          value={input}
          isRunning={isRunning}
          compact
          onChange={setInput}
          onSubmit={() => void submitPrompt(input)}
          onStop={() => abortRef.current?.abort()}
          placeholder="Ask about revenue, margin, traffic, inventory…"
          showDisclaimer={false}
        />
      </div>
    </div>
  );
}
