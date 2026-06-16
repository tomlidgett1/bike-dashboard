"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Bike, Loader2, AlertCircle, Globe, Maximize2, Minimize2,
  Clock, Trash2, ArrowLeft, MessageSquarePlus,
  Store, Sparkles, CheckCircle2, ChevronDown,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { useGenie } from '@/components/providers/genie-provider';
import { useAuth } from '@/components/providers/auth-provider';
import { useUserProfile } from '@/components/providers/profile-provider';
import AIMotionOrb from './ai-motion-orb';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from '@/lib/types/genie-agent';
import { mergeGmailAgentContext } from '@/lib/genie/gmail-agent-context';
import { GmailConnectCard } from '@/components/genie/gmail-connect-card';
import { GenieChart } from '@/components/genie/genie-chart';
import { GenieDataTable } from '@/components/genie/genie-data-table';
import { GeniePivotTable } from '@/components/genie/genie-pivot-table';
import { GenieProposalCard } from '@/components/genie/genie-proposal-card';
import type { GeniePivotTablePayload } from '@/lib/genie/pivot-table';
import { LightspeedWorkorderCards } from '@/components/genie/lightspeed-workorder-cards';
import { LightspeedCustomerProfileCard } from '@/components/genie/lightspeed-customer-profile-card';
import {
  GenieRawLogsSection,
  GenieThinkingDetailSections,
} from '@/components/genie/genie-thinking-detail-sections';
import {
  appendRawDebugLog,
  mergeAnalysisPlan,
  upsertAnalysisQuery,
} from '@/lib/genie/analysis-events';
import { compactGenieProgressText, liveGenieProgressPreview } from '@/lib/genie/progress-text';
import type { GenieWebImagePreview } from '@/lib/genie/web-image-search';
import { GenieWebImageCards } from '@/components/genie/genie-web-image-cards';
import { GenieProgressBrandIcon, resolveGenieProgressBrand } from '@/components/genie/genie-progress-brand';
import { renderGenieMarkdown } from '@/lib/genie/render-markdown';
import { useGenieJobs } from '@/components/providers/genie-jobs-provider';
import { mergeGenieJobIntoAssistantMessage } from '@/lib/genie/sync-genie-job-message';
import type {
  GenieChartPayload,
  GenieTablePayload,
} from '@/lib/genie/visual-payloads';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusPhase =
  | 'context'
  | 'routing'
  | 'routing_done'
  | 'setup'
  | 'planning'
  | 'planning_done'
  | 'thinking'
  | 'web_search'
  | 'web_search_done'
  | 'image_search'
  | 'image_search_done'
  | 'product_search'
  | 'lightspeed_sales'
  | 'lightspeed_inventory'
  | 'lightspeed_customers'
  | 'lightspeed_workorders'
  | 'customer_context'
  | 'specialist'
  | 'rechecking'
  | 'tool_done'
  | 'tool'
  | 'responding'
  | 'gmail'
  | 'gmail_done'
  | 'xero'
  | 'xero_done'
  | 'deputy'
  | 'deputy_done'
  | 'verifying';

interface StatusStep { phase: StatusPhase; text: string }
interface ProcessStep {
  id: string;
  phase: string;
  text: string;
  kind: 'status' | 'reasoning';
  at: string;
}
interface Citation { url: string; title: string }

interface GenieProduct {
  id: string;
  product_url?: string | null;
  name: string;
  category: string | null;
  price: number | null;
  qoh?: number;
  in_stock?: boolean | null;
  listing_type?: string;
  condition?: string | null;
  image: string | null;
  store_name?: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  currentStatus?: StatusStep;
  reasoningSummary?: string;
  processSteps?: ProcessStep[];
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
  pivotTables?: GeniePivotTablePayload[];
  products?: GenieProduct[];
  webImages?: GenieWebImagePreview[];
  workorders?: GenieWorkorderCardsPayload;
  customerProfile?: GenieCustomerProfilePayload;
  gmailEmails?: GmailEmailsPayload;
  gmailConnect?: GmailConnectPayload;
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  rawDebugLogs?: GenieRawDebugLogEntry[];
  sources?: Citation[];
  proposals?: GenieProposal[];
  isStreaming?: boolean;
  error?: string;
  backgroundJobId?: string;
}

