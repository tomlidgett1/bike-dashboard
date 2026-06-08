"use client";

import * as React from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, History, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GenieChart, type GenieChartPayload } from "@/components/genie/genie-chart";
import { GenieDataTable, type GenieTablePayload } from "@/components/genie/genie-data-table";
import { GeniePivotTable } from "@/components/genie/genie-pivot-table";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";
import { GenieProposalCard } from "@/components/genie/genie-proposal-card";
import { LightspeedWorkorderCards } from "@/components/genie/lightspeed-workorder-cards";
import { LightspeedCustomerProfileCard } from "@/components/genie/lightspeed-customer-profile-card";
import { GmailEmailSearchCard } from "@/components/genie/gmail-email-search-card";
import { GmailConnectCard } from "@/components/genie/gmail-connect-card";
import { GenieStoreProductCards } from "@/components/genie/genie-store-product-cards";
import { GenieWebImageCards } from "@/components/genie/genie-web-image-cards";
import type { GenieWebImagePreview } from "@/lib/genie/web-image-search";
import {
  GenieRawLogsViewer,
  GenieThinkingDetailSections,
  appendRawDebugLog,
  mergeAnalysisPlan,
  upsertAnalysisQuery,
} from "@/components/genie/genie-thinking-detail-sections";
import type { GenieStoreProductPreview } from "@/lib/genie/store-product-previews";
import { HomeV2MetricsCards } from "@/components/settings/homev2-metrics-cards";
import { HomeV2SmartSuggestions } from "@/components/settings/homev2-smart-suggestions";
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
  GenieCustomerProfilePayload,
  GenieProposal,
  GenieRawDebugLogEntry,
  GenieWorkorderCardsPayload,
  GmailEmailsPayload,
  GmailConnectPayload,
  GmailAgentContext,
} from "@/lib/types/genie-agent";
import { consumeHomeV2PendingPrompt } from "@/lib/genie/homev2-navigation";
import { compactGenieProgressText, liveGenieProgressPreview } from "@/lib/genie/progress-text";
import { mergeGmailAgentContext } from "@/lib/genie/gmail-agent-context";
import {
  GenieProgressBrandIcon,
  resolveGenieProgressBrand,
} from "@/components/genie/genie-progress-brand";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";

type ChatRole = "user" | "assistant";

interface ProcessStep {
  id: string;
  phase: string;
  text: string;
  kind: "status" | "reasoning";
  at: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
  pivotTables?: GeniePivotTablePayload[];
  proposals?: GenieProposal[];
  products?: GenieStoreProductPreview[];
  webImages?: GenieWebImagePreview[];
  workorders?: GenieWorkorderCardsPayload;
  customerProfile?: GenieCustomerProfilePayload;
  gmailEmails?: GmailEmailsPayload;
  gmailConnect?: GmailConnectPayload;
  status?: string;
  statusPhase?: string;
  reasoningSummary?: string;
  processSteps?: ProcessStep[];
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  rawDebugLogs?: GenieRawDebugLogEntry[];
  isStreaming?: boolean;
  error?: string;
}

interface SavedHomeV2Conversation {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface QueuedPrompt {
  id: string;
  text: string;
}

const HISTORY_STORAGE_KEY = "homev2-genie-conversations";
const APP_HEADER_OFFSET_PX = 57;

const THINKING_SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #a3a3a3 0%, #a3a3a3 38%, #525252 50%, #a3a3a3 62%, #a3a3a3 100%)",
  backgroundSize: "220% 100%",
};

const PHASE_LABELS: Record<string, string> = {
  context: "Reading context",
  routing: "Routing",
  routing_done: "Workflow",
  setup: "Setup",
  planning: "Planning",
  planning_done: "Planning",
  thinking: "Thinking",
  web_search: "Searching web",
  web_search_done: "Web search done",
  image_search: "Finding images",
  image_search_done: "Images",
  lightspeed_sales: "Sales",
  lightspeed_inventory: "Stock",
  lightspeed_customers: "Customers",
  lightspeed_workorders: "Work orders",
  customer_context: "Customer bike",
  specialist: "Specialist",
  rechecking: "Retrying",
  tool_done: "Result",
  responding: "Answering",
  tool: "Working",
  gmail: "Gmail",
  gmail_done: "Gmail",
};

