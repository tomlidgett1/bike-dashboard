"use client";

import * as React from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, History, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GenieChart } from "@/components/genie/genie-chart";
import { GenieDataTable } from "@/components/genie/genie-data-table";
import { GeniePivotTable } from "@/components/genie/genie-pivot-table";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { GenieIntegrationAvatars } from "@/components/genie/genie-integration-avatars";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";
import { GenieProposalCard } from "@/components/genie/genie-proposal-card";
import { LightspeedWorkorderCards } from "@/components/genie/lightspeed-workorder-cards";
import { LightspeedCustomerProfileCard } from "@/components/genie/lightspeed-customer-profile-card";
import { GmailConnectCard } from "@/components/genie/gmail-connect-card";
import { XeroConnectPill } from "@/components/genie/xero-connect-pill";
import { DeputyConnectPill } from "@/components/genie/deputy-connect-pill";
import { SupplierInvoicePill } from "@/components/genie/supplier-invoice-pill";
import { GenieStoreProductCards } from "@/components/genie/genie-store-product-cards";
import { GenieWebImageCards } from "@/components/genie/genie-web-image-cards";
import type { GenieWebImagePreview } from "@/lib/genie/web-image-search";
import {
  GenieRawLogsViewer,
  GenieThinkingDetailSections,
} from "@/components/genie/genie-thinking-detail-sections";
import type { GenieStoreProductPreview } from "@/lib/genie/store-product-previews";
import { HomeV2MetricsCards } from "@/components/settings/homev2-metrics-cards";
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
  GenieCustomerProfilePayload,
  GenieProposal,
  GenieRawDebugLogEntry,
  GenieWorkorderCardsPayload,
  GmailEmailsPayload,
  GmailConnectPayload,
} from "@/lib/types/genie-agent";
import {
  HOMEV2_CONVERSATION_QUERY,
  consumeHomeV2PendingPrompt,
} from "@/lib/genie/homev2-navigation";
import {
  type HomeV2SavedConversation,
  buildMinimalHomeV2Conversation,
  conversationHasAssistantBody,
  homeConversationTitle,
  mapApiConversationToSaved,
  mergeCompletedJobIntoConversation,
  normalizeMessageContent,
  readConversationHistory,
  sanitizeStoredMessages,
  writeConversationHistory,
} from "@/lib/genie/homev2-conversation-storage";
import type { GenieJob } from "@/lib/genie/genie-job-types";
import { useSearchParams } from "next/navigation";
import { compactGenieProgressText, liveGenieProgressPreview } from "@/lib/genie/progress-text";
import {
  GenieProgressBrandIcon,
  resolveGenieProgressBrand,
} from "@/components/genie/genie-progress-brand";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
import { useGenieJobs } from "@/components/providers/genie-jobs-provider";
import {
  isGenieJobRunning,
  mergeGenieJobIntoAssistantMessage,
} from "@/lib/genie/sync-genie-job-message";
import type {
  GenieChartPayload,
  GenieTablePayload,
} from "@/lib/genie/visual-payloads";

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
  backgroundJobId?: string;
  turnId?: string;
}

interface ChatTurn {
  turnId: string;
  user: ChatMessage;
  assistants: ChatMessage[];
}

function buildChatTurns(messages: ChatMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let current: ChatTurn | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      current = {
        turnId: message.turnId ?? message.id,
        user: message,
        assistants: [],
      };
      turns.push(current);
      continue;
    }

    if (current) {
      current.assistants.push(message);
    }
  }

  return turns;
}

function enrichAssistantFromJob(target: ChatMessage, merged: ChatMessage, job: GenieJob): ChatMessage {
  let next: ChatMessage = { ...merged };

  const jobLogs = job.metadata.raw_debug_logs;
  if (jobLogs?.length) {
    next = { ...next, rawDebugLogs: jobLogs };
  }

  if (isGenieJobRunning(job) && job.message) {
    const step = createProcessStep(job.progressPhase ?? "thinking", job.message);
    next = {
      ...next,
      processSteps: appendProcessStep(target.processSteps ?? next.processSteps, step),
    };
  }

  const reasoningSummary = next.reasoningSummary?.trim() ?? "";
  if (reasoningSummary) {
    const reasoningPhase = reasoningSummary.startsWith("- ") ? "planning" : "thinking";
    next = {
      ...next,
      processSteps: upsertLiveReasoningStep(
        next.processSteps,
        createProcessStep(reasoningPhase, reasoningSummary, "reasoning"),
      ),
    };
  }

  return next;
}