interface SavedConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SavedMessage {
  role: ChatMessage['role'];
  content?: string;
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
  pivotTables?: GeniePivotTablePayload[];
  products?: GenieProduct[];
  webImages?: GenieWebImagePreview[];
  workorders?: GenieWorkorderCardsPayload;
  customerProfile?: GenieCustomerProfilePayload;
  gmailEmails?: GmailEmailsPayload;
  gmailConnect?: GmailConnectPayload;
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  sources?: Citation[];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatPrice(price: number | null | undefined): string {
  if (!price) return '';
  return `$${price.toFixed(2)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function GenieLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <path d="M16 2L28.7 9.5V24.5L16 32L3.3 24.5V9.5L16 2Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M16 6L18.5 13.5H26L20 18L22.5 25.5L16 21L9.5 25.5L12 18L6 13.5H13.5L16 6Z" fill="currentColor" />
      <circle cx="16" cy="16" r="2.5" fill="white" fillOpacity="0.9" />
    </svg>
  );
}

// ─── Shimmer Status ───────────────────────────────────────────────────────────

const PHASE_LABELS: Partial<Record<StatusPhase, string>> = {
  context: 'Reading context',
  routing: 'Routing',
  routing_done: 'Workflow',
  setup: 'Setup',
  planning: 'Planning',
  planning_done: 'Planning',
  thinking: 'Thinking',
  web_search: 'Searching web',
  web_search_done: 'Web search done',
  image_search: 'Finding images',
  image_search_done: 'Images ready',
  product_search: 'Marketplace',
  lightspeed_sales: 'Sales',
  lightspeed_inventory: 'Stock',
  lightspeed_customers: 'Customers',
  lightspeed_workorders: 'Work orders',
  customer_context: 'Customer bike',
  specialist: 'Specialist',
  rechecking: 'Retrying',
  tool_done: 'Result',
  tool: 'Working',
  responding: 'Answering',
  gmail: 'Gmail',
  gmail_done: 'Gmail',
  xero: 'Xero',
  xero_done: 'Xero',
  deputy: 'Deputy',
  deputy_done: 'Deputy',
  verifying: 'Quality check',
};

function normalizeStartupStatusText(text: string, phase?: string): string {
  return compactGenieProgressText(text, phase);
}

function processTimestamp(): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
}

function processStepId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createProcessStep(
  phase: string,
  text: string,
  kind: ProcessStep['kind'] = 'status',
): ProcessStep {
  return {
    id: processStepId(),
    phase,
    text: kind === 'status' ? normalizeStartupStatusText(text.trim(), phase) : text.trim(),
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
  if (last?.kind === 'reasoning' && last.phase === step.phase) {
    return [...current.slice(0, -1), { ...last, text: step.text, at: step.at }];
  }
  return appendProcessStep(current, step);
}

function ShimmerStatus({ step }: { step: StatusStep }) {
  const label = liveGenieProgressPreview(
    step.text || PHASE_LABELS[step.phase] || 'Working',
    step.phase,
  );
  const brand = resolveGenieProgressBrand(step.phase, step.text);
  return (
    <motion.div key={`${step.phase}:${label}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.25 }} className="flex items-center gap-2 py-1">
      {brand ? (
        <GenieProgressBrandIcon phase={step.phase} text={step.text} />
      ) : null}
      <span
        className="text-xs font-medium text-transparent bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite]"
        style={{
          backgroundImage: 'linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 38%, var(--primary) 50%, var(--muted-foreground) 62%, var(--muted-foreground) 100%)',
          backgroundSize: '220% 100%',
        }}
      >
        {label}
      </span>
    </motion.div>
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
  const [manualExpanded, setManualExpanded] = useState(false);
  const [collapsedDuringLive, setCollapsedDuringLive] = useState(false);
  const visibleSteps = steps
    .filter(step => step.phase !== 'responding' && !/composing.*answer/i.test(step.text))
    .map(step => ({
      ...step,
      text: step.kind === 'status' ? normalizeStartupStatusText(step.text, step.phase) : step.text,
    }))
    .slice(-16);
  const hasAnalysis = Boolean(analysisPlan?.execution_steps.length || analysisQueries?.length);
  const hasRawLogs = Boolean(rawDebugLogs?.length);
  const expanded = live ? !collapsedDuringLive : manualExpanded;

  if (visibleSteps.length === 0 && !hasAnalysis && !hasRawLogs) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="max-w-3xl rounded-2xl border border-border/70 bg-background/75 px-3.5 py-3 shadow-xs"
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-start justify-between gap-3 text-left',
          expanded ? 'mb-2' : '',
        )}
        onClick={() => {
          if (live) setCollapsedDuringLive(value => !value);
          else setManualExpanded(value => !value);
        }}
        aria-expanded={expanded}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {live ? (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            ) : (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            )}
            Thinking process
          </span>
        </span>
        <ChevronDown
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200',
            expanded && 'rotate-180',
          )}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="process-steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="overflow-hidden"
          >
            <GenieThinkingDetailSections
              plan={analysisPlan}
              queries={analysisQueries}
              live={live}
            />
            <GenieRawLogsSection logs={rawDebugLogs} />
            {visibleSteps.length > 0 ? (
              <p className="mb-2 mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Progress
              </p>
            ) : null}
            <div className="max-h-60 overflow-y-auto pr-1">
        {visibleSteps.map((step, index) => {
          const isLast = index === visibleSteps.length - 1;
          const brand = resolveGenieProgressBrand(step.phase, step.text);
          return (
            <div key={step.id} className="grid grid-cols-[18px_1fr] gap-2">
              <div className="relative flex justify-center">
                <span className={cn(
                  'mt-1.5 h-2 w-2 rounded-full ring-2 ring-background',
                  step.kind === 'reasoning' ? 'bg-amber-500' : 'bg-primary',
                  live && isLast ? 'animate-pulse' : '',
                )} />
                {!isLast ? <span className="absolute top-4 bottom-0 w-px bg-border" /> : null}
              </div>
              <div className="pb-2">
                <div className="mb-0.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {brand ? (
                    <GenieProgressBrandIcon phase={step.phase} text={step.text} />
                  ) : null}
                  <span>{step.kind === 'reasoning' ? 'Reasoning' : (PHASE_LABELS[step.phase as StatusPhase] ?? step.phase).replace(/\.\.\.$/, '')}</span>
                  <span className="text-muted-foreground/60">{step.at}</span>
                </div>
                <div
                  className={cn(
                    'text-xs leading-snug text-muted-foreground [&_strong]:text-foreground [&_ul]:my-1 [&_li]:my-0.5',
                    live && isLast ? 'text-transparent bg-clip-text animate-[agent-text-shimmer_2.2s_linear_infinite]' : '',
                  )}
                  style={live && isLast ? {
                    backgroundImage: 'linear-gradient(90deg, var(--muted-foreground) 0%, var(--muted-foreground) 38%, var(--primary) 50%, var(--muted-foreground) 62%, var(--muted-foreground) 100%)',
                    backgroundSize: '220% 100%',
                  } : undefined}
                  dangerouslySetInnerHTML={{ __html: renderGenieMarkdown(step.text, { compact: true, linkMode: 'text' }) }}
                />
              </div>
            </div>
          );
        })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function ReasoningSummaryBox({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="max-w-full rounded-md border border-border/70 bg-background/70 px-3 py-2 shadow-xs"
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3 text-primary" />
        Thinking
      </div>
      <div
        className="max-h-24 overflow-hidden text-xs text-muted-foreground [&>p]:leading-snug [&>p+p]:mt-1 [&_strong]:text-foreground"
        dangerouslySetInnerHTML={{ __html: renderGenieMarkdown(text, { compact: true, linkMode: 'text' }) }}
      />
    </motion.div>
  );
}