function normalizeStartupStatusText(text: string, phase?: string): string {
  return compactGenieProgressText(text, phase);
}

function processTimestamp(): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function processStepId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createProcessStep(
  phase: string,
  text: string,
  kind: ProcessStep["kind"] = "status",
): ProcessStep {
  return {
    id: processStepId(),
    phase,
    text: kind === "status" ? normalizeStartupStatusText(text.trim(), phase) : text.trim(),
    kind,
    at: processTimestamp(),
  };
}

function appendProcessStep(steps: ProcessStep[] | undefined, step: ProcessStep): ProcessStep[] {
  if (!step.text) return steps ?? [];
  const current = steps ?? [];
  const last = current[current.length - 1];
  if (last?.kind === step.kind && last.phase === step.phase && last.text === step.text) return current;
  return [...current, step].slice(-80);
}

function upsertLiveReasoningStep(steps: ProcessStep[] | undefined, step: ProcessStep): ProcessStep[] {
  if (!step.text) return steps ?? [];
  const current = steps ?? [];
  const last = current[current.length - 1];
  if (last?.kind === "reasoning" && last.phase === step.phase) {
    return [...current.slice(0, -1), { ...last, text: step.text, at: step.at }];
  }
  return appendProcessStep(current, step);
}

function AssistantMessageContent({ content }: { content: string }) {
  if (!content) return null;

  return (
    <div className="max-w-3xl text-[15px] leading-relaxed">
      <div
        className="[&>p+p]:mt-2 [&_strong]:font-semibold"
        dangerouslySetInnerHTML={{ __html: renderGenieMarkdown(content) }}
      />
    </div>
  );
}

function processStepLabel(step: ProcessStep) {
  if (step.kind === "reasoning") return "Reasoning";
  return PHASE_LABELS[step.phase] ?? step.phase;
}

function ProcessStepDetail({
  step,
  isLast,
  live,
}: {
  step: ProcessStep;
  isLast: boolean;
  live?: boolean;
}) {
  const progressBrand = resolveGenieProgressBrand(step.phase, step.text);

  return (
    <div className="grid grid-cols-[18px_1fr] gap-2.5">
      <div className="relative flex justify-center">
        <span
          className={cn(
            "mt-1.5 h-1.5 w-1.5 rounded-full bg-gray-300",
            live && isLast ? "animate-pulse bg-gray-500" : "",
          )}
        />
        {!isLast ? <span className="absolute top-4 bottom-0 w-px bg-gray-200" /> : null}
      </div>
      <div className="pb-3">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-gray-400">
          {progressBrand ? (
            <GenieProgressBrandIcon phase={step.phase} text={step.text} />
          ) : null}
          <span className="font-medium text-gray-500">{processStepLabel(step)}</span>
          <span className="text-gray-300">{step.at}</span>
        </div>
        <div
          className={cn(
            "text-xs leading-relaxed text-gray-600 [&_strong]:font-semibold [&_strong]:text-gray-800 [&_ul]:my-1.5 [&_li]:my-0.5",
            live && isLast ? "text-transparent bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite]" : "",
          )}
          style={live && isLast ? {
            backgroundImage:
              "linear-gradient(90deg, #737373 0%, #737373 38%, #171717 50%, #737373 62%, #737373 100%)",
            backgroundSize: "220% 100%",
          } : undefined}
          dangerouslySetInnerHTML={{ __html: renderGenieMarkdown(step.text, { compact: true }) }}
        />
      </div>
    </div>
  );
}

