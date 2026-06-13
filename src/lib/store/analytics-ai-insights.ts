import OpenAI from "openai";
import {
  getInternalAnalyticsUserIds,
  isExcludedAnalyticsUser,
} from "@/lib/store/analytics-exclusions";
import { getCustomerBehaviourAnalytics } from "@/lib/store/customer-behaviour-analytics";
import { getWebTrackingAnalytics } from "@/lib/store/web-tracking-analytics";
import type { createServiceRoleClient } from "@/lib/supabase/server";

type StoreAnalyticsServiceClient = ReturnType<typeof createServiceRoleClient>;

type SummaryPayload = {
  summary?: Record<string, unknown>;
  topProducts?: Array<Record<string, unknown>>;
};

type SearchPayload = {
  summary?: Record<string, unknown>;
  searchTerms?: Array<Record<string, unknown>>;
};

type RawAnalyticsEvent = {
  event_type: string | null;
  user_id: string | null;
  visitor_id: string | null;
  session_id: string | null;
  occurred_at: string | null;
  metadata: Record<string, unknown> | null;
};

type RawSearchEvent = {
  user_id: string | null;
  visitor_id: string | null;
  session_id: string | null;
  search_term: string | null;
  result_count: number | null;
  occurred_at: string | null;
};

export type StoreAnalyticsAiInsight = {
  priority: "high" | "medium" | "low";
  title: string;
  recommendation: string;
  evidence: string;
  nextAction: string;
};

export type StoreAnalyticsAiResponse = {
  generatedAt: string;
  model: string;
  periodDays: number;
  headline: string;
  executiveSummary: string;
  customerStory: string;
  confidence: "high" | "medium" | "low";
  periodComparison: Array<{
    metric: string;
    current: string;
    previous: string;
    interpretation: string;
  }>;
  recommendations: StoreAnalyticsAiInsight[];
  patterns: string[];
  risks: string[];
};

const AI_MODEL = "gpt-4.1-mini";
const PREVIOUS_EVENT_TYPES = new Set([
  "store_page_view",
  "product_view",
  "product_impression",
  "cta_click",
  "contact_click",
  "message_open",
  "message_submit",
  "service_book_click",
  "rental_request_submit",
  "product_click",
  "add_to_cart_click",
  "buy_now_click",
]);

const SYSTEM_PROMPT = `You are a senior ecommerce analytics strategist for independent bicycle stores.

You analyse storefront behaviour and produce practical recommendations a store owner can act on this week.

Rules:
- Return only valid JSON matching the requested shape.
- Base every recommendation on the supplied analytics only.
- Be concrete: mention the customer behaviour, the likely meaning, and the next change to make.
- Do not invent exact numbers that are not in the payload.
- Use Australian English.
- Avoid generic advice like "improve marketing". Focus on storefront layout, merchandising, services, rentals, search, CTAs, and conversion intent.
- If data is sparse, say so and recommend how to collect a stronger signal.`;

function compactNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toVisitorKey(row: { user_id: string | null; visitor_id: string | null }) {
  return row.user_id || row.visitor_id || "unknown";
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function sanitizeString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.slice(0, 500) : fallback;
}

function validateAiResponse(value: unknown, days: number): StoreAnalyticsAiResponse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const recommendations = Array.isArray(record.recommendations)
    ? record.recommendations
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const priority = row.priority === "high" || row.priority === "medium" || row.priority === "low"
            ? row.priority
            : "medium";
          return {
            priority,
            title: sanitizeString(row.title, "Review storefront behaviour"),
            recommendation: sanitizeString(row.recommendation, "Use the analytics signals to prioritise the next storefront change."),
            evidence: sanitizeString(row.evidence, "Based on the supplied analytics period."),
            nextAction: sanitizeString(row.nextAction, "Review the affected storefront section."),
          };
        })
        .filter((item): item is StoreAnalyticsAiInsight => Boolean(item))
        .slice(0, 5)
    : [];

  return {
    generatedAt: new Date().toISOString(),
    model: AI_MODEL,
    periodDays: days,
    headline: sanitizeString(record.headline, "Customer behaviour analysis"),
    executiveSummary: sanitizeString(record.executiveSummary, "The AI analysed the available storefront behaviour."),
    customerStory: sanitizeString(record.customerStory, "Customers are browsing the storefront and leaving behavioural signals across products, search, and intent actions."),
    confidence: record.confidence === "high" || record.confidence === "medium" || record.confidence === "low"
      ? record.confidence
      : "medium",
    periodComparison: Array.isArray(record.periodComparison)
      ? record.periodComparison
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            return {
              metric: sanitizeString(row.metric),
              current: sanitizeString(row.current),
              previous: sanitizeString(row.previous),
              interpretation: sanitizeString(row.interpretation),
            };
          })
          .filter((item): item is StoreAnalyticsAiResponse["periodComparison"][number] =>
            Boolean(item && item.metric),
          )
          .slice(0, 6)
      : [],
    recommendations,
    patterns: Array.isArray(record.patterns)
      ? record.patterns.map((item) => sanitizeString(item)).filter(Boolean).slice(0, 6)
      : [],
    risks: Array.isArray(record.risks)
      ? record.risks.map((item) => sanitizeString(item)).filter(Boolean).slice(0, 6)
      : [],
  };
}