// ─── Source Pill ──────────────────────────────────────────────────────────────

function SourcePill({ citation }: { citation: Citation }) {
  let displayName = citation.title;
  try {
    const hostname = new URL(citation.url).hostname.replace(/^www\./, '');
    if (!citation.title || citation.title === citation.url) displayName = hostname;
    else displayName = citation.title.length > 40 ? hostname : citation.title;
  } catch {}
  return (
    <a href={citation.url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-primary/50 hover:text-foreground transition-all whitespace-nowrap max-w-[160px]">
      <Globe className="h-2.5 w-2.5 flex-shrink-0 text-primary" />
      <span className="truncate">{displayName}</span>
    </a>
  );
}

// ─── Product Card ──────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: GenieProduct }) {
  const isInStock = product.in_stock === true || (product.qoh ?? 0) > 0;
  const cardClassName = [
    "flex-shrink-0 w-[152px] rounded-md border border-border bg-card overflow-hidden shadow-xs transition-all",
    product.product_url ? "hover:shadow-sm hover:border-primary/40 cursor-pointer" : "",
  ].filter(Boolean).join(" ");
  const content = (
    <>
      <div className="relative h-[96px] bg-muted flex items-center justify-center overflow-hidden">
        {product.image
          ? <Image src={product.image} alt={product.name} fill className="object-cover" sizes="152px" />
          : <Bike className="h-7 w-7 text-muted-foreground/30" />}
        {isInStock ? (
          <div className="absolute top-1.5 right-1.5">
            <span className="rounded-full bg-green-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">In Stock</span>
          </div>
        ) : null}
      </div>
      <div className="p-2.5 space-y-0.5">
        <p className="text-xs font-medium leading-tight line-clamp-2 text-foreground">{product.name}</p>
        {product.store_name && <p className="text-[10px] text-foreground/80 font-medium truncate">{product.store_name}</p>}
        {product.category && <p className="text-[10px] text-muted-foreground truncate">{product.category}</p>}
        <div className="pt-1">
          {product.price
            ? <span className="text-xs font-semibold text-foreground">{formatPrice(product.price)}</span>
            : <span className="text-[10px] text-muted-foreground">Price on request</span>}
        </div>
        {!product.product_url && (
          <p className="pt-1 text-[10px] text-muted-foreground">No live listing yet</p>
        )}
      </div>
    </>
  );

  if (product.product_url) {
    return (
      <motion.a href={product.product_url} target="_blank" rel="noopener noreferrer" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cardClassName}>
        {content}
      </motion.a>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cardClassName}>
      {content}
    </motion.div>
  );
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[82%] rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-xs">
          {message.content}
        </div>
      </motion.div>
    );
  }

  const noProposals = !message.proposals || message.proposals.length === 0;
  const noProducts = !message.products || message.products.length === 0;
  const noWebImages = !message.webImages || message.webImages.length === 0;
  const noWorkorders = !message.workorders || message.workorders.workorders.length === 0;
  const noCustomerProfile = !message.customerProfile;
  const noCharts = !message.charts || message.charts.length === 0;
  const noTables = !message.tables || message.tables.length === 0;
  const showProcessTimeline = Boolean(
    message.processSteps?.length
    || message.analysisPlan?.execution_steps.length
    || message.analysisQueries?.length
    || message.rawDebugLogs?.length,
  );
  const showShimmer = message.isStreaming && message.currentStatus && !showProcessTimeline;
  const showSpinner = message.isStreaming && !message.content && !message.currentStatus && noProducts && noWebImages && noWorkorders && noCustomerProfile && noCharts && noTables && noProposals;
  const showReasoning = message.isStreaming && !!message.reasoningSummary?.trim() && !showProcessTimeline;

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-2">

      {/* 1. Shimmer / spinner — shown while waiting for first content */}
      <AnimatePresence mode="wait">
        {showShimmer && message.currentStatus && (
          <ShimmerStatus key={`${message.currentStatus.phase}:${message.currentStatus.text}`} step={message.currentStatus} />
        )}
        {showSpinner && (
          <motion.div key="spinner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showReasoning && <ReasoningSummaryBox text={message.reasoningSummary ?? ''} />}
      </AnimatePresence>

      <AnimatePresence>
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
      </AnimatePresence>

      {/* 2. Customer profile */}
      <AnimatePresence>
        {message.customerProfile && (
          <motion.div
            key="customer-profile"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <LightspeedCustomerProfileCard profile={message.customerProfile} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Lightspeed work orders */}
      <AnimatePresence>
        {message.workorders && message.workorders.workorders.length > 0 && (
          <motion.div
            key="workorders"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <LightspeedWorkorderCards payload={message.workorders} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2b. Gmail connect */}
      <AnimatePresence>
        {message.gmailConnect && (
          <motion.div
            key="gmail-connect"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GmailConnectCard payload={message.gmailConnect} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3b. Web reference images */}
      <AnimatePresence>
        {message.webImages && message.webImages.length > 0 && (
          <motion.div
            key="web-images"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GenieWebImageCards images={message.webImages} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Products — rendered first so text reveals below without pushing them */}
      <AnimatePresence>
        {message.products && message.products.length > 0 && (
          <motion.div
            key="products"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-1.5"
          >
            <p className="text-[11px] font-medium text-muted-foreground px-0.5">In stock at Yellow Jersey</p>
            <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {message.products.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. Lightspeed visuals */}
      <AnimatePresence>
        {message.charts && message.charts.length > 0 && (
          <motion.div key="charts" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            {message.charts.map((chart, index) => (
              <GenieChart
                key={`${chart.title}-${index}`}
                chart={chart}
                variant="panel"
                showExport={false}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {message.pivotTables && message.pivotTables.length > 0 && (
          <motion.div key="pivot-tables" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            {message.pivotTables.map((table, index) => <GeniePivotTable key={`${table.title}-pivot-${index}`} table={table} />)}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {message.tables && message.tables.length > 0 && (
          <motion.div key="tables" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
            {message.tables.map((table, index) => <GenieDataTable key={`${table.title}-${index}`} table={table} variant="panel" />)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. Text content — word-by-word reveal, then switches to parsed markdown */}
      <AnimatePresence>
        {(message.content || (!showShimmer && !showSpinner && message.isStreaming)) && (
          <motion.div
            key="text"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="max-w-full rounded-md rounded-bl-sm bg-muted px-3.5 py-2.5 text-sm text-foreground ring-1 ring-border/60"
          >
            {message.isStreaming ? (
              <span style={{ whiteSpace: 'pre-wrap' }} className="leading-snug text-sm">
                {message.content}
                <span className="inline-block h-[1em] w-0.5 ml-0.5 bg-primary animate-pulse align-text-bottom" />
              </span>
            ) : message.content ? (
              <div
                className="max-w-none [&>p+p]:mt-0.5 [&>p:first-child]:mt-0 [&_ul]:my-0.5 [&_ol]:my-0.5"
                dangerouslySetInnerHTML={{ __html: renderGenieMarkdown(message.content, { compact: true, linkMode: 'text' }) }}
              />
            ) : (
              <span className="text-muted-foreground text-xs">...</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5b. Proposals — Store Agent action cards (preview → confirm) */}
      {message.proposals && message.proposals.length > 0 && (
        <div className="space-y-2">
          {message.proposals.map((p, i) => <GenieProposalCard key={i} proposal={p} />)}
        </div>
      )}

      {/* 5. Error */}
      {message.error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {message.error}
        </div>
      )}

      {/* 6. Sources */}
      {message.sources && message.sources.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground/70 px-0.5">Sources</p>
          <div className="flex flex-wrap gap-1.5">
            {message.sources.map((s, i) => <SourcePill key={i} citation={s} />)}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Suggestions ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Best road bike under $3,000?",
  "What's in stock right now?",
  "Electronic vs mechanical groupsets",
  "How often should I service my bike?",
];

const AGENT_SUGGESTIONS = [
  "What were sales last month?",
  "Most sold product last 30 days",
  "How many General Services in stock?",
  "Show my carousels",
];

function SuggestionPill({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} className="whitespace-nowrap">
      {text}
    </Button>
  );
}

// ─── Genie Panel ──────────────────────────────────────────────────────────────

export function GeniePanel() {
  const { isOpen, isExpanded, close, toggleExpand, launchAsAgent, acknowledgeAgentLaunch } = useGenie();
  const { user } = useAuth();
  const { profile } = useUserProfile();
  const { jobs, startAgentBackgroundJob, cancelJob } = useGenieJobs();
  const appliedGenieJobsRef = useRef(new Set<string>());

  // Store Agent mode is only offered to verified bicycle stores.
  const isStore = profile?.account_type === 'bicycle_store' && profile?.bicycle_store === true;
  const [mode, setMode] = useState<'advisor' | 'agent'>('advisor');
  const agentActive = isStore && mode === 'agent';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Min-height applied to the last message so a freshly-sent message can scroll to the top
  const [lastMsgMinHeight, setLastMsgMinHeight] = useState<number | undefined>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const suppressScrollUntilRef = useRef<number>(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom while streaming — suppressed briefly after user sends
  useEffect(() => {
    if (Date.now() < suppressScrollUntilRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  useEffect(() => { if (isOpen) setTimeout(() => inputRef.current?.focus(), 300); }, [isOpen]);
  useEffect(() => { if (!isOpen) abortRef.current?.abort(); }, [isOpen]);
  useEffect(() => { if (view === 'history' && user) loadConversationList(); }, [view, user]);

  useEffect(() => {
    for (const job of jobs) {
      const assistantId = job.metadata.client_assistant_id;
      if (!assistantId) continue;

      if (job.status === 'completed' || job.status === 'failed') {
        if (appliedGenieJobsRef.current.has(job.id)) continue;
        appliedGenieJobsRef.current.add(job.id);
      }

      setMessages((current) => {
        const target = current.find((message) => message.id === assistantId);
        if (!target) return current;
        const merged = mergeGenieJobIntoAssistantMessage(target, job);
        if (
          target.content === merged.content &&
          target.isStreaming === merged.isStreaming &&
          target.error === merged.error &&
          target.currentStatus?.text === merged.currentStatus?.text
        ) {
          return current;
        }
        return current.map((message) => (message.id === assistantId ? merged : message));
      });
    }
  }, [jobs]);

  const loadConversationList = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/genie/conversations');
      if (res.ok) setConversations((await res.json()).conversations ?? []);
    } finally { setHistoryLoading(false); }
  };

  const loadConversation = async (id: string) => {
    try {
      const res = await fetch(`/api/genie/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const savedMessages = (data.messages ?? []) as SavedMessage[];
      const loaded: ChatMessage[] = savedMessages.map(m => ({
        id: crypto.randomUUID(), role: m.role, content: m.content ?? '',
        charts: m.charts, tables: m.tables, products: m.products, webImages: m.webImages, workorders: m.workorders,
        customerProfile: m.customerProfile,
        analysisPlan: m.analysisPlan, analysisQueries: m.analysisQueries, sources: m.sources,
      }));
      setMessages(loaded);
      setConversationId(id);
      setLastMsgMinHeight(undefined);
      setView('chat');
    } catch {}
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/genie/conversations/${id}`, { method: 'DELETE' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (conversationId === id) { setConversationId(null); setMessages([]); }
  };

  const startNewChat = () => { setMessages([]); setConversationId(null); setLastMsgMinHeight(undefined); setView('chat'); };

  // Advisor and Store Agent are separate response threads — switching starts a fresh chat.
  const switchMode = (m: 'advisor' | 'agent') => {
    if (m === mode) return;
    abortRef.current?.abort();
    setMode(m);
    setMessages([]);
    setConversationId(null);
    setLastMsgMinHeight(undefined);
    setView('chat');
  };

  // Opened from the bike store header — land directly in agent mode.
  React.useEffect(() => {
    if (!isOpen || !launchAsAgent) return;
    if (isStore) {
      abortRef.current?.abort();
      setMode('agent');
      setMessages([]);
      setConversationId(null);
      setLastMsgMinHeight(undefined);
      setView('chat');
    }
    acknowledgeAgentLaunch();
  }, [isOpen, launchAsAgent, isStore, acknowledgeAgentLaunch]);

  const saveConversation = useCallback(async (msgs: ChatMessage[], currentId: string | null) => {
    if (!user) return null;
    try {
      const res = await fetch('/api/genie/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: currentId ?? undefined,
          messages: msgs.map(m => ({
            role: m.role,
            content: m.content,
            charts: m.charts,
            tables: m.tables,
            products: m.products,
            webImages: m.webImages,
            workorders: m.workorders,
            customerProfile: m.customerProfile,
            proposals: m.proposals,
            gmailEmails: m.gmailEmails,
            analysisPlan: m.analysisPlan,
            analysisQueries: m.analysisQueries,
            sources: m.sources,
          })),
        }),
      });
      if (res.ok) return (await res.json()).id as string;
    } catch {}
    return null;
  }, [user]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    // Store Agent mode talks to the authenticated agent endpoint (read + propose);
    // advisor mode uses the public Genie endpoint. They are separate threads.
    const agentMode = isStore && mode === 'agent';
    const endpoint = agentMode ? '/api/genie/agent' : '/api/genie';

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text.trim() };
    const assistantId = crypto.randomUUID();

    // Measure the visible chat area — the last message gets this as min-height so the
    // freshly-sent message always has room to scroll to the very top (ChatGPT technique).
    const containerH = scrollContainerRef.current?.clientHeight ?? 0;

    // flushSync forces React to commit DOM synchronously — refs are live immediately after
    suppressScrollUntilRef.current = Date.now() + 120_000; // suppress for 2 min — cleared on next send
    flushSync(() => {
      setLastMsgMinHeight(containerH);
      setMessages(prev => [...prev, userMsg, {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        processSteps: [createProcessStep('thinking', 'Thinking')],
      }]);
      setInput('');
    });
    setIsLoading(true);

    // DOM is committed and there's now enough scroll room — snap user message to the top
    {
      const container = scrollContainerRef.current;
      const el = lastUserMsgRef.current;
      if (container && el) {
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        container.scrollTo({ top: container.scrollTop + (elRect.top - containerRect.top) - 12, behavior: 'smooth' });
      }
    }

    if (agentMode) {
      const history = [...messages, userMsg].map((message) => ({
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
        sources: message.sources,
      }));

      try {
        const jobId = await startAgentBackgroundJob({
          messages: history,
          prompt: text.trim(),
          conversationId,
          clientAssistantId: assistantId,
          source: 'panel',
        });
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                backgroundJobId: jobId ?? undefined,
                processSteps: [createProcessStep('thinking', 'Thinking')],
              }
            : message
        ));
      } catch (error) {
        setMessages((prev) => prev.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                isStreaming: false,
                error: error instanceof Error ? error.message : 'Failed to start Genie.',
              }
            : message
        ));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const ss = { pending: '', rafId: null as number | null };
    const flushText = () => {
      if (ss.pending) {
        const chunk = ss.pending; ss.pending = '';
        setMessages(prev => prev.map(m =>
          m.id !== assistantId ? m : { ...m, content: m.content + chunk, currentStatus: undefined }
        ));
      }
      ss.rafId = null;
    };

    const recordStreamEvent = (payload: Record<string, unknown>) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, rawDebugLogs: appendRawDebugLog(m.rawDebugLogs, payload) }
          : m
      ));
    };

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
        charts: m.charts,
        tables: m.tables,
        pivotTables: m.pivotTables,
        products: m.products,
        webImages: m.webImages,
        workorders: m.workorders,
        customerProfile: m.customerProfile,
        proposals: m.proposals,
        gmailEmails: m.gmailEmails,
        analysisPlan: m.analysisPlan,
        analysisQueries: m.analysisQueries,
        sources: m.sources,
      }));
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      recordStreamEvent({
        event: '_stream_start',
        endpoint,
        user_message: text.trim(),
        request_messages_count: history.length,
        http_status: res.status,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            recordStreamEvent(parsed as Record<string, unknown>);
            if (parsed.event === 'status') {
              const phase = String(parsed.phase ?? 'tool');
              const text = normalizeStartupStatusText(String(parsed.text ?? 'Working'), phase);
              const step = createProcessStep(phase, text);
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      currentStatus: { phase: phase as StatusPhase, text },
                      processSteps: appendProcessStep(m.processSteps, step),
                    }
                  : m
              ));
            }
            if (parsed.event === 'heartbeat') {
              const text = normalizeStartupStatusText(String(parsed.text ?? 'Still working'), 'thinking');
              setMessages(prev => prev.map(m =>
                m.id === assistantId && m.isStreaming
                  ? {
                      ...m,
                      currentStatus: { phase: 'thinking' as StatusPhase, text },
                    }
                  : m
              ));
            }
            if (parsed.event === 'text_delta') {
              ss.pending += parsed.text ?? '';
              if (ss.rafId === null) ss.rafId = requestAnimationFrame(flushText);
            }
            if (parsed.event === 'reasoning_delta') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? (() => {
                      const reasoningSummary = `${m.reasoningSummary ?? ''}${parsed.text ?? ''}`;
                      return {
                        ...m,
                        reasoningSummary,
                        processSteps: upsertLiveReasoningStep(
                          m.processSteps,
                          createProcessStep('thinking', reasoningSummary, 'reasoning'),
                        ),
                      };
                    })()
                  : m
              ));
            }
            if (parsed.event === 'reasoning_done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? (() => {
                      const reasoningSummary = parsed.text ?? m.reasoningSummary ?? '';
                      const phase = reasoningSummary.trim().startsWith('- ') ? 'planning' : 'thinking';
                      return {
                        ...m,
                        reasoningSummary,
                        processSteps: upsertLiveReasoningStep(
                          m.processSteps,
                          createProcessStep(phase, reasoningSummary, 'reasoning'),
                        ),
                      };
                    })()
                  : m
              ));
            }
            if (parsed.event === 'products') {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, products: parsed.products } : m));
            }
            if (parsed.event === 'web_images' && Array.isArray(parsed.images) && parsed.images.length > 0) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, webImages: parsed.images as GenieWebImagePreview[] }
                  : m
              ));
            }
            if (parsed.event === 'workorders' && parsed.workorders) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, workorders: parsed.workorders as GenieWorkorderCardsPayload }
                  : m
              ));
            }
            if (parsed.event === 'customer_profile' && parsed.customer_profile) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, customerProfile: parsed.customer_profile as GenieCustomerProfilePayload }
                  : m
              ));
            }
            if (parsed.event === 'gmail_emails' && parsed.gmail_emails) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, gmailEmails: parsed.gmail_emails as GmailEmailsPayload }
                  : m
              ));
            }
            if (parsed.event === 'gmail_agent_context' && parsed.gmail_agent_context) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      gmailEmails: mergeGmailAgentContext(
                        m.gmailEmails,
                        parsed.gmail_agent_context as GmailAgentContext,
                      ),
                    }
                  : m
              ));
            }
            if (parsed.event === 'gmail_connect' && parsed.gmail_connect) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, gmailConnect: parsed.gmail_connect as GmailConnectPayload }
                  : m
              ));
            }
            if (parsed.event === 'analysis_plan' && parsed.plan) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      analysisPlan: mergeAnalysisPlan(
                        m.analysisPlan,
                        parsed.plan as GenieAnalysisPlanPayload,
                      ),
                    }
                  : m
              ));
            }
            if (parsed.event === 'analysis_query' && parsed.query) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? {
                      ...m,
                      analysisQueries: upsertAnalysisQuery(
                        m.analysisQueries,
                        parsed.query as GenieAnalysisQueryPayload,
                      ),
                    }
                  : m
              ));
            }
            if (parsed.event === 'chart' && parsed.chart) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, charts: [...(m.charts ?? []), parsed.chart as GenieChartPayload] } : m
              ));
            }
            if (parsed.event === 'table' && parsed.table) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, tables: [...(m.tables ?? []), parsed.table as GenieTablePayload] } : m
              ));
            }
            if (parsed.event === 'pivot_table' && parsed.pivot_table) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, pivotTables: [...(m.pivotTables ?? []), parsed.pivot_table as GeniePivotTablePayload] }
                  : m
              ));
            }
            if (parsed.event === 'proposal' && parsed.proposal) {
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? { ...m, proposals: [...(m.proposals ?? []), parsed.proposal as GenieProposal] } : m
              ));
            }
            if (parsed.event === 'sources') {
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, sources: parsed.sources } : m));
            }
            if (parsed.event === 'done') {
              if (ss.rafId !== null) { cancelAnimationFrame(ss.rafId); flushText(); }
              setMessages(prev => {
                const updated = prev.map(m =>
                  m.id === assistantId ? { ...m, isStreaming: false, currentStatus: undefined, reasoningSummary: undefined } : m
                );
                if (!agentMode) {
                  saveConversation(updated, conversationId).then(newId => {
                    if (newId && !conversationId) setConversationId(newId);
                  });
                }
                return updated;
              });
            }
            if (parsed.event === 'error') {
              setMessages(prev => prev.map(m =>
                m.id === assistantId
                  ? { ...m, isStreaming: false, currentStatus: undefined, reasoningSummary: undefined, error: 'Something went wrong. Please try again.' }
                  : m
              ));
            }
          } catch {
            recordStreamEvent({ event: '_sse_parse_error', raw });
          }
        }
      }

      recordStreamEvent({ event: '_stream_end' });

      // Stream closed — ensure the message is finalised even if 'done' event was missing
      if (ss.rafId !== null) { cancelAnimationFrame(ss.rafId); flushText(); }
      setMessages(prev => prev.map(m =>
        m.id === assistantId && m.isStreaming
          ? { ...m, isStreaming: false, currentStatus: undefined, reasoningSummary: undefined }
          : m
      ));
    } catch (err) {
      if (ss.rafId !== null) { cancelAnimationFrame(ss.rafId); ss.rafId = null; }
      if ((err as Error).name === 'AbortError') {
        recordStreamEvent({ event: '_stream_aborted' });
      } else {
        recordStreamEvent({
          event: '_stream_error',
          message: err instanceof Error ? err.message : String(err),
        });
        setMessages(prev => prev.map(m =>
          m.id === assistantId
            ? { ...m, isStreaming: false, currentStatus: undefined, reasoningSummary: undefined, error: 'Connection error. Please try again.' }
            : m
        ));
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [isLoading, messages, conversationId, saveConversation, isStore, mode, startAgentBackgroundJob]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); sendMessage(input); };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Backdrop — CSS opacity transition, no JS animation */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        style={{
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.2s ease',
        }}
        onClick={close}
      />

      {/* Panel — always mounted, pure CSS transform (compositor thread, no JS per-frame) */}
      <div
        className={cn(
          'fixed right-3 top-[1.5%] z-50 flex flex-col',
          'max-w-[calc(100vw-24px)]',
          'rounded-2xl overflow-hidden',
          'shadow-xl border border-border bg-background',
        )}
        style={{
          height: '97vh',
          width: isExpanded ? 'calc(100vw - 24px)' : '420px',
          transform: isOpen ? 'translateX(0)' : 'translateX(calc(100% + 24px))',
          transition: 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1), width 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
      >
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex-shrink-0">
                  <AIMotionOrb size={30} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-none truncate">Yellow Jersey Genius</p>
                  <AnimatePresence mode="wait">
                    {isLoading
                      ? <motion.p key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[11px] text-primary mt-0.5">Thinking...</motion.p>
                      : <motion.p key="i" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="text-[11px] text-muted-foreground mt-0.5">{agentActive ? 'Store agent · acts on your store' : 'Elite cycling advisor'}</motion.p>}
                  </AnimatePresence>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {user && view === 'chat' && !agentActive && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setView('history')} title="History">
                    <Clock className="h-4 w-4" />
                  </Button>
                )}
                {view === 'history' && (
                  <Button variant="ghost" size="icon-sm" onClick={() => setView('chat')}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="icon-sm" onClick={toggleExpand} title={isExpanded ? 'Collapse' : 'Expand'}>
                  {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={close}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* ── Mode Toggle — verified bicycle stores only ──── */}
            {isStore && view === 'chat' && (
              <div className="flex-shrink-0 px-4 pt-2.5">
                <Tabs value={mode} onValueChange={(value) => switchMode(value as 'advisor' | 'agent')} className="w-full">
                  <TabsList className="grid h-auto w-full grid-cols-2 p-0.5">
                    <TabsTrigger value="advisor" className="gap-1.5 py-1.5 text-xs">
                      <Sparkles className="h-3.5 w-3.5" /> Advisor
                    </TabsTrigger>
                    <TabsTrigger
                      value="agent"
                      className="gap-1.5 py-1.5 text-xs data-active:bg-primary data-active:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground"
                    >
                      <Store className="h-3.5 w-3.5" /> Agent
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}

            {/* ── History View ──────────────────────────────── */}
            {view === 'history' && (
              <div className="flex-1 overflow-y-auto">
                <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Past conversations</p>
                  <Button size="sm" onClick={startNewChat}>
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    New chat
                  </Button>
                </div>
                {historyLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No past conversations yet.</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Your chats will appear here.</p>
                  </div>
                ) : (
                  <div className="px-3 pb-4 space-y-1">
                    {conversations.map(conv => (
                      <button key={conv.id} onClick={() => loadConversation(conv.id)}
                        className="w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted/60 transition-colors group">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md border bg-primary/15 text-foreground">
                          <GenieLogo className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate leading-snug">{conv.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(conv.updated_at)}</p>
                        </div>
                        <button onClick={(e) => deleteConversation(conv.id, e)}
                          className="flex-shrink-0 opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-red-500 transition-all">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Chat View ─────────────────────────────────── */}
            {view === 'chat' && (
              <>
                <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                  {isEmpty ? (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                      className="flex flex-col items-center justify-center h-full text-center px-4 pb-8">
                      <div className="mb-5">
                        <AIMotionOrb size={72} />
                      </div>
                      <h3 className="text-base font-bold text-foreground mb-1.5">{agentActive ? 'Agent' : 'Yellow Jersey Genius'}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-[270px]">
                        {agentActive
                          ? 'Reorder your store carousels and run discounts just by asking. I’ll show a preview before anything changes.'
                          : 'Expert cycling advice, real-time web search, and live stock lookup — all in one.'}
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {(agentActive ? AGENT_SUGGESTIONS : SUGGESTIONS).map((s, i) => <SuggestionPill key={i} text={s} onClick={() => sendMessage(s)} />)}
                      </div>
                    </motion.div>
                  ) : (
                    messages.map((msg, i) => {
                      const isLastUser =
                        msg.role === 'user' &&
                        !messages.slice(i + 1).some(m => m.role === 'user');
                      const isLast = i === messages.length - 1;
                      return (
                        <div
                          key={msg.id}
                          ref={isLastUser ? lastUserMsgRef : undefined}
                          style={isLast && lastMsgMinHeight ? { minHeight: lastMsgMinHeight } : undefined}
                        >
                          <MessageBubble message={msg} />
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {!isEmpty && !isLoading && (
                  <div className="flex-shrink-0 flex gap-2 px-4 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {(agentActive ? AGENT_SUGGESTIONS : SUGGESTIONS).slice(0, 2).map((s, i) => <SuggestionPill key={i} text={s} onClick={() => sendMessage(s)} />)}
                  </div>
                )}

                <div className="flex-shrink-0 border-t border-border bg-background px-4 py-3">
                  <form onSubmit={handleSubmit}>
                    <div className="relative">
                      <Textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => {
                          setInput(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 180) + 'px';
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder={agentActive ? 'Tell the agent what to change…' : 'Ask anything about bikes...'}
                        rows={2}
                        disabled={isLoading}
                        className="min-h-[84px] max-h-[180px] resize-none pr-14 leading-relaxed"
                        style={{ height: '84px' }}
                      />
                      <Button
                        type="submit"
                        size="icon-sm"
                        disabled={!input.trim() || isLoading}
                        className="absolute bottom-3 right-3"
                      >
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </form>
                  <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
                    {agentActive ? 'Store Agent · previews every change before applying' : 'Yellow Jersey Genius · Real-time cycling advice'}
                  </p>
                </div>
              </>
            )}
      </div>
    </>
  );
}