function ThinkingProgressPanel({
  open,
  onClose,
  steps,
  live,
  phaseLabel,
  analysisPlan,
  analysisQueries,
  rawDebugLogs,
}: {
  open: boolean;
  onClose: () => void;
  steps: ProcessStep[];
  live?: boolean;
  phaseLabel: string;
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  rawDebugLogs?: GenieRawDebugLogEntry[];
}) {
  const [rawLogsOpen, setRawLogsOpen] = React.useState(false);
  const panelScrollRef = React.useRef<HTMLDivElement>(null);
  const latestStepText = steps[steps.length - 1]?.text;
  const logCount = rawDebugLogs?.length ?? 0;

  React.useEffect(() => {
    if (!open || !panelScrollRef.current) return;
    panelScrollRef.current.scrollTop = panelScrollRef.current.scrollHeight;
  }, [open, steps.length, latestStepText, live]);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (rawLogsOpen) setRawLogsOpen(false);
        else onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, rawLogsOpen]);

  React.useEffect(() => {
    if (!open) setRawLogsOpen(false);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close thinking panel"
        className="fixed inset-x-0 bottom-0 z-40 animate-in fade-in duration-200 bg-black/15"
        style={{ top: APP_HEADER_OFFSET_PX }}
        onClick={onClose}
      />
      <aside
        className="fixed z-50 flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl animate-in slide-in-from-right-4 fade-in duration-300 ease-out"
        style={{
          top: APP_HEADER_OFFSET_PX + 12,
          right: 12,
          height: `calc(100svh - ${APP_HEADER_OFFSET_PX}px - 24px)`,
        }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {rawLogsOpen ? "Raw logs" : "Thinking & progress"}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {rawLogsOpen
                ? `${logCount} captured event${logCount === 1 ? "" : "s"}`
                : live
                  ? `${phaseLabel} · ${steps.length} step${steps.length === 1 ? "" : "s"} so far`
                  : `${steps.length} step${steps.length === 1 ? "" : "s"} recorded`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {rawLogsOpen ? (
              <button
                type="button"
                onClick={() => setRawLogsOpen(false)}
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Back
              </button>
            ) : logCount > 0 ? (
              <button
                type="button"
                onClick={() => setRawLogsOpen(true)}
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Raw logs
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={panelScrollRef}
          className={cn(
            "min-h-0 flex-1 px-4 py-4",
            rawLogsOpen ? "flex flex-col overflow-hidden" : "overflow-y-auto",
          )}
        >
          {rawLogsOpen ? (
            <GenieRawLogsViewer logs={rawDebugLogs ?? []} />
          ) : (
            <div className="space-y-4">
              <GenieThinkingDetailSections
                plan={analysisPlan}
                queries={analysisQueries}
                live={live}
              />
              {steps.length > 0 ? (
                <div>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Progress
                  </p>
                  {steps.map((step, index) => (
                    <ProcessStepDetail
                      key={step.id}
                      step={step}
                      isLast={index === steps.length - 1}
                      live={live && index === steps.length - 1}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

function ProcessTimelineBox({
  steps,
  live,
  analysisPlan,
  analysisQueries,
  rawDebugLogs,
}: {
  steps: ProcessStep[];
  live?: boolean;
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  rawDebugLogs?: GenieRawDebugLogEntry[];
}) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const visibleSteps = steps
    .map((step) => ({
      ...step,
      text: step.kind === "status" ? normalizeStartupStatusText(step.text, step.phase) : step.text,
    }))
    .slice(-40);
  const latestStep = visibleSteps[visibleSteps.length - 1];
  const hasAnalysis = Boolean(analysisPlan?.execution_steps.length || analysisQueries?.length);

  if (visibleSteps.length === 0 && !hasAnalysis) return null;

  const phaseLabel = latestStep ? processStepLabel(latestStep) : analysisPlan ? "Planning" : "Working";
  const progressText = latestStep
    ? liveGenieProgressPreview(latestStep.text, latestStep.phase) || phaseLabel
    : "Thinking…";

  return (
    <>
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={cn(
          "inline-flex max-w-3xl items-center gap-2 border-0 bg-transparent p-0 text-left",
          !live && "text-gray-400 hover:text-gray-600",
        )}
        aria-label="Open thinking and progress details"
      >
        {live && latestStep ? (
          <GenieProgressBrandIcon phase={latestStep.phase} text={latestStep.text} />
        ) : null}
        <span
          className={cn(
            "whitespace-normal text-[15px] leading-relaxed",
            live
              ? "text-transparent bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite] text-gray-500"
              : "text-gray-400",
          )}
          style={live ? THINKING_SHIMMER_STYLE : undefined}
        >
          {live ? progressText : "View thought process"}
        </span>
      </button>

      <ThinkingProgressPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        steps={visibleSteps}
        live={live}
        phaseLabel={phaseLabel}
        analysisPlan={analysisPlan}
        analysisQueries={analysisQueries}
        rawDebugLogs={rawDebugLogs}
      />
    </>
  );
}

function readConversationHistory(): SavedHomeV2Conversation[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writeConversationHistory(conversations: SavedHomeV2Conversation[]) {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(conversations.slice(0, 20)));
}

function conversationTitle(messages: ChatMessage[]) {
  const firstUser = messages.find((message) => message.role === "user")?.content.trim();
  if (!firstUser) return "New conversation";
  return firstUser.length > 58 ? `${firstUser.slice(0, 57)}…` : firstUser;
}

function conversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function ConversationHistoryDropdown({
  conversations,
  activeConversationId,
  onSelect,
  showNewChat = false,
  onNewChat,
}: {
  conversations: SavedHomeV2Conversation[];
  activeConversationId: string | null;
  onSelect: (conversation: SavedHomeV2Conversation) => void;
  showNewChat?: boolean;
  onNewChat?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  if (conversations.length === 0 && !showNewChat) return null;

  return (
    <div ref={rootRef} className="relative inline-flex items-center gap-1.5">
      {showNewChat && onNewChat ? (
        <button
          type="button"
          onClick={onNewChat}
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-gray-100/80 hover:text-foreground"
        >
          <Plus className="h-3 w-3" />
          New chat
        </button>
      ) : null}

      {conversations.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-xl px-2.5 text-xs text-muted-foreground transition-colors hover:bg-gray-100/80 hover:text-foreground",
              open && "bg-gray-100/80 text-foreground",
            )}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label="Recent conversations"
          >
            <History className="h-3 w-3 opacity-70" />
            <span>Recent</span>
            <ChevronDown
              className={cn(
                "h-3 w-3 opacity-60 transition-transform duration-200",
                open && "rotate-180",
              )}
            />
          </button>

          <AnimatePresence>
            {open ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.04, 0.62, 0.23, 0.98],
                }}
                className="absolute left-0 top-full z-30 mt-1.5 w-60 overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18)]"
              >
                <ul className="max-h-48 overflow-y-auto p-1" role="listbox">
                  {conversations.map((conversation) => (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={activeConversationId === conversation.id}
                        onClick={() => {
                          onSelect(conversation);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full rounded-md px-2.5 py-2 text-left transition-colors hover:bg-gray-50",
                          activeConversationId === conversation.id && "bg-gray-50",
                        )}
                      >
                        <p className="line-clamp-1 text-xs font-medium text-foreground/90">
                          {conversation.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {conversationTime(conversation.updatedAt)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      ) : null}
    </div>
  );
}

function PromptQueueList({
  items,
  onUpdate,
  onDelete,
}: {
  items: QueuedPrompt[];
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");

  if (items.length === 0) return null;

  const startEditing = (item: QueuedPrompt) => {
    setEditingId(item.id);
    setDraft(item.text);
  };

  const saveEdit = () => {
    if (!editingId) return;
    const trimmed = draft.trim();
    if (trimmed) onUpdate(editingId, trimmed);
    setEditingId(null);
    setDraft("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  return (
    <div className="mb-2 max-h-28 space-y-1 overflow-y-auto">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex h-8 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2"
        >
          {editingId === item.id ? (
            <>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveEdit();
                  }
                  if (event.key === "Escape") cancelEdit();
                }}
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none"
              />
              <button
                type="button"
                onClick={saveEdit}
                disabled={!draft.trim()}
                className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Cancel edit"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <p className="min-w-0 flex-1 truncate text-sm text-gray-800">{item.text}</p>
              <button
                type="button"
                onClick={() => startEditing(item)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Edit queued prompt"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
                aria-label="Delete queued prompt"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function HomeV2Chat({ todayLabel }: { todayLabel: string }) {
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversations, setConversations] = React.useState<SavedHomeV2Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [queuedPrompts, setQueuedPrompts] = React.useState<QueuedPrompt[]>([]);
  const [lastMsgMinHeight, setLastMsgMinHeight] = React.useState<number | undefined>(undefined);
  const [gmailConnectBanner, setGmailConnectBanner] = React.useState<GmailConnectPayload | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const lastUserMessageRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const messagesRef = React.useRef<ChatMessage[]>([]);
  const isLoadingRef = React.useRef(false);
  const runSendRef = React.useRef<(text: string, clearInputField?: boolean) => Promise<void>>(async () => {});
  const consumedPendingPromptRef = React.useRef(false);
  const hasStarted = messages.length > 0;

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  const clearPromptQueue = React.useCallback(() => {
    setQueuedPrompts([]);
  }, []);

  const updateQueuedPrompt = React.useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQueuedPrompts((current) =>
      current.map((item) => (item.id === id ? { ...item, text: trimmed } : item)),
    );
  }, []);

  const deleteQueuedPrompt = React.useCallback((id: string) => {
    setQueuedPrompts((current) => current.filter((item) => item.id !== id));
  }, []);

  const processPromptQueue = React.useCallback(() => {
    setQueuedPrompts((current) => {
      if (current.length === 0) return current;
      const [next, ...rest] = current;
      queueMicrotask(() => {
        void runSendRef.current(next.text, false);
      });
      return rest;
    });
  }, []);

  React.useEffect(() => {
    setConversations(readConversationHistory());
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch("/api/composio/status");
        const status = await statusRes.json().catch(() => null);
        if (cancelled || !status?.configured || status?.connected) return;
        setGmailConnectBanner({ url: "", reason: "status" });
      } catch {
        // Gmail connect banner is optional — Genie can still prompt in chat.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  React.useEffect(() => {
    if (messages.length === 0 || messages.some((message) => message.isStreaming)) return;
    if (!messages.some((message) => message.role === "user")) return;

    const id = activeConversationId ?? crypto.randomUUID();
    const nextConversation: SavedHomeV2Conversation = {
      id,
      title: conversationTitle(messages),
      updatedAt: new Date().toISOString(),
      messages,
    };

    setActiveConversationId(id);
    setConversations((current) => {
      const next = [nextConversation, ...current.filter((conversation) => conversation.id !== id)].slice(0, 20);
      writeConversationHistory(next);
      return next;
    });
  }, [activeConversationId, messages]);

  const startNewChat = React.useCallback(() => {
    abortRef.current?.abort();
    clearPromptQueue();
    setInput("");
    setMessages([]);
    setLastMsgMinHeight(undefined);
    setActiveConversationId(null);
    isLoadingRef.current = false;
    setIsLoading(false);
  }, [clearPromptQueue]);

  const loadConversation = React.useCallback((conversation: SavedHomeV2Conversation) => {
    abortRef.current?.abort();
    clearPromptQueue();
    setInput("");
    setMessages(conversation.messages.map((message) => ({ ...message, isStreaming: false, status: undefined })));
    setLastMsgMinHeight(undefined);
    setActiveConversationId(conversation.id);
    isLoadingRef.current = false;
    setIsLoading(false);
  }, [clearPromptQueue]);

  const stopGeneration = React.useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const runSend = React.useCallback(async (text: string, clearInputField = true) => {
    const trimmed = text.trim();
    if (!trimmed || isLoadingRef.current) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      isStreaming: true,
      status: "Thinking",
      statusPhase: "thinking",
      processSteps: [createProcessStep("thinking", "Thinking")],
    };

    const nextMessages = [...messagesRef.current, userMessage];
    const containerHeight =
      scrollRef.current?.clientHeight ??
      (typeof window === "undefined" ? 0 : Math.max(360, window.innerHeight - 180));

    flushSync(() => {
      const updatedMessages = [...nextMessages, assistantMessage];
      messagesRef.current = updatedMessages;
      setLastMsgMinHeight(containerHeight);
      setMessages(updatedMessages);
      if (clearInputField) setInput("");
    });
    isLoadingRef.current = true;
    setIsLoading(true);

    const snapLatestUserToTop = () => {
      const container = scrollRef.current;
      const element = lastUserMessageRef.current;
      if (!container || !element) return;

      const elementRect = element.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + (elementRect.top - containerRect.top) - 12,
        behavior: "smooth",
      });
    };

    snapLatestUserToTop();
    requestAnimationFrame(snapLatestUserToTop);

    const controller = new AbortController();
    abortRef.current = controller;
    const streamState = { pending: "", rafId: null as number | null };
    const flushText = () => {
      if (streamState.pending) {
        const chunk = streamState.pending;
        streamState.pending = "";
        setMessages((current) => current.map((message) =>
          message.id === assistantId
            ? { ...message, content: `${message.content}${chunk}`, status: undefined }
            : message
        ));
      }
      streamState.rafId = null;
    };
    const queueTextDelta = (text: string) => {
      if (!text) return;
      streamState.pending += text;
      if (streamState.rafId === null) {
        streamState.rafId = requestAnimationFrame(flushText);
      }
    };
    const flushPendingText = () => {
      if (streamState.rafId !== null) {
        cancelAnimationFrame(streamState.rafId);
        flushText();
      }
    };

    const recordStreamEvent = (payload: Record<string, unknown>) => {
      setMessages((current) => current.map((message) =>
        message.id === assistantId
          ? { ...message, rawDebugLogs: appendRawDebugLog(message.rawDebugLogs, payload) }
          : message
      ));
    };

    try {
      const response = await fetch("/api/genie/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
            charts: message.charts,
            tables: message.tables,
            pivotTables: message.pivotTables,
            products: message.products,
            webImages: message.webImages,
            workorders: message.workorders,
            customerProfile: message.customerProfile,
            proposals: message.proposals,
            gmailEmails: message.gmailEmails,
            analysisPlan: message.analysisPlan,
            analysisQueries: message.analysisQueries,
          })),
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      recordStreamEvent({
        event: "_stream_start",
        endpoint: "/api/genie/agent",
        user_message: trimmed,
        request_messages_count: nextMessages.length,
        http_status: response.status,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(raw);
          } catch {
            recordStreamEvent({ event: "_sse_parse_error", raw });
            continue;
          }

          recordStreamEvent(event);

          if (event.event === "status") {
            const phase = String(event.phase ?? "tool");
            const text = normalizeStartupStatusText(String(event.text ?? "Working"), phase);
            const step = createProcessStep(phase, text);
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    status: text,
                    statusPhase: phase,
                    processSteps: appendProcessStep(message.processSteps, step),
                  }
                : message
            ));
          }

          if (event.event === "heartbeat") {
            const text = normalizeStartupStatusText(String(event.text ?? "Still working"), "thinking");
            setMessages((current) => current.map((message) =>
              message.id === assistantId && message.isStreaming
                ? {
                    ...message,
                    status: text,
                    statusPhase: "thinking",
                  }
                : message
            ));
          }

          if (event.event === "reasoning_delta") {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? (() => {
                    const reasoningSummary = `${message.reasoningSummary ?? ""}${event.text ?? ""}`;
                    return {
                      ...message,
                      reasoningSummary,
                      processSteps: upsertLiveReasoningStep(
                        message.processSteps,
                        createProcessStep("thinking", reasoningSummary, "reasoning"),
                      ),
                    };
                  })()
                : message
            ));
          }

          if (event.event === "reasoning_done") {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? (() => {
                    const reasoningSummary = String(event.text ?? message.reasoningSummary ?? "");
                    const phase = reasoningSummary.trim().startsWith("- ") ? "planning" : "thinking";
                    return {
                      ...message,
                      reasoningSummary,
                      processSteps: upsertLiveReasoningStep(
                        message.processSteps,
                        createProcessStep(phase, reasoningSummary, "reasoning"),
                      ),
                    };
                  })()
                : message
            ));
          }

          if (event.event === "analysis_plan" && event.plan) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    analysisPlan: mergeAnalysisPlan(
                      message.analysisPlan,
                      event.plan as GenieAnalysisPlanPayload,
                    ),
                  }
                : message
            ));
          }

          if (event.event === "analysis_query" && event.query) {
            const query = event.query as GenieAnalysisQueryPayload;
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    analysisQueries: upsertAnalysisQuery(
                      message.analysisQueries,
                      query,
                    ),
                  }
                : message
            ));
          }

          if (event.event === "text_delta") {
            queueTextDelta(String(event.text ?? ""));
          }

          if (event.event === "chart" && event.chart) {
            const chart = event.chart as GenieChartPayload;
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? { ...message, charts: [...(message.charts ?? []), chart] }
                : message
            ));
          }

          if (event.event === "table" && event.table) {
            const table = event.table as GenieTablePayload;
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? { ...message, tables: [...(message.tables ?? []), table] }
                : message
            ));
          }

          if (event.event === "pivot_table" && event.pivot_table) {
            const pivotTable = event.pivot_table as GeniePivotTablePayload;
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    pivotTables: [...(message.pivotTables ?? []), pivotTable],
                  }
                : message
            ));
          }

          if (event.event === "proposal" && event.proposal) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    proposals: [...(message.proposals ?? []), event.proposal as GenieProposal],
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "products" && Array.isArray(event.products) && event.products.length > 0) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    products: event.products as GenieStoreProductPreview[],
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "web_images" && Array.isArray(event.images) && event.images.length > 0) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    webImages: event.images as GenieWebImagePreview[],
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "workorders" && event.workorders) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    workorders: event.workorders as GenieWorkorderCardsPayload,
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "customer_profile" && event.customer_profile) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    customerProfile: event.customer_profile as GenieCustomerProfilePayload,
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "gmail_emails" && event.gmail_emails) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    gmailEmails: event.gmail_emails as GmailEmailsPayload,
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "gmail_agent_context" && event.gmail_agent_context) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    gmailEmails: mergeGmailAgentContext(
                      message.gmailEmails,
                      event.gmail_agent_context as GmailAgentContext,
                    ),
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "gmail_connect" && event.gmail_connect) {
            setMessages((current) => current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    gmailConnect: event.gmail_connect as GmailConnectPayload,
                    status: undefined,
                  }
                : message
            ));
          }

          if (event.event === "done") {
            flushPendingText();
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, isStreaming: false, status: undefined } : message
            ));
          }

          if (event.event === "error") {
            throw new Error(typeof event.message === "string" ? event.message : "Genie failed");
          }
        }
      }

      flushPendingText();
      recordStreamEvent({ event: "_stream_end" });
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, isStreaming: false, status: undefined } : message
      ));
    } catch (error) {
      if (streamState.rafId !== null) {
        cancelAnimationFrame(streamState.rafId);
        streamState.rafId = null;
      }
      if ((error as Error).name === "AbortError") {
        recordStreamEvent({ event: "_stream_aborted" });
        flushPendingText();
        setMessages((current) => current.map((message) =>
          message.isStreaming ? { ...message, isStreaming: false, status: undefined } : message
        ));
      } else {
        recordStreamEvent({
          event: "_stream_error",
          message: error instanceof Error ? error.message : String(error),
        });
        flushPendingText();
        setMessages((current) => current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                isStreaming: false,
                status: undefined,
                error: "Something went wrong. Please try again.",
              }
            : message
        ));
      }
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
      abortRef.current = null;
      flushSync(() => {
        setMessages((current) => {
          messagesRef.current = current;
          return current;
        });
      });
      processPromptQueue();
    }
  }, [processPromptQueue]);

  React.useEffect(() => {
    runSendRef.current = runSend;
  }, [runSend]);

  React.useEffect(() => {
    if (consumedPendingPromptRef.current) return;
    const pending = consumeHomeV2PendingPrompt();
    if (!pending) return;
    consumedPendingPromptRef.current = true;
    queueMicrotask(() => {
      void runSendRef.current(pending, false);
    });
  }, []);

  const submitPrompt = React.useCallback((rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text) return;

    if (isLoadingRef.current) {
      setQueuedPrompts((current) => [...current, { id: crypto.randomUUID(), text }]);
      if (rawText === undefined) setInput("");
      return;
    }

    void runSend(text, rawText === undefined);
  }, [input, runSend]);

  const gmailConnectAccessory = gmailConnectBanner ? (
    <GmailConnectCard
      payload={gmailConnectBanner}
      variant="inline"
      onConnected={() => setGmailConnectBanner(null)}
    />
  ) : null;

  return (
    <div className="flex h-[calc(100svh-57px)] flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]">
      {!hasStarted ? (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-7 px-6 py-10">
          <h1 className="max-w-2xl text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Welcome, today is {todayLabel}
          </h1>

          <HomeV2MetricsCards />

          <div className="w-full max-w-3xl">
            <div className="mb-2 flex justify-start">
              <ConversationHistoryDropdown
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelect={loadConversation}
              />
            </div>
            <PromptQueueList
              items={queuedPrompts}
              onUpdate={updateQueuedPrompt}
              onDelete={deleteQueuedPrompt}
            />
            <HomeV2ChatInput
              value={input}
              isRunning={isLoading}
              onChange={setInput}
              onSubmit={() => submitPrompt()}
              onStop={stopGeneration}
              endAccessory={gmailConnectAccessory}
            />
          </div>

          <div className="w-full">
            <HomeV2SmartSuggestions />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
              {messages.map((message, index) => {
                const isLatestUserMessage =
                  message.role === "user" &&
                  !messages.slice(index + 1).some((nextMessage) => nextMessage.role === "user");
                const isLastMessage = index === messages.length - 1;

                return (
                  <div
                    key={message.id}
                    ref={isLatestUserMessage ? lastUserMessageRef : undefined}
                    style={isLastMessage && lastMsgMinHeight ? { minHeight: lastMsgMinHeight } : undefined}
                    className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}
                  >
	                    {message.role === "assistant" ? (
	                      <div className="w-full max-w-none text-sm text-foreground">
	                        <div className="space-y-4">
		                          {message.processSteps?.length
                            || message.analysisPlan?.execution_steps.length
                            || message.analysisQueries?.length
                            || message.rawDebugLogs?.length ? (
		                            <ProcessTimelineBox
                                steps={message.processSteps ?? []}
                                live={message.isStreaming}
                                analysisPlan={message.analysisPlan}
                                analysisQueries={message.analysisQueries}
                                rawDebugLogs={message.rawDebugLogs}
                              />
		                          ) : null}
	                          {message.products?.length ? (
	                            <GenieStoreProductCards products={message.products} />
	                          ) : null}
	                          {message.webImages?.length ? (
	                            <GenieWebImageCards images={message.webImages} />
	                          ) : null}
	                          {message.customerProfile ? (
	                            <LightspeedCustomerProfileCard profile={message.customerProfile} />
	                          ) : null}
	                          {message.workorders?.workorders.length ? (
	                            <LightspeedWorkorderCards payload={message.workorders} fullWidth />
	                          ) : null}
		                          {message.gmailEmails && message.gmailEmails.ui_mode !== "hidden" ? (
	                            <GmailEmailSearchCard payload={message.gmailEmails} />
	                          ) : null}
	                          {message.gmailConnect ? (
	                            <GmailConnectCard
	                              payload={message.gmailConnect}
	                              onConnected={() => setGmailConnectBanner(null)}
	                            />
	                          ) : null}
	                          {message.charts?.map((chart, index) => (
	                            <GenieChart
	                              key={`${chart.title}-${index}`}
	                              chart={chart}
	                            />
	                          ))}
	                          {message.pivotTables?.map((table, index) => (
	                            <GeniePivotTable
	                              key={`${table.title}-pivot-${index}`}
	                              table={table}
	                            />
	                          ))}
	                          {message.tables?.map((table, index) => (
	                            <GenieDataTable
	                              key={`${table.title}-${index}`}
	                              table={table}
	                            />
	                          ))}
	                          <AssistantMessageContent content={message.content} />
	                          {!message.isStreaming
	                            ? message.proposals?.map((proposal, proposalIndex) => (
	                                <GenieProposalCard key={`${proposal.kind}-${proposalIndex}`} proposal={proposal} />
	                              ))
	                            : null}
	                        </div>
                        {message.error && (
                          <p className="mt-2 text-sm font-medium text-destructive">{message.error}</p>
                        )}
                      </div>
                    ) : (
                      <div className="max-w-[86%] rounded-[24px] bg-primary px-4 py-2 text-sm leading-snug text-primary-foreground shadow-sm sm:max-w-[78%]">
                        <span className="whitespace-pre-wrap">{message.content}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent px-5 pb-4 pt-6">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-2 flex justify-start">
                <ConversationHistoryDropdown
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelect={loadConversation}
                  showNewChat
                  onNewChat={startNewChat}
                />
              </div>

              <PromptQueueList
                items={queuedPrompts}
                onUpdate={updateQueuedPrompt}
                onDelete={deleteQueuedPrompt}
              />

              <HomeV2ChatInput
                compact
                value={input}
                isRunning={isLoading}
                onChange={setInput}
                onSubmit={() => submitPrompt()}
                onStop={stopGeneration}
                endAccessory={gmailConnectAccessory}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
