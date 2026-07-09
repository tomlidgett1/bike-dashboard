"use client";

import * as React from "react";
import { createPortal, flushSync } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, History, Pencil, Plus, ScanSearch, Sparkles, ThumbsDown, ThumbsUp, Trash2, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";
import { GenieChart } from "@/components/genie/genie-chart";
import { GenieDataTable } from "@/components/genie/genie-data-table";
import { GeniePivotTable } from "@/components/genie/genie-pivot-table";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { GenieIntegrationAvatars } from "@/components/genie/genie-integration-avatars";
import { GenieLessonsModal } from "@/components/genie/genie-lessons-panel";
import { DeepResearchReport, isDeepResearchReport } from "@/components/genie/deep-research-report";
import {
  extractPdfSendRecipient,
  isGeniePdfRequest,
} from "@/lib/genie/pdf-request";
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
import { HomePageQuietLayout } from "@/components/settings/home-page-design-explorer";
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
  HOMEV2_PROMPT_EVENT,
  consumeHomeV2PendingPrompt,
  homeConversationUrl,
} from "@/lib/genie/homev2-navigation";
import {
  type HomeV2SavedConversation,
  type HomeV2StoredMessage,
  buildHomeV2ConversationSnapshot,
  buildMinimalHomeV2Conversation,
  conversationHasAssistantBody,
  fetchConversationListFromApi,
  mapApiConversationToSaved,
  mergeCompletedJobIntoConversation,
  mergeConversationLists,
  normalizeMessageContent,
  readConversationHistory,
  sanitizeStoredMessages,
  saveConversationToApi,
  syncLocalConversationsToApi,
  upsertHomeV2ConversationDraft,
  writeConversationHistory,
} from "@/lib/genie/homev2-conversation-storage";
import type { GenieJob } from "@/lib/genie/genie-job-types";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GenieProgressBrandIcon,
  resolveGenieProgressBrand,
} from "@/components/genie/genie-progress-brand";
import { renderGenieMarkdown } from "@/lib/genie/render-markdown";
import {
  compactGenieProgressText,
  liveGenieDisplayStep,
  liveGenieProgressPreview,
  liveGenieSubCommentary,
} from "@/lib/genie/progress-text";
import { useGenieJobs } from "@/components/providers/genie-jobs-provider";
import {
  ensureAssistantMessageForJob,
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
  sourceText?: string;
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
  suggestedPrompts?: Array<{ label: string; prompt: string }>;
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

function processStepsFromJobProgress(job: GenieJob): ProcessStep[] | null {
  const records = job.metadata.progress_steps;
  if (!records?.length) return null;
  return records.map((record, index) => ({
    id: `job-${job.id}-step-${index}`,
    phase: record.phase,
    text: normalizeStartupStatusText(record.text, record.phase),
    sourceText: record.text,
    kind: "status" as const,
    at: record.at,
  }));
}

function enrichAssistantFromJob(target: ChatMessage, merged: ChatMessage, job: GenieJob): ChatMessage {
  let next: ChatMessage = { ...merged };

  const jobLogs = job.metadata.raw_debug_logs;
  if (jobLogs?.length) {
    next = { ...next, rawDebugLogs: jobLogs };
  }

  const fromProgress = processStepsFromJobProgress(job);
  if (fromProgress?.length) {
    next = { ...next, processSteps: fromProgress };
  } else if (isGenieJobRunning(job) && job.message) {
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

function chatMessagesToStored(messages: ChatMessage[]): HomeV2StoredMessage[] {
  return sanitizeStoredMessages(
    messages.map((message) => ({
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
  );
}

function storedMessagesToChatMessage(message: HomeV2StoredMessage): ChatMessage {
  return {
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
  };
}

function hydrateChatMessagesForConversation(
  messages: HomeV2StoredMessage[],
  conversationJobs: GenieJob[],
): ChatMessage[] {
  const runningJob =
    conversationJobs.find((job) => isGenieJobRunning(job)) ??
    [...conversationJobs].sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    )[0];

  let base = sanitizeStoredMessages(messages);
  if (runningJob) {
    base = ensureAssistantMessageForJob(base, runningJob);
  }

  return base.map((message) => {
    const chatMessage = storedMessagesToChatMessage(message);
    if (!runningJob) return chatMessage;

    const assistantId = runningJob.metadata.client_assistant_id;
    if (!assistantId || message.id !== assistantId) return chatMessage;

    return enrichAssistantFromJob(
      chatMessage,
      mergeGenieJobIntoAssistantMessage(chatMessage, runningJob) as ChatMessage,
      runningJob,
    );
  });
}

function firstMarkdownHeading(content: string): string | null {
  const match = content.match(/^\s*#{1,2}\s+(.+?)\s*(?:\r?\n|$)/);
  return match?.[1]
    ?.replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim() || null;
}

function stripLeadingMarkdownHeading(content: string): string {
  return content.replace(/^\s*#{1,2}\s+.+?\r?\n+/, "");
}

function AssistantResponseBody({
  message,
  onGmailConnected,
  onGmailConnectNeeded,
  question,
  showFollowups,
  onAsk,
}: {
  message: ChatMessage;
  onGmailConnected?: () => void;
  onGmailConnectNeeded?: () => void;
  question?: string;
  showFollowups?: boolean;
  onAsk?: (text: string) => void;
}) {
  const answerText = normalizeMessageContent(message.content);
  const answerSettled = Boolean(!message.isStreaming && !message.error && answerText.trim().length > 0);
  const isReport = answerSettled && isDeepResearchReport(message.content);
  const isPdfAnswer = answerSettled && !isReport && isGeniePdfRequest(question);
  const pdfTitle = isPdfAnswer ? firstMarkdownHeading(answerText) ?? "Yellow Jersey Genie Report" : "";
  const pdfSendToEmail =
    answerSettled && (isPdfAnswer || isReport) ? extractPdfSendRecipient(question) : null;
  const canShowFeedback = Boolean(answerSettled && question && !isReport);
  const canShowFollowups = Boolean(
    showFollowups &&
      onAsk &&
      question &&
      answerSettled &&
      answerText.trim().length > 24 &&
      !message.suggestedPrompts?.length,
  );
  return (
    <div className="genie-chat-selectable w-full min-w-0 overflow-x-hidden text-sm text-foreground">
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
        {isReport ? (
          <DeepResearchReport
            content={message.content}
            charts={message.charts}
            tables={message.tables}
            pivotTables={message.pivotTables}
            sendToEmail={pdfSendToEmail}
            sourceQuestion={question}
            onGmailConnectNeeded={onGmailConnectNeeded}
          />
        ) : isPdfAnswer ? (
          <DeepResearchReport
            content={firstMarkdownHeading(answerText) ? stripLeadingMarkdownHeading(message.content) : message.content}
            charts={message.charts}
            tables={message.tables}
            pivotTables={message.pivotTables}
            title={pdfTitle}
            toolbarLabel="PDF report"
            subtitle="Generated from your Genie request."
            footerText="Generated by Yellow Jersey Genie · PDF report. Verify material figures before acting."
            sendToEmail={pdfSendToEmail}
            sourceQuestion={question}
            onGmailConnectNeeded={onGmailConnectNeeded}
          />
        ) : (
          <>
            <AssistantMessageContent content={message.content} streaming={message.isStreaming} />
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
          </>
        )}
        {!message.isStreaming
          ? message.proposals?.map((proposal, proposalIndex) => (
              <GenieProposalCard key={`${proposal.kind}-${proposalIndex}`} proposal={proposal} />
            ))
          : null}
        {canShowFeedback ? (
          <AnswerFeedback messageId={message.id} question={question!} answer={answerText} />
        ) : null}
        {message.suggestedPrompts?.length && onAsk ? (
          <SuggestedPromptChips prompts={message.suggestedPrompts} onAsk={onAsk} />
        ) : null}
        {canShowFollowups ? (
          <FollowupChips
            messageId={message.id}
            question={question!}
            answer={answerText}
            onAsk={onAsk!}
          />
        ) : null}
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
  onGmailConnectNeeded,
  onAsk,
}: {
  turn: ChatTurn;
  isLatestTurn: boolean;
  lastMsgMinHeight?: number;
  lastUserMessageRef?: React.Ref<HTMLDivElement>;
  onGmailConnected?: () => void;
  onGmailConnectNeeded?: () => void;
  onAsk?: (text: string) => void;
}) {
  const assistant = turn.assistants[0];

  return (
    <div
      style={isLatestTurn && lastMsgMinHeight ? { minHeight: lastMsgMinHeight } : undefined}
      className="space-y-4"
    >
      <div ref={lastUserMessageRef} className="flex justify-end">
        <div className="genie-chat-selectable genie-chat-bubble-user max-w-[86%] cursor-text rounded-[24px] bg-primary px-4 py-2 text-sm leading-snug text-primary-foreground shadow-sm sm:max-w-[78%]">
          <span className="whitespace-pre-wrap">{turn.user.content}</span>
        </div>
      </div>

      {assistant ? (
        <div className="genie-chat-selectable flex justify-start">
          <AssistantResponseBody
            message={assistant}
            onGmailConnected={onGmailConnected}
            onGmailConnectNeeded={onGmailConnectNeeded}
            question={turn.user.content}
            showFollowups={isLatestTurn}
            onAsk={onAsk}
          />
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

/**
 * Short, human label for the collapsed live status line (the shimmer the store
 * sees while Genie works). Prefers the concrete tool/phase status; for raw model
 * reasoning, shows the first clause of the current thought instead of a dead
 * "Thinking…". Never the same generic word for the whole run.
 */
function liveHeaderLabel(step: ProcessStep | undefined): string {
  if (!step) return "Getting started";
  if (step.kind === "reasoning") {
    const firstLine = step.text
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .find((line) => line.length > 0);
    if (firstLine) {
      const clipped =
        firstLine.length > 112 ? `${firstLine.slice(0, 111).trimEnd()}…` : firstLine;
      return clipped;
    }
    return "Thinking it through";
  }
  return liveGenieProgressPreview(
    step.sourceText || step.text || PHASE_LABELS[step.phase] || "Working",
    step.phase,
  );
}

function progressBrandText(step: ProcessStep): string {
  return step.sourceText ?? step.text;
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
  const trimmed = text.trim();
  return {
    id: processStepId(),
    phase,
    text: kind === "status" ? normalizeStartupStatusText(trimmed, phase) : trimmed,
    sourceText: kind === "status" ? trimmed : undefined,
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

// Invisible separator (U+2063) appended while streaming so the caret can be
// placed inline at the very end of the last rendered line (survives HTML escaping).
const TYPEWRITER_CARET_SENTINEL = String.fromCharCode(0x2063);

/**
 * Reveals streamed text word-by-word so bursty ~100ms network flushes read as
 * steady typing. Catches up fast when far behind, then idles. Non-streaming
 * (historical) messages render in full immediately.
 */
function useTypewriter(target: string, active: boolean): { text: string; typing: boolean } {
  const [shownLen, setShownLen] = React.useState(active ? 0 : target.length);
  const shownLenRef = React.useRef(shownLen);
  const frameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    shownLenRef.current = shownLen;
  }, [shownLen]);

  React.useEffect(() => {
    if (!active) {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (shownLenRef.current !== target.length) {
        shownLenRef.current = target.length;
        setShownLen(target.length);
      }
      return;
    }
    const step = () => {
      const remaining = target.length - shownLenRef.current;
      if (remaining <= 0) {
        frameRef.current = null;
        return;
      }
      const delta = Math.max(2, Math.round(remaining / 6));
      const nextLen = Math.min(target.length, shownLenRef.current + delta);
      shownLenRef.current = nextLen;
      setShownLen(nextLen);
      frameRef.current = requestAnimationFrame(step);
    };
    if (frameRef.current == null) frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [target, active]);

  const revealed = Math.min(shownLen, target.length);
  const behind = revealed < target.length;
  let text = target.slice(0, revealed);
  if (active && behind) {
    // Never display a partial trailing word or markdown marker mid-reveal.
    const lastBreak = Math.max(text.lastIndexOf(" "), text.lastIndexOf("\n"));
    if (lastBreak > 0) text = text.slice(0, lastBreak);
  }
  return { text, typing: active };
}

function AssistantMessageContent({ content, streaming }: { content: string; streaming?: boolean }) {
  const normalized = normalizeMessageContent(content);
  const { text, typing } = useTypewriter(normalized, Boolean(streaming));
  if (!text.trim()) return null;

  let html = renderGenieMarkdown(typing ? text + TYPEWRITER_CARET_SENTINEL : text);
  if (typing) {
    html = html.replace(TYPEWRITER_CARET_SENTINEL, '<span class="genie-caret"></span>');
  }

  return (
    <div
      className="genie-chat-selectable genie-chat-prose w-full min-w-0 max-w-3xl cursor-text text-[15px] leading-relaxed text-gray-700"
      dir="ltr"
      style={{ unicodeBidi: "isolate" }}
    >
      <div
        className="min-w-0 [&>h1]:text-2xl [&>h1]:font-semibold [&>h1]:leading-tight [&>h1]:text-gray-900 [&>h1]:mb-3 [&>h2]:text-xl [&>h2]:font-semibold [&>h2]:text-gray-900 [&>p+p]:mt-2 [&>p:first-child]:text-[15px] [&>p:first-child]:leading-relaxed [&>p:first-child]:text-gray-700 [&_blockquote]:my-2.5 [&_h1+p]:mt-2 [&_h2+p]:mt-1.5 [&_h3+p]:mt-1 [&_p+div]:mt-3 [&_div+h2]:mt-4 [&_div+h3]:mt-3 [&_hr]:my-3 [&_strong]:font-semibold [&_strong]:text-gray-900 [&_.genie-caret]:ml-0.5 [&_.genie-caret]:inline-block [&_.genie-caret]:h-[1.05em] [&_.genie-caret]:w-[2px] [&_.genie-caret]:translate-y-[2px] [&_.genie-caret]:rounded-full [&_.genie-caret]:bg-foreground/60 [&_.genie-caret]:animate-pulse"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// Cache suggestions per assistant message so toggling latest/historical or a
// re-render never re-hits the model for the same answer.
const followupCache = new Map<string, string[]>();

function SuggestedPromptChips({
  prompts,
  onAsk,
}: {
  prompts: Array<{ label: string; prompt: string }>;
  onAsk: (text: string) => void;
}) {
  return (
    <div className="mt-3.5 flex flex-wrap gap-2">
      {prompts.map((item) => (
        <button
          key={`${item.label}-${item.prompt}`}
          type="button"
          onClick={() => onAsk(item.prompt)}
          className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * ChatGPT-style tappable follow-up questions under the most recent answer.
 * Generated once by a cheap server model from the question + answer.
 */
function FollowupChips({
  messageId,
  question,
  answer,
  onAsk,
}: {
  messageId: string;
  question: string;
  answer: string;
  onAsk: (text: string) => void;
}) {
  const [suggestions, setSuggestions] = React.useState<string[]>(
    () => followupCache.get(messageId) ?? [],
  );

  React.useEffect(() => {
    const cached = followupCache.get(messageId);
    if (cached) {
      setSuggestions(cached);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/genie/followups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, answer }),
          signal: controller.signal,
        });
        const data = res.ok ? ((await res.json()) as { suggestions?: unknown }) : { suggestions: [] };
        const items = Array.isArray(data.suggestions)
          ? data.suggestions
              .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
              .slice(0, 3)
          : [];
        followupCache.set(messageId, items);
        if (!cancelled) setSuggestions(items);
      } catch {
        // Aborted (unmounted) or network error — leave chips empty.
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [messageId, question, answer]);

  if (suggestions.length === 0) return null;

  return (
    <div className="mt-3.5 flex flex-wrap gap-2">
      {suggestions.map((text, index) => (
        <button
          key={`${index}-${text}`}
          type="button"
          onClick={() => onAsk(text)}
          className="group inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background px-3 py-1.5 text-[13px] text-foreground/80 shadow-sm transition-colors hover:border-foreground/30 hover:bg-muted/60 hover:text-foreground"
        >
          <span>{text}</span>
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      ))}
    </div>
  );
}

/**
 * 👍/👎 on an answer. Feeds the self-learning loop: 👍 reinforces what worked,
 * 👎 teaches Genie what to change. Optimistic; clicking the active thumb clears it.
 */
function AnswerFeedback({
  messageId,
  question,
  answer,
}: {
  messageId: string;
  question: string;
  answer: string;
}) {
  const [rating, setRating] = React.useState<"up" | "down" | null>(null);
  const [busy, setBusy] = React.useState(false);

  const send = async (next: "up" | "down") => {
    if (busy) return;
    const target = rating === next ? "none" : next;
    setRating(target === "none" ? null : (target as "up" | "down"));
    setBusy(true);
    try {
      await fetch("/api/genie/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, rating: target, question, answer }),
      });
    } catch {
      // Keep the optimistic state; feedback is best-effort.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-1 flex items-center gap-0.5">
      <button
        type="button"
        aria-label="Good answer"
        aria-pressed={rating === "up"}
        onClick={() => send("up")}
        className={cn(
          "rounded-md p-1 text-gray-400 transition-colors hover:bg-muted hover:text-foreground",
          rating === "up" && "text-foreground",
        )}
      >
        <ThumbsUp className={cn("h-3.5 w-3.5", rating === "up" && "fill-current")} />
      </button>
      <button
        type="button"
        aria-label="Bad answer"
        aria-pressed={rating === "down"}
        onClick={() => send("down")}
        className={cn(
          "rounded-md p-1 text-gray-400 transition-colors hover:bg-muted hover:text-foreground",
          rating === "down" && "text-foreground",
        )}
      >
        <ThumbsDown className={cn("h-3.5 w-3.5", rating === "down" && "fill-current")} />
      </button>
      {rating ? (
        <span className="ml-1 text-[11px] text-gray-400">
          {rating === "up" ? "Genie will keep doing this" : "Genie will learn from this"}
        </span>
      ) : null}
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
  const progressBrand = resolveGenieProgressBrand(step.phase, progressBrandText(step));

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
            <GenieProgressBrandIcon phase={step.phase} text={progressBrandText(step)} />
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
                className="rounded-full px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Back
              </button>
            ) : logCount > 0 ? (
              <button
                type="button"
                onClick={() => setRawLogsOpen(true)}
                className="rounded-full px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
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
  const shimmerStep = live ? (liveGenieDisplayStep(visibleSteps) ?? latestStep) : latestStep;
  const hasAnalysis = Boolean(analysisPlan?.execution_steps.length || analysisQueries?.length);

  if (visibleSteps.length === 0 && !hasAnalysis && !(rawDebugLogs?.length)) return null;

  const phaseLabel = shimmerStep ? processStepLabel(shimmerStep) : analysisPlan ? "Planning" : "Working";
  const liveBrand = shimmerStep
    ? resolveGenieProgressBrand(shimmerStep.phase, progressBrandText(shimmerStep))
    : null;
  const mainShimmerLabel = live ? liveHeaderLabel(shimmerStep) : "View thought process";
  const subCommentary = live
    ? liveGenieSubCommentary(shimmerStep, {
        mainLabel: mainShimmerLabel,
        analysisQueries,
        analysisPlan,
      })
    : null;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setPanelOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setPanelOpen(true);
          }
        }}
        className={cn(
          "inline-flex max-w-3xl cursor-pointer select-none items-start gap-2 border-0 bg-transparent p-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-gray-300 focus-visible:ring-offset-2",
          !live && "text-gray-400 hover:text-gray-600",
        )}
        aria-label="Open thinking and progress details"
      >
        {live && liveBrand ? (
          <GenieProgressBrandIcon
            phase={shimmerStep?.phase}
            text={shimmerStep ? progressBrandText(shimmerStep) : undefined}
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              "line-clamp-2 max-w-[min(100%,40rem)] text-[15px] leading-snug",
              live
                ? "bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite]"
                : "text-gray-400",
            )}
            style={live ? THINKING_SHIMMER_STYLE : undefined}
          >
            {mainShimmerLabel}
          </span>
          {subCommentary ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={subCommentary}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -2 }}
                transition={{ duration: 0.2, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="line-clamp-2 max-w-[min(100%,40rem)] text-xs leading-snug text-gray-500"
              >
                {subCommentary}
              </motion.span>
            </AnimatePresence>
          ) : null}
        </div>
      </div>

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

function HomeV2OtherDropdown({
  onDeepReview,
  onProcessInvoice,
  deepReviewDisabled,
}: {
  onDeepReview: () => void;
  onProcessInvoice: (prompt: string) => void;
  deepReviewDisabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [lessonsOpen, setLessonsOpen] = React.useState(false);
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

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-gray-100/80 hover:text-foreground",
          open && "bg-gray-100/80 text-foreground",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Other Genie actions"
      >
        <span>Other</span>
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
            className="absolute right-0 top-full z-30 mt-1.5 w-60 overflow-hidden rounded-md border border-gray-200/90 bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18)]"
          >
            <ul className="p-1" role="menu">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={deepReviewDisabled}
                  onClick={() => {
                    setOpen(false);
                    onDeepReview();
                  }}
                  title="Run a deep, ~25-minute autonomous forensic review of the whole business"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ScanSearch className="h-3.5 w-3.5 text-amber-600" />
                  Deep Review
                </button>
              </li>
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setLessonsOpen(true);
                  }}
                  title="What Genie has learned"
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-gray-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Learned
                </button>
              </li>
            </ul>
            <div className="border-t border-gray-100 p-2">
              <div className="flex flex-col gap-2">
                <SupplierInvoicePill onProcess={onProcessInvoice} />
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <XeroConnectPill />
                  <DeputyConnectPill />
                  <GenieIntegrationAvatars />
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {lessonsOpen ? <GenieLessonsModal onClose={() => setLessonsOpen(false)} /> : null}
    </div>
  );
}

function ConversationHistoryDropdown({
  conversations,
  activeConversationId,
  runningConversationIds,
  onSelect,
  showNewChat = false,
  onNewChat,
}: {
  conversations: HomeV2SavedConversation[];
  activeConversationId: string | null;
  runningConversationIds: Set<string>;
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
          className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-gray-100/80 hover:text-foreground"
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
              "inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-gray-100/80 hover:text-foreground",
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
                className="absolute left-0 top-full z-30 mt-1.5 w-60 overflow-hidden rounded-md border border-gray-200/90 bg-white shadow-[0_10px_30px_-12px_rgba(15,23,42,0.18)]"
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
                          {runningConversationIds.has(conversation.id)
                            ? "Running…"
                            : conversationTime(conversation.updatedAt)}
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
                className="shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium text-gray-800 transition-colors hover:bg-gray-100 disabled:opacity-50"
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
  const router = useRouter();
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
  const queuedPromptsRef = React.useRef<QueuedPrompt[]>([]);
  const runSendRef = React.useRef<(text: string, clearInputField?: boolean, opts?: { mode?: "deep_research" }) => Promise<void>>(async () => {});
  const consumedPendingPromptRef = React.useRef(false);
  const hasStarted = messages.length > 0;
  const runningConversationIds = React.useMemo(
    () =>
      new Set(
        jobs
          .filter((job) => isGenieJobRunning(job) && job.conversationId)
          .map((job) => job.conversationId as string),
      ),
    [jobs],
  );

  const setConversationQuery = React.useCallback(
    (conversationId: string | null) => {
      router.replace(conversationId ? homeConversationUrl(conversationId) : "/settings/store/home");
    },
    [router],
  );

  const persistConversationSnapshot = React.useCallback(
    (conversationId: string, nextMessages: ChatMessage[], sessionIds: Record<string, string>) => {
      if (!nextMessages.some((message) => message.role === "user")) return;

      const snapshot = buildHomeV2ConversationSnapshot({
        id: conversationId,
        messages: chatMessagesToStored(nextMessages),
        composioSessionIds: sessionIds,
      });

      setConversations((current) => {
        const next = [snapshot, ...current.filter((conversation) => conversation.id !== conversationId)].slice(0, 20);
        writeConversationHistory(next);
        return next;
      });
      upsertHomeV2ConversationDraft(snapshot);
      void saveConversationToApi(snapshot);
    },
    [],
  );

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

  React.useEffect(() => {
    queuedPromptsRef.current = queuedPrompts;
  }, [queuedPrompts]);

  const clearPromptQueue = React.useCallback(() => {
    queuedPromptsRef.current = [];
    setQueuedPrompts([]);
  }, []);

  const updateQueuedPrompt = React.useCallback((id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setQueuedPrompts((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, text: trimmed } : item));
      queuedPromptsRef.current = next;
      return next;
    });
  }, []);

  const deleteQueuedPrompt = React.useCallback((id: string) => {
    setQueuedPrompts((current) => {
      const next = current.filter((item) => item.id !== id);
      queuedPromptsRef.current = next;
      return next;
    });
  }, []);

  const processPromptQueue = React.useCallback(() => {
    if (isLoadingRef.current) return;
    const current = queuedPromptsRef.current;
    if (current.length === 0) return;
    const [next, ...rest] = current;
    queuedPromptsRef.current = rest;
    setQueuedPrompts(rest);
    void runSendRef.current(next.text, false);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      const local = readConversationHistory();

      try {
        const server = await fetchConversationListFromApi();
        if (cancelled) return;

        const merged = mergeConversationLists(server, local);
        writeConversationHistory(merged);
        setConversations(merged);

        const serverIds = new Set(server.map((conversation) => conversation.id));
        const localOnly = local.filter(
          (conversation) =>
            !serverIds.has(conversation.id) && conversationHasAssistantBody(conversation),
        );
        if (localOnly.length > 0) {
          void syncLocalConversationsToApi(localOnly);
        }
      } catch {
        if (!cancelled) setConversations(local);
      }
    })();

    return () => {
      cancelled = true;
    };
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
    if (messages.length === 0) return;
    if (!messages.some((message) => message.role === "user")) return;

    const id = activeConversationId ?? activeConversationIdRef.current;
    if (!id) return;
    persistConversationSnapshot(id, messages, composioSessionIds);
  }, [activeConversationId, composioSessionIds, messages, persistConversationSnapshot]);

  const startNewChat = React.useCallback(() => {
    abortRef.current?.abort();
    stopRequestedAssistantIdsRef.current.clear();
    clearPromptQueue();
    setInput("");
    if (activeConversationIdRef.current && messagesRef.current.length > 0) {
      persistConversationSnapshot(
        activeConversationIdRef.current,
        messagesRef.current,
        composioSessionIdsRef.current,
      );
    }
    setMessages([]);
    setLastMsgMinHeight(undefined);
    setComposioSessionIds({});
    composioSessionIdsRef.current = {};
    setActiveConversationId(null);
    activeConversationIdRef.current = null;
    isLoadingRef.current = false;
    setIsLoading(false);
    setConversationQuery(null);
  }, [clearPromptQueue, persistConversationSnapshot, setConversationQuery]);

  const loadConversation = React.useCallback(async (conversation: HomeV2SavedConversation) => {
    abortRef.current?.abort();
    stopRequestedAssistantIdsRef.current.clear();
    clearPromptQueue();
    setInput("");

    let resolved = conversation;
    try {
      const response = await fetch(`/api/genie/conversations/${conversation.id}`);
      if (response.ok) {
        resolved = mapApiConversationToSaved(
          (await response.json()) as {
            id: string;
            title?: string;
            messages?: unknown[];
            created_at?: string;
            updated_at?: string;
          },
          conversation.composioSessionIds,
        );
      }
    } catch {
      // Fall back to the cached conversation below.
    }

    const conversationJobs = jobsRef.current.filter(
      (job) => job.conversationId === resolved.id && job.metadata.source === "homev2",
    );
    const chatMessages = hydrateChatMessagesForConversation(resolved.messages, conversationJobs);

    setMessages(chatMessages);
    messagesRef.current = chatMessages;
    setComposioSessionIds(resolved.composioSessionIds ?? {});
    composioSessionIdsRef.current = resolved.composioSessionIds ?? {};
    setLastMsgMinHeight(undefined);
    setActiveConversationId(resolved.id);
    activeConversationIdRef.current = resolved.id;
    const stillStreaming = chatMessages.some((message) => message.isStreaming);
    isLoadingRef.current = stillStreaming;
    setIsLoading(stillStreaming);
    setConversationQuery(resolved.id);
  }, [clearPromptQueue, setConversationQuery]);

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
        void saveConversationToApi(conversation);
        return next;
      });
      void loadConversation(conversation);
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
            updated_at?: string;
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
    const stoppedAssistantIds = stopRequestedAssistantIdsRef.current;
    const streamingAssistantIds = new Set(
      currentMessages
        .filter((message) => message.role === "assistant" && message.isStreaming)
        .map((message) => message.id),
    );

    for (const message of currentMessages) {
      if (
        message.backgroundJobId &&
        (message.isStreaming || stoppedAssistantIds.has(message.id))
      ) {
        jobIds.add(message.backgroundJobId);
      }
    }

    for (const job of jobsRef.current) {
      const assistantId = job.metadata.client_assistant_id;
      if (!assistantId) continue;
      if (!streamingAssistantIds.has(assistantId) && !stoppedAssistantIds.has(assistantId)) {
        continue;
      }
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

    processPromptQueue();
  }, [cancelJob, collectCancellableJobIds, processPromptQueue]);

  React.useEffect(() => {
    if (stopRequestedAssistantIdsRef.current.size === 0) return;
    for (const jobId of collectCancellableJobIds(messagesRef.current)) {
      void cancelJob(jobId);
    }
  }, [jobs, cancelJob, collectCancellableJobIds]);

  React.useEffect(() => {
    for (const job of jobs) {
      const assistantId = job.metadata.client_assistant_id;
      if (!assistantId || job.metadata.source !== "homev2") continue;

      if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
        if (appliedGenieJobsRef.current.has(job.id)) continue;
        appliedGenieJobsRef.current.add(job.id);
      }

      if (job.conversationId && job.conversationId !== activeConversationIdRef.current) {
        continue;
      }

      setMessages((current) => {
        const target = current.find((message) => message.id === assistantId);
        const forceStopped = stopRequestedAssistantIdsRef.current.has(assistantId);

        if (!target) {
          if (!isGenieJobRunning(job) || forceStopped) return current;
          const hydrated = hydrateChatMessagesForConversation(chatMessagesToStored(current), [job]);
          messagesRef.current = hydrated;
          return hydrated;
        }

        if (forceStopped && isGenieJobRunning(job)) {
          return current;
        }

        const merged = enrichAssistantFromJob(
          target,
          mergeGenieJobIntoAssistantMessage(target, job) as ChatMessage,
          job,
        );
        const nextMessage = forceStopped
          ? {
              ...merged,
              isStreaming: false,
              status: undefined,
              statusPhase: undefined,
            }
          : merged;

        if (forceStopped && !isGenieJobRunning(job)) {
          stopRequestedAssistantIdsRef.current.delete(assistantId);
        }

        if (
          target.status === nextMessage.status &&
          target.content === nextMessage.content &&
          target.isStreaming === nextMessage.isStreaming &&
          target.error === nextMessage.error &&
          target.processSteps?.length === nextMessage.processSteps?.length &&
          target.rawDebugLogs?.length === nextMessage.rawDebugLogs?.length &&
          target.reasoningSummary === nextMessage.reasoningSummary &&
          target.analysisPlan === nextMessage.analysisPlan &&
          target.analysisQueries?.length === nextMessage.analysisQueries?.length &&
          target.charts?.length === nextMessage.charts?.length &&
          target.tables?.length === nextMessage.tables?.length &&
          target.pivotTables?.length === nextMessage.pivotTables?.length &&
          target.products?.length === nextMessage.products?.length &&
          target.proposals?.length === nextMessage.proposals?.length &&
          target.suggestedPrompts?.length === nextMessage.suggestedPrompts?.length
        ) {
          return current;
        }
        const next = current.map((message) => (message.id === assistantId ? nextMessage : message));
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

  const runSend = React.useCallback(async (
    text: string,
    clearInputField = true,
    opts?: { mode?: "deep_research" },
  ) => {
    const trimmed = text.trim();
    if (!trimmed || isLoadingRef.current) return;

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
      status: "Reading your question",
      statusPhase: "context",
      processSteps: [createProcessStep("context", "Reading your question")],
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
    setConversationQuery(conversationId);
    persistConversationSnapshot(conversationId, messagesRef.current, composioSessionIdsRef.current);

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
        mode: opts?.mode,
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
  }, [startAgentBackgroundJob, cancelJob, persistConversationSnapshot, setConversationQuery]);

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

  // Header "Ask Genie" submits while already on this page: open a fresh chat and
  // run the queued prompt. Consuming the prompt empties the queue, so the
  // on-mount consumer above harmlessly no-ops for cross-page navigations.
  React.useEffect(() => {
    const handler = () => {
      const pending = consumeHomeV2PendingPrompt();
      if (!pending) return;
      startNewChat();
      window.setTimeout(() => {
        void runSendRef.current(pending, false);
      }, 60);
    };
    window.addEventListener(HOMEV2_PROMPT_EVENT, handler);
    return () => window.removeEventListener(HOMEV2_PROMPT_EVENT, handler);
  }, [startNewChat]);

  const [isDraggingPdf, setIsDraggingPdf] = React.useState(false);
  const [isUploadingInvoice, setIsUploadingInvoice] = React.useState(false);
  const dragDepthRef = React.useRef(0);

  const submitPrompt = React.useCallback((rawText?: string) => {
    const text = (rawText ?? input).trim();
    if (!text) return;

    if (isLoadingRef.current) {
      setQueuedPrompts((current) => {
        const next = [...current, { id: crypto.randomUUID(), text }];
        queuedPromptsRef.current = next;
        return next;
      });
      if (rawText === undefined) setInput("");
      return;
    }

    void runSend(text, rawText === undefined);
  }, [input, runSend]);

  // Kick off the long-running (~20-25 min) autonomous Deep Business Review. The
  // server orchestrator owns the investigation brief; the prompt here is just the
  // human-readable label the user sees as their turn.
  const startDeepReview = React.useCallback(() => {
    if (isLoadingRef.current) return;
    void runSend(
      "Run a full Deep Business Review — a deep, ~25-minute forensic analysis of the whole business across finance, sales, inventory, customers, staffing, suppliers and market trends, ending in a downloadable board-memo report.",
      true,
      { mode: "deep_research" },
    );
  }, [runSend]);

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

  React.useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;

    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingPdf(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDraggingPdf(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingPdf(false);
      const file = Array.from(event.dataTransfer?.files ?? []).find(
        (candidate) => candidate.type === "application/pdf" || candidate.name.toLowerCase().endsWith(".pdf"),
      );
      if (file) void uploadInvoicePdf(file);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [uploadInvoicePdf]);

  const gmailConnectAccessory = gmailConnectBanner ? (
    <GmailConnectCard
      payload={gmailConnectBanner}
      variant="inline"
      onConnected={() => setGmailConnectBanner(null)}
    />
  ) : null;

  return (
    <div
      className="relative flex h-[calc(100svh-57px)] min-w-0 flex-col overflow-x-hidden overflow-y-hidden bg-[radial-gradient(circle_at_top,rgba(250,204,21,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]"
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
      <div className="absolute left-4 top-3 z-40 sm:left-5">
        <ConversationHistoryDropdown
          conversations={conversations}
          activeConversationId={activeConversationId}
          runningConversationIds={runningConversationIds}
          onSelect={loadConversation}
          showNewChat
          onNewChat={startNewChat}
        />
      </div>
      <div className="absolute right-4 top-3 z-40 sm:right-5">
        <HomeV2OtherDropdown
          onDeepReview={startDeepReview}
          onProcessInvoice={(prompt) => submitPrompt(prompt)}
          deepReviewDisabled={isLoading}
        />
      </div>
      {!hasStarted ? (
        <HomePageQuietLayout
          todayLabel={todayLabel}
          input={
            <>
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
            </>
          }
        />
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div ref={scrollRef} className="genie-chat-selectable min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-6">
            <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8">
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
                    onGmailConnectNeeded={() => setGmailConnectBanner({ url: "", reason: "send" })}
                    onAsk={(text) => void runSend(text)}
                  />
                );
              })}
            </div>
          </div>

          <div className="relative z-20 shrink-0 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent px-5 pb-4 pt-6">
            <div className="mx-auto w-full max-w-3xl">
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