function AssistantResponseBody({
  message,
  onGmailConnected,
}: {
  message: ChatMessage;
  onGmailConnected?: () => void;
}) {
  return (
    <div className="w-full text-sm text-foreground">
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
        {message.gmailConnect ? (
          <GmailConnectCard
            payload={message.gmailConnect}
            onConnected={onGmailConnected}
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
  );
}

function ChatTurnView({
  turn,
  isLatestTurn,
  lastMsgMinHeight,
  lastUserMessageRef,
  onGmailConnected,
}: {
  turn: ChatTurn;
  isLatestTurn: boolean;
  lastMsgMinHeight?: number;
  lastUserMessageRef?: React.Ref<HTMLDivElement>;
  onGmailConnected?: () => void;
}) {
  const assistant = turn.assistants[0];

  return (
    <div
      style={isLatestTurn && lastMsgMinHeight ? { minHeight: lastMsgMinHeight } : undefined}
      className="space-y-4"
    >
      <div ref={lastUserMessageRef} className="flex justify-end">
        <div className="max-w-[86%] rounded-[24px] bg-primary px-4 py-2 text-sm leading-snug text-primary-foreground shadow-sm sm:max-w-[78%]">
          <span className="whitespace-pre-wrap">{turn.user.content}</span>
        </div>
      </div>

      {assistant ? (
        <div className="flex justify-start">
          <AssistantResponseBody message={assistant} onGmailConnected={onGmailConnected} />
        </div>
      ) : null}
    </div>
  );
}

interface QueuedPrompt {
  id: string;
  text: string;
}

const APP_HEADER_OFFSET_PX = 57;

const THINKING_SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(90deg, #9ca3af 0%, #9ca3af 35%, #111827 50%, #9ca3af 65%, #9ca3af 100%)",
  backgroundSize: "220% 100%",
  // Force a transparent text fill so the moving gradient shows through bg-clip-text.
  // Without this, a competing text-* color utility wins the cascade and the
  // shimmer silently renders as flat gray.
  color: "transparent",
  WebkitTextFillColor: "transparent",
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
  invoice: "Invoice",
  invoice_done: "Invoice",
  xero: "Xero",
  xero_done: "Xero",
  deputy: "Deputy",
  deputy_done: "Deputy",
  verifying: "Quality check",
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
  const normalized = normalizeMessageContent(content);
  if (!normalized.trim()) return null;

  return (
    <div className="max-w-3xl text-[15px] leading-relaxed" dir="ltr" style={{ unicodeBidi: "isolate" }}>
      <div
        className="[&>p+p]:mt-2 [&_strong]:font-semibold"
        dangerouslySetInnerHTML={{ __html: renderGenieMarkdown(normalized) }}
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

  if (visibleSteps.length === 0 && !hasAnalysis && !(rawDebugLogs?.length)) return null;

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
              ? "bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite]"
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
  conversations: HomeV2SavedConversation[];
  activeConversationId: string | null;
  onSelect: (conversation: HomeV2SavedConversation) => void;
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
  const searchParams = useSearchParams();
  const { jobs, startAgentBackgroundJob, cancelJob } = useGenieJobs();
  const appliedGenieJobsRef = React.useRef(new Set<string>());
  const lastOpenedConversationRef = React.useRef<{ id: string; complete: boolean } | null>(null);
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [conversations, setConversations] = React.useState<HomeV2SavedConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [composioSessionIds, setComposioSessionIds] = React.useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = React.useState(false);
  const [queuedPrompts, setQueuedPrompts] = React.useState<QueuedPrompt[]>([]);
  const [lastMsgMinHeight, setLastMsgMinHeight] = React.useState<number | undefined>(undefined);
  const [gmailConnectBanner, setGmailConnectBanner] = React.useState<GmailConnectPayload | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const lastUserMessageRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const messagesRef = React.useRef<ChatMessage[]>([]);
  const activeConversationIdRef = React.useRef<string | null>(null);
  const composioSessionIdsRef = React.useRef<Record<string, string>>({});
  const isLoadingRef = React.useRef(false);
  const jobsRef = React.useRef(jobs);
  const stopRequestedAssistantIdsRef = React.useRef(new Set<string>());
  const runSendRef = React.useRef<(text: string, clearInputField?: boolean) => Promise<void>>(async () => {});
  const consumedPendingPromptRef = React.useRef(false);
  const hasStarted = messages.length > 0;

  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  React.useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  React.useEffect(() => {
    composioSessionIdsRef.current = composioSessionIds;
  }, [composioSessionIds]);

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
    const persistedMessages = messages;
    const nextConversation: HomeV2SavedConversation = {
      id,
      title: homeConversationTitle(persistedMessages),
      updatedAt: new Date().toISOString(),
      messages: sanitizeStoredMessages(
        persistedMessages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          charts: message.charts,
          tables: message.tables,
          pivotTables: message.pivotTables,
          proposals: message.proposals,
          products: message.products,
          webImages: message.webImages,
          workorders: message.workorders,
          customerProfile: message.customerProfile,
          gmailEmails: message.gmailEmails,
          analysisPlan: message.analysisPlan,
          analysisQueries: message.analysisQueries,
          isStreaming: message.isStreaming,
          error: message.error,
        })),
      ),
      composioSessionIds,
    };

    setActiveConversationId(id);
    setConversations((current) => {
      const next = [nextConversation, ...current.filter((conversation) => conversation.id !== id)].slice(0, 20);
      writeConversationHistory(next);
      return next;
    });
  }, [activeConversationId, composioSessionIds, messages]);

  const startNewChat = React.useCallback(() => {
    abortRef.current?.abort();
    clearPromptQueue();
    setInput("");
    setMessages([]);
    setLastMsgMinHeight(undefined);
    setComposioSessionIds({});
    composioSessionIdsRef.current = {};
    setActiveConversationId(null);
    activeConversationIdRef.current = null;
    isLoadingRef.current = false;
    setIsLoading(false);
  }, [clearPromptQueue]);

  const loadConversation = React.useCallback((conversation: HomeV2SavedConversation) => {
    abortRef.current?.abort();
    clearPromptQueue();
    setInput("");
    setMessages(
      sanitizeStoredMessages(conversation.messages).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        charts: message.charts as ChatMessage["charts"],
        tables: message.tables as ChatMessage["tables"],
        pivotTables: message.pivotTables as ChatMessage["pivotTables"],
        proposals: message.proposals as ChatMessage["proposals"],
        products: message.products as ChatMessage["products"],
        webImages: message.webImages as ChatMessage["webImages"],
        workorders: message.workorders as ChatMessage["workorders"],
        customerProfile: message.customerProfile as ChatMessage["customerProfile"],
        gmailEmails: message.gmailEmails as ChatMessage["gmailEmails"],
        analysisPlan: message.analysisPlan as ChatMessage["analysisPlan"],
        analysisQueries: message.analysisQueries as ChatMessage["analysisQueries"],
        isStreaming: false,
        error: message.error,
      })),
    );
    setComposioSessionIds(conversation.composioSessionIds ?? {});
    composioSessionIdsRef.current = conversation.composioSessionIds ?? {};
    setLastMsgMinHeight(undefined);
    setActiveConversationId(conversation.id);
    activeConversationIdRef.current = conversation.id;
    isLoadingRef.current = false;
    setIsLoading(false);
  }, [clearPromptQueue]);

  React.useEffect(() => {
    const requestedId = searchParams.get(HOMEV2_CONVERSATION_QUERY)?.trim();
    if (!requestedId) return;

    const conversationJobs = jobs.filter(
      (job) => job.conversationId === requestedId && job.metadata.source === "homev2",
    );
    const matchingJob =
      conversationJobs.find(
        (job) => job.status === "completed" && job.result?.assistantMessage,
      ) ??
      conversationJobs.find((job) => job.status === "queued" || job.status === "running");

    const lastOpened = lastOpenedConversationRef.current;
    if (lastOpened?.id === requestedId && lastOpened.complete) return;
    if (
      lastOpened?.id === requestedId &&
      !lastOpened.complete &&
      matchingJob &&
      matchingJob.status !== "completed"
    ) {
      return;
    }

    const openResolvedConversation = (conversation: HomeV2SavedConversation) => {
      const isComplete = conversationHasAssistantBody(conversation);
      lastOpenedConversationRef.current = { id: requestedId, complete: isComplete };
      setConversations((current) => {
        const next = [
          conversation,
          ...current.filter((entry) => entry.id !== conversation.id),
        ].slice(0, 20);
        writeConversationHistory(next);
        return next;
      });
      loadConversation(conversation);
    };

    const resolveConversation = async (job?: GenieJob) => {
      const cached = readConversationHistory().find((conversation) => conversation.id === requestedId);
      let conversation: HomeV2SavedConversation | null = null;

      try {
        const response = await fetch(`/api/genie/conversations/${requestedId}`);
        if (response.ok) {
          const data = (await response.json()) as {
            id: string;
            title?: string;
            messages?: unknown[];
            created_at?: string;
          };
          conversation = mapApiConversationToSaved(
            data,
            job?.metadata.composio_session_ids,
          );
        }
      } catch {
        // Fall back to cached conversation below.
      }

      if (!conversation && cached) {
        conversation = cached;
      }

      if (!conversation && job) {
        conversation = buildMinimalHomeV2Conversation(job);
      }

      if (!conversation) return null;

      conversation = {
        ...conversation,
        messages: sanitizeStoredMessages(conversation.messages),
      };

      if (job?.status === "completed" && job.result?.assistantMessage) {
        conversation = mergeCompletedJobIntoConversation(conversation, job);
      }

      return conversation;
    };

    let cancelled = false;
    void resolveConversation(matchingJob).then((conversation) => {
      if (cancelled || !conversation) return;
      openResolvedConversation(conversation);
    });

    return () => {
      cancelled = true;
    };
  }, [searchParams, loadConversation, jobs]);

  React.useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const collectCancellableJobIds = React.useCallback((currentMessages: ChatMessage[]) => {
    const jobIds = new Set<string>();
    const streamingAssistantIds = new Set(
      currentMessages
        .filter((message) => message.role === "assistant" && message.isStreaming)
        .map((message) => message.id),
    );

    for (const message of currentMessages) {
      if (message.backgroundJobId && message.isStreaming) {
        jobIds.add(message.backgroundJobId);
      }
    }

    for (const job of jobsRef.current) {
      const assistantId = job.metadata.client_assistant_id;
      if (!assistantId || !streamingAssistantIds.has(assistantId)) continue;
      if (isGenieJobRunning(job)) {
        jobIds.add(job.id);
      }
    }

    return jobIds;
  }, []);

  const stopGeneration = React.useCallback(() => {
    abortRef.current?.abort();

    const streamingAssistants = messagesRef.current.filter(
      (message) => message.role === "assistant" && message.isStreaming,
    );
    for (const message of streamingAssistants) {
      stopRequestedAssistantIdsRef.current.add(message.id);
    }

    for (const jobId of collectCancellableJobIds(messagesRef.current)) {
      void cancelJob(jobId);
    }

    flushSync(() => {
      const next = messagesRef.current.map((message) =>
        stopRequestedAssistantIdsRef.current.has(message.id)
          ? {
              ...message,
              isStreaming: false,
              status: undefined,
              statusPhase: undefined,
            }
          : message,
      );
      messagesRef.current = next;
      setMessages(next);
      const stillStreaming = next.some((message) => message.isStreaming);
      isLoadingRef.current = stillStreaming;
      setIsLoading(stillStreaming);
    });
  }, [cancelJob, collectCancellableJobIds]);

  React.useEffect(() => {
    if (stopRequestedAssistantIdsRef.current.size === 0) return;
    for (const jobId of collectCancellableJobIds(messagesRef.current)) {
      void cancelJob(jobId);
    }
  }, [jobs, cancelJob, collectCancellableJobIds]);

  React.useEffect(() => {
    for (const job of jobs) {
      const assistantId = job.metadata.client_assistant_id;
      if (!assistantId) continue;

      if (job.status === "completed" || job.status === "failed") {
        if (appliedGenieJobsRef.current.has(job.id)) continue;
        appliedGenieJobsRef.current.add(job.id);
      }

      setMessages((current) => {
        const target = current.find((message) => message.id === assistantId);
        if (!target) return current;
        let merged = enrichAssistantFromJob(
          target,
          mergeGenieJobIntoAssistantMessage(target, job) as ChatMessage,
          job,
        );
        if (
          target.status === merged.status &&
          target.content === merged.content &&
          target.isStreaming === merged.isStreaming &&
          target.error === merged.error &&
          target.processSteps?.length === merged.processSteps?.length &&
          target.rawDebugLogs?.length === merged.rawDebugLogs?.length &&
          target.reasoningSummary === merged.reasoningSummary &&
          target.analysisPlan === merged.analysisPlan &&
          target.analysisQueries?.length === merged.analysisQueries?.length
        ) {
          return current;
        }
        const next = current.map((message) => (message.id === assistantId ? merged : message));
        messagesRef.current = next;
        return next;
      });

      if (job.metadata.composio_session_ids) {
        setComposioSessionIds((current) => {
          const next = { ...current, ...job.metadata.composio_session_ids };
          composioSessionIdsRef.current = next;
          return next;
        });
      }
    }
  }, [jobs]);

  React.useEffect(() => {
    const streaming = messages.some((message) => message.isStreaming);
    if (isLoadingRef.current === streaming) return;
    isLoadingRef.current = streaming;
    setIsLoading(streaming);
    if (!streaming) {
      processPromptQueue();
    }
  }, [messages, processPromptQueue]);

  const runSend = React.useCallback(async (text: string, clearInputField = true) => {
    const trimmed = text.trim();
    if (!trimmed || isLoadingRef.current) return;

    stopRequestedAssistantIdsRef.current.clear();

    const turnId = crypto.randomUUID();
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      turnId,
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
      turnId,
    };

    const conversationId = activeConversationIdRef.current ?? crypto.randomUUID();
    if (!activeConversationIdRef.current) {
      activeConversationIdRef.current = conversationId;
    }

    const nextMessages = [...messagesRef.current, userMessage];
    const containerHeight =
      scrollRef.current?.clientHeight ??
      (typeof window === "undefined" ? 0 : Math.max(360, window.innerHeight - 180));

    flushSync(() => {
      const updatedMessages = [...nextMessages, assistantMessage];
      messagesRef.current = updatedMessages;
      setLastMsgMinHeight(containerHeight);
      setMessages(updatedMessages);
      setActiveConversationId(conversationId);
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

    const serializedMessages = nextMessages.map((message) => ({
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
    }));

    const startAssistantJob = async (assistantId: string) => {
      const jobId = await startAgentBackgroundJob({
        messages: serializedMessages,
        prompt: trimmed,
        conversationId,
        composioSessionIds: composioSessionIdsRef.current,
        clientAssistantId: assistantId,
        source: "homev2",
        modelProfile: "default",
      });

      if (jobId) {
        if (stopRequestedAssistantIdsRef.current.has(assistantId)) {
          void cancelJob(jobId);
          setMessages((current) => current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  backgroundJobId: jobId,
                  isStreaming: false,
                  status: undefined,
                  statusPhase: undefined,
                }
              : message
          ));
          return;
        }

        setMessages((current) => current.map((message) =>
          message.id === assistantId
            ? { ...message, backgroundJobId: jobId }
            : message
        ));
      }
    };

    try {
      await startAssistantJob(assistantId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to start Genie.";
      setMessages((current) => current.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              isStreaming: false,
              status: undefined,
              error: errorMessage,
            }
          : message
      ));
    } finally {
      flushSync(() => {
        setMessages((current) => {
          messagesRef.current = current;
          return current;
        });
      });
    }
  }, [startAgentBackgroundJob, cancelJob]);

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

  const [isDraggingPdf, setIsDraggingPdf] = React.useState(false);
  const [isUploadingInvoice, setIsUploadingInvoice] = React.useState(false);
  const dragDepthRef = React.useRef(0);

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

  // Upload a dropped/picked PDF, then ask the Genie to turn it into a
  // Lightspeed purchase order — auto-recognised, no typing needed.
  const uploadInvoicePdf = React.useCallback(async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf || isUploadingInvoice) return;
    setIsUploadingInvoice(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/store/supplier-invoices/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; invoice_id?: string; filename?: string; error?: string }
        | null;
      if (!response.ok || !data?.ok || !data.invoice_id) {
        submitPrompt(`I tried to upload a supplier invoice PDF ("${file.name}") but it failed${data?.error ? `: ${data.error}` : ""}. Let me know what to do.`);
        return;
      }
      window.dispatchEvent(new Event("supplier-invoice-uploaded"));
      submitPrompt(
        `Process the supplier invoice from the uploaded PDF "${data.filename ?? file.name}" (invoice id: ${data.invoice_id}) — extract all the details and create a Lightspeed purchase order from it.`,
      );
    } finally {
      setIsUploadingInvoice(false);
    }
  }, [isUploadingInvoice, submitPrompt]);

  const dragHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingPdf(true);
    },
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingPdf(false);
    },
    onDrop: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes("Files")) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingPdf(false);
      const file = Array.from(event.dataTransfer.files).find(
        (candidate) => candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf"),
      );
      if (file) void uploadInvoicePdf(file);
    },
  };

  const gmailConnectAccessory = gmailConnectBanner ? (
    <GmailConnectCard
      payload={gmailConnectBanner}
      variant="inline"
      onConnected={() => setGmailConnectBanner(null)}
    />
  ) : null;

  return (
    <div
      {...dragHandlers}
      className="relative flex h-[calc(100svh-57px)] flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]"
    >
      {isDraggingPdf ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-gray-400 bg-white px-8 py-6 text-center shadow-xl">
            <p className="text-sm font-semibold text-foreground">Drop the invoice PDF</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Genie will read it and stage a Lightspeed purchase order
            </p>
          </div>
        </div>
      ) : null}
      {isUploadingInvoice ? (
        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-md">
          Uploading invoice…
        </div>
      ) : null}
      {!hasStarted ? (
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-7 px-6 py-10">
          <h1 className="max-w-2xl text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Welcome, today is {todayLabel}
          </h1>

          <HomeV2MetricsCards />

          <div className="w-full max-w-3xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <ConversationHistoryDropdown
                conversations={conversations}
                activeConversationId={activeConversationId}
                onSelect={loadConversation}
              />
              <div className="flex items-center gap-1.5">
                <SupplierInvoicePill onProcess={(prompt) => submitPrompt(prompt)} />
                <XeroConnectPill />
                <DeputyConnectPill />
                <GenieIntegrationAvatars />
              </div>
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
              onFileSelected={(file) => void uploadInvoicePdf(file)}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
              {buildChatTurns(messages).map((turn, index, turns) => {
                const isLatestTurn = index === turns.length - 1;
                return (
                  <ChatTurnView
                    key={turn.turnId}
                    turn={turn}
                    isLatestTurn={isLatestTurn}
                    lastMsgMinHeight={isLatestTurn ? lastMsgMinHeight : undefined}
                    lastUserMessageRef={isLatestTurn ? lastUserMessageRef : undefined}
                    onGmailConnected={() => setGmailConnectBanner(null)}
                  />
                );
              })}
            </div>
          </div>

          <div className="relative z-20 shrink-0 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent px-5 pb-4 pt-6">
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-2 flex items-center justify-between gap-2">
                <ConversationHistoryDropdown
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelect={loadConversation}
                  showNewChat
                  onNewChat={startNewChat}
                />
                <div className="flex items-center gap-1.5">
                  <SupplierInvoicePill onProcess={(prompt) => submitPrompt(prompt)} />
                  <XeroConnectPill />
                  <DeputyConnectPill />
                  <GenieIntegrationAvatars />
                </div>
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
                onFileSelected={(file) => void uploadInvoicePdf(file)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