async function fetchPreviousPeriodSnapshot(
  service: StoreAnalyticsServiceClient,
  userId: string,
  days: number,
) {
  const now = Date.now();
  const periodMs = days * 24 * 60 * 60 * 1000;
  const previousStart = new Date(now - periodMs * 2).toISOString();
  const previousEnd = new Date(now - periodMs).toISOString();
  const internalUserIds = await getInternalAnalyticsUserIds(service);
  const events: RawAnalyticsEvent[] = [];
  const searches: RawSearchEvent[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await service
      .from("store_analytics_events")
      .select("event_type, user_id, visitor_id, session_id, occurred_at, metadata")
      .eq("store_owner_id", userId)
      .gte("occurred_at", previousStart)
      .lt("occurred_at", previousEnd)
      .in("event_type", Array.from(PREVIOUS_EVENT_TYPES))
      .order("occurred_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    events.push(...((data ?? []) as RawAnalyticsEvent[]));
    if (!data || data.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await service
      .from("store_search_events")
      .select("user_id, visitor_id, session_id, search_term, result_count, occurred_at")
      .eq("store_owner_id", userId)
      .gte("occurred_at", previousStart)
      .lt("occurred_at", previousEnd)
      .order("occurred_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    searches.push(...((data ?? []) as RawSearchEvent[]));
    if (!data || data.length < pageSize) break;
  }

  const filteredEvents = events.filter(
    (row) => row.occurred_at && !isExcludedAnalyticsUser(row.user_id, userId, internalUserIds),
  );
  const filteredSearches = searches.filter(
    (row) => row.occurred_at && !isExcludedAnalyticsUser(row.user_id, userId, internalUserIds),
  );
  const visitors = new Set([
    ...filteredEvents.map(toVisitorKey),
    ...filteredSearches.map(toVisitorKey),
  ]);
  const sessions = new Set([
    ...filteredEvents.map((row) => row.session_id).filter(Boolean),
    ...filteredSearches.map((row) => row.session_id).filter(Boolean),
  ]);
  const intentEvents = filteredEvents.filter((row) =>
    row.event_type
      ? [
          "product_view",
          "product_click",
          "add_to_cart_click",
          "buy_now_click",
          "contact_click",
          "message_submit",
          "service_book_click",
          "rental_request_submit",
        ].includes(row.event_type)
      : false,
  ).length + filteredSearches.length;

  return {
    start: previousStart,
    end: previousEnd,
    pageViews: filteredEvents.filter((row) => row.event_type === "store_page_view" || row.event_type === "product_view").length,
    productViews: filteredEvents.filter((row) => row.event_type === "product_view").length,
    productImpressions: filteredEvents.filter((row) => row.event_type === "product_impression").length,
    sessions: sessions.size,
    visitors: visitors.size,
    searches: filteredSearches.length,
    zeroResultSearches: filteredSearches.filter((row) => (row.result_count ?? 0) === 0).length,
    intentEvents,
  };
}

function buildAiPrompt(input: {
  days: number;
  storeName: string;
  currentSummary: SummaryPayload;
  searchAnalytics: SearchPayload;
  webAnalytics: Awaited<ReturnType<typeof getWebTrackingAnalytics>>;
  behaviourAnalytics: Awaited<ReturnType<typeof getCustomerBehaviourAnalytics>>;
  previous: Awaited<ReturnType<typeof fetchPreviousPeriodSnapshot>>;
}) {
  const current = {
    days: input.days,
    storeName: input.storeName,
    traffic: input.currentSummary.summary,
    topProducts: (input.currentSummary.topProducts ?? []).slice(0, 10),
    search: input.searchAnalytics.summary,
    searchTerms: (input.searchAnalytics.searchTerms ?? []).slice(0, 12),
    web: {
      selectedPeriod: input.webAnalytics.selectedPeriod,
      today: input.webAnalytics.today,
      currentWeek: input.webAnalytics.currentWeek,
      daily: input.webAnalytics.daily.slice(-14),
      weekly: input.webAnalytics.weekly.slice(-8),
    },
    behaviour: {
      summary: input.behaviourAnalytics.summary,
      firstActions: input.behaviourAnalytics.firstActions.slice(0, 10),
      tabEngagement: input.behaviourAnalytics.tabEngagement.slice(0, 10),
      sectionEngagement: input.behaviourAnalytics.sectionEngagement.slice(0, 12),
      ctaClicks: input.behaviourAnalytics.ctaClicks.slice(0, 12),
      carouselEngagement: input.behaviourAnalytics.carouselEngagement.slice(0, 10),
      scrollDepth: input.behaviourAnalytics.scrollDepth,
      journeyPaths: input.behaviourAnalytics.journeyPaths.slice(0, 8),
    },
    previousPeriod: input.previous,
    computedChanges: {
      pageViewsPct: pctChange(
        compactNumber(input.webAnalytics.selectedPeriod.totalViews),
        input.previous.pageViews,
      ),
      sessionsPct: pctChange(input.behaviourAnalytics.summary.totalSessions, input.previous.sessions),
      visitorsPct: pctChange(input.behaviourAnalytics.summary.distinctVisitors, input.previous.visitors),
      searchesPct: pctChange(
        compactNumber(input.searchAnalytics.summary?.totalSearches),
        input.previous.searches,
      ),
      intentEventsPct: pctChange(
        Math.round((input.behaviourAnalytics.summary.conversionIntentRate / 100) * input.behaviourAnalytics.summary.totalSessions),
        input.previous.intentEvents,
      ),
    },
  };

  return [
    "Analyse this store analytics payload and return JSON with this exact shape:",
    JSON.stringify({
      headline: "string",
      executiveSummary: "string",
      customerStory: "string",
      confidence: "high | medium | low",
      periodComparison: [
        { metric: "string", current: "string", previous: "string", interpretation: "string" },
      ],
      recommendations: [
        {
          priority: "high | medium | low",
          title: "string",
          recommendation: "string",
          evidence: "string",
          nextAction: "string",
        },
      ],
      patterns: ["string"],
      risks: ["string"],
    }),
    "",
    "Analytics payload:",
    JSON.stringify(current),
  ].join("\n");
}

export async function generateStoreAnalyticsAiInsights(input: {
  service: StoreAnalyticsServiceClient;
  userId: string;
  storeName: string;
  days: number;
}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const days = Math.max(1, Math.min(Number(input.days || 30) || 30, 365));
  const [summaryResult, searchResult, webAnalytics, behaviourAnalytics, previous] = await Promise.all([
    input.service.rpc("get_store_analytics_summary", {
      p_store_owner_id: input.userId,
      p_days: days,
    }),
    input.service.rpc("get_store_search_terms_summary", {
      p_store_owner_id: input.userId,
      p_days: days,
    }),
    getWebTrackingAnalytics(input.service, input.userId, {
      dailyDays: days,
      weekCount: Math.ceil(days / 7),
    }),
    getCustomerBehaviourAnalytics(input.service, input.userId, days),
    fetchPreviousPeriodSnapshot(input.service, input.userId, days),
  ]);

  if (summaryResult.error) throw summaryResult.error;
  if (searchResult.error) throw searchResult.error;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000 });
  const response = await openai.chat.completions.create({
    model: AI_MODEL,
    temperature: 0.25,
    max_completion_tokens: 1800,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: buildAiPrompt({
          days,
          storeName: input.storeName,
          currentSummary: (summaryResult.data ?? {}) as SummaryPayload,
          searchAnalytics: (searchResult.data ?? {}) as SearchPayload,
          webAnalytics,
          behaviourAnalytics,
          previous,
        }),
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("AI did not return analytics insights");

  const parsed = JSON.parse(content) as unknown;
  const validated = validateAiResponse(parsed, days);
  if (!validated) throw new Error("AI returned invalid analytics insights");
  return validated;
}
