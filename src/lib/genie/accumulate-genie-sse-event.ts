import type {
  GenieChartPayload,
  GenieTablePayload,
} from "@/lib/genie/visual-payloads";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";
import type { GenieWebImagePreview } from "@/lib/genie/web-image-search";
import type { GenieStoreProductPreview } from "@/lib/genie/store-product-previews";
import { mergeGmailAgentContext } from "@/lib/genie/gmail-agent-context";
import {
  mergeAnalysisPlan,
  upsertAnalysisQuery,
} from "@/lib/genie/analysis-events";
import type {
  GenieAnalysisPlanPayload,
  GenieAnalysisQueryPayload,
  GenieCustomerProfilePayload,
  GenieProposal,
  GenieWorkorderCardsPayload,
  GmailAgentContext,
  GmailConnectPayload,
  GmailEmailsPayload,
} from "@/lib/types/genie-agent";

export type AccumulatedGenieAssistant = {
  role: "assistant";
  content: string;
  charts?: GenieChartPayload[];
  tables?: GenieTablePayload[];
  pivotTables?: GeniePivotTablePayload[];
  products?: GenieStoreProductPreview[];
  webImages?: GenieWebImagePreview[];
  workorders?: GenieWorkorderCardsPayload;
  customerProfile?: GenieCustomerProfilePayload;
  proposals?: GenieProposal[];
  gmailEmails?: GmailEmailsPayload;
  gmailConnect?: GmailConnectPayload;
  analysisPlan?: GenieAnalysisPlanPayload;
  analysisQueries?: GenieAnalysisQueryPayload[];
  sources?: unknown;
  reasoningSummary?: string;
  error?: string;
};

export function createEmptyGenieAssistant(): AccumulatedGenieAssistant {
  return { role: "assistant", content: "" };
}

export function applyGenieSseEvent(
  event: Record<string, unknown>,
  assistant: AccumulatedGenieAssistant,
): AccumulatedGenieAssistant {
  const next = { ...assistant };

  if (event.event === "text_delta" && typeof event.text === "string") {
    next.content += event.text;
  }

  if (event.event === "reasoning_done" && typeof event.text === "string") {
    next.reasoningSummary = event.text;
  }

  if (event.event === "products" && Array.isArray(event.products)) {
    next.products = event.products as GenieStoreProductPreview[];
  }

  if (event.event === "web_images" && Array.isArray(event.images)) {
    next.webImages = event.images as GenieWebImagePreview[];
  }

  if (event.event === "workorders" && event.workorders) {
    next.workorders = event.workorders as GenieWorkorderCardsPayload;
  }

  if (event.event === "customer_profile" && event.customer_profile) {
    next.customerProfile = event.customer_profile as GenieCustomerProfilePayload;
  }

  if (event.event === "gmail_emails" && event.gmail_emails) {
    next.gmailEmails = event.gmail_emails as GmailEmailsPayload;
  }

  if (event.event === "gmail_agent_context" && event.gmail_agent_context) {
    next.gmailEmails = mergeGmailAgentContext(
      next.gmailEmails,
      event.gmail_agent_context as GmailAgentContext,
    );
  }

  if (event.event === "gmail_connect" && event.gmail_connect) {
    next.gmailConnect = event.gmail_connect as GmailConnectPayload;
  }

  if (event.event === "analysis_plan" && event.plan) {
    next.analysisPlan = mergeAnalysisPlan(
      next.analysisPlan,
      event.plan as GenieAnalysisPlanPayload,
    );
  }

  if (event.event === "analysis_query" && event.query) {
    next.analysisQueries = upsertAnalysisQuery(
      next.analysisQueries,
      event.query as GenieAnalysisQueryPayload,
    );
  }

  if (event.event === "chart" && event.chart) {
    next.charts = [...(next.charts ?? []), event.chart as GenieChartPayload];
  }

  if (event.event === "table" && event.table) {
    next.tables = [...(next.tables ?? []), event.table as GenieTablePayload];
  }

  if (event.event === "pivot_table" && event.pivot_table) {
    next.pivotTables = [
      ...(next.pivotTables ?? []),
      event.pivot_table as GeniePivotTablePayload,
    ];
  }

  if (event.event === "proposal" && event.proposal) {
    next.proposals = [...(next.proposals ?? []), event.proposal as GenieProposal];
  }

  if (event.event === "sources") {
    next.sources = event.sources;
  }

  if (event.event === "error") {
    next.error = "Something went wrong. Please try again.";
  }

  return next;
}
