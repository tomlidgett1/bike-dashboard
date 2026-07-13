import { proxyNestBrandPortalRequest } from "@/lib/nest/brand-portal-client";
import {
  buildChatbotPersonalityMarkdown,
} from "@/lib/nest-portal/lib/brand-raw-prompt";
import {
  LEGACY_KNOWLEDGE_SEED_FIELDS,
  normaliseKnowledgeProducts,
  type BrandKnowledgeProduct,
  type BrandKnowledgeSourceType,
  type BrandKnowledgeStatus,
} from "@/lib/nest-portal/lib/brand-knowledge";
import type { NestConflictEntry } from "@/lib/nest/nest-knowledge-conflicts";
import {
  NEST_EDITABLE_CONFIG_FIELDS,
  type NestEditableConfigField,
  type NestWorkspaceContext,
  type NestWorkspaceField,
  type NestWorkspaceKnowledgeItem,
  type NestWorkspaceRuntimeLayer,
} from "@/lib/nest/nest-workspace-types";

const FIELD_META: Record<
  NestEditableConfigField,
  Pick<NestWorkspaceField, "label" | "description" | "category">
> = {
  business_display_name: {
    label: "Business name",
    description: "The store name Nest uses with customers.",
    category: "business",
  },
  opening_line: {
    label: "Opening message",
    description: "How Nest greets a customer at the start of a conversation.",
    category: "behaviour",
  },
  contact_text: {
    label: "Contact details",
    description: "Phone, email, address and the best ways to reach your store.",
    category: "business",
  },
  hours_text: {
    label: "Opening hours",
    description: "Trading hours, public holiday changes and closures.",
    category: "business",
  },
  prices_text: {
    label: "Prices and packages",
    description: "Service prices, estimates and how Nest should discuss costs.",
    category: "business",
  },
  services_products_text: {
    label: "Services and products",
    description: "What your store sells, services and does not offer.",
    category: "business",
  },
  booking_info_text: {
    label: "Bookings and enquiries",
    description: "How appointments, repairs, bike fits and timing are handled.",
    category: "business",
  },
  policies_text: {
    label: "Policies",
    description: "Returns, cancellations, warranties and store-specific rules.",
    category: "business",
  },
  extra_knowledge: {
    label: "Extra knowledge",
    description: "Useful facts that do not fit another business section.",
    category: "business",
  },
  style_notes: {
    label: "Voice and tone",
    description: "Words, tone and communication habits Nest should follow.",
    category: "behaviour",
  },
  topics_to_avoid: {
    label: "Topics to avoid",
    description: "Claims or subjects Nest must not discuss or promise.",
    category: "behaviour",
  },
  escalation_text: {
    label: "Human hand-off",
    description: "When Nest should stop and ask a team member to help.",
    category: "behaviour",
  },
};

const DEFAULT_PRODUCTS = new Map<string, BrandKnowledgeProduct[]>(
  LEGACY_KNOWLEDGE_SEED_FIELDS.map((field) => [
    field.legacy_field_key,
    [...field.defaultProducts],
  ]),
);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asDateText(value: unknown): string {
  return typeof value === "string" && value ? value : new Date(0).toISOString();
}

function nestedEnabled(
  settings: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean {
  const row = asRecord(settings[key]);
  return typeof row.enabled === "boolean" ? row.enabled : fallback;
}

function mapKnowledgeItem(row: Record<string, unknown>): NestWorkspaceKnowledgeItem {
  const sourceType = ["text", "pdf", "file", "legacy_field"].includes(
    String(row.source_type),
  )
    ? (row.source_type as BrandKnowledgeSourceType)
    : "text";
  const status = ["processing", "ready", "failed", "archived"].includes(
    String(row.status),
  )
    ? (row.status as BrandKnowledgeStatus)
    : "ready";
  return {
    id: asText(row.id),
    title: asText(row.title) || "Untitled",
    content: asText(row.content_text),
    summary: asText(row.summary),
    sourceType,
    status,
    assignedProducts: normaliseKnowledgeProducts(row.assigned_products),
    legacyFieldKey:
      typeof row.legacy_field_key === "string" ? row.legacy_field_key : null,
    fileName: typeof row.file_name === "string" ? row.file_name : null,
    errorMessage:
      typeof row.error_message === "string" ? row.error_message : null,
    createdAt: asDateText(row.created_at),
    updatedAt: asDateText(row.updated_at),
  };
}

function runtimeLayer(
  id: string,
  title: string,
  description: string,
  enabled = true,
): NestWorkspaceRuntimeLayer {
  return { id, title, description, enabled };
}

function countPossibleDuplicates(items: NestWorkspaceKnowledgeItem[]): number {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const item of items) {
    if (item.legacyFieldKey || item.status === "archived") continue;
    const key = item.content.toLowerCase().replace(/\s+/g, " ").trim();
    if (!key) continue;
    if (seen.has(key)) duplicates += 1;
    seen.add(key);
  }
  return duplicates;
}

export async function loadNestWorkspaceContext(
  brandKey: string,
): Promise<NestWorkspaceContext> {
  const [configResponse, knowledgeResponse] = await Promise.all([
    proxyNestBrandPortalRequest(brandKey, { method: "GET" }),
    proxyNestBrandPortalRequest(brandKey, {
      method: "GET",
      endpoint: "brand-portal-knowledge",
    }),
  ]);

  const config = asRecord(configResponse.config ?? configResponse);
  const configUpdatedAt = asDateText(config.updated_at);
  const fields = NEST_EDITABLE_CONFIG_FIELDS.map((key) => ({
    key,
    ...FIELD_META[key],
    value: asText(config[key]),
    updatedAt: configUpdatedAt,
    assignedProducts:
      DEFAULT_PRODUCTS.get(key) ?? (["nest_chat"] as BrandKnowledgeProduct[]),
  }));

  const knowledge = Array.isArray(knowledgeResponse.items)
    ? knowledgeResponse.items
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item && typeof item === "object"),
        )
        .map(mapKnowledgeItem)
    : [];

  const lightspeed = asRecord(config.lightspeed_settings);
  const tools = [
    runtimeLayer(
      "workorders",
      "Work order lookup",
      "Nest can check repair progress after matching the customer.",
      nestedEnabled(lightspeed, "workorder_lookup", true),
    ),
    runtimeLayer(
      "inventory",
      "Inventory lookup",
      "Nest can check live products and stock levels.",
      nestedEnabled(lightspeed, "inventory_lookup", true),
    ),
    runtimeLayer(
      "pricing",
      "Live inventory pricing",
      "Nest can share current product pricing when available.",
      nestedEnabled(lightspeed, "inventory_pricing", true),
    ),
    runtimeLayer(
      "booking",
      "Booking tools",
      "Nest can prepare service bookings using your booking rules.",
      nestedEnabled(lightspeed, "booking", true),
    ),
    runtimeLayer(
      "handoff",
      "Human hand-off",
      "Nest can notify the store when a customer needs a person.",
      Boolean(config.handoff_phone_e164 || asText(config.escalation_text)),
    ),
  ];

  const inputs = [
    runtimeLayer(
      "business",
      "Business facts",
      "Your hours, pricing, services, booking details and policies.",
    ),
    runtimeLayer(
      "knowledge",
      "Knowledge base",
      "Every ready item assigned to the active customer channel.",
      knowledge.some((item) => item.status === "ready"),
    ),
    runtimeLayer(
      "conversation",
      "Conversation history",
      "Recent customer messages and a compact summary of older turns.",
    ),
    runtimeLayer(
      "live-tools",
      "Live store systems",
      "Approved Lightspeed and booking data when a question needs it.",
      tools.some((tool) => tool.enabled),
    ),
  ];

  const guardrails = [
    runtimeLayer(
      "accuracy",
      "Accuracy first",
      "Nest must not invent store facts, stock, prices or booking availability.",
    ),
    runtimeLayer(
      "privacy",
      "Customer privacy",
      "Private store and customer information is only used when authorised.",
    ),
    runtimeLayer(
      "delivery",
      "Message delivery",
      "Replies stay concise and suitable for SMS and iMessage.",
    ),
    runtimeLayer(
      "handoff-rule",
      "Safe hand-off",
      "Uncertain or sensitive requests are passed to a team member.",
    ),
  ];

  const completedFields = fields.filter((field) => field.value.trim()).length;
  return {
    brandKey,
    displayName: asText(config.business_display_name) || brandKey,
    configUpdatedAt,
    fields,
    knowledge,
    compiledStorePrompt: asText(config.business_raw_prompt),
    personalityPrompt: buildChatbotPersonalityMarkdown(config),
    businessTimezone: asText(config.business_timezone) || "Australia/Melbourne",
    openingSchedule: asRecord(config.opening_schedule),
    styleTemplate: asText(config.style_template) || "warm_local",
    runtime: {
      models: [
        {
          label: "Standard replies",
          value: "GPT-5.4 mini",
          description: "Fast customer replies and straightforward questions.",
        },
        {
          label: "Tool-heavy replies",
          value: "GPT-5.4",
          description: "Used when a request needs deeper reasoning or store tools.",
        },
      ],
      inputs,
      guardrails,
      tools,
    },
    health: {
      completedFields,
      totalFields: fields.length,
      knowledgeCount: knowledge.filter((item) => item.status !== "archived").length,
      possibleDuplicateCount: countPossibleDuplicates(knowledge),
      failedKnowledgeCount: knowledge.filter((item) => item.status === "failed")
        .length,
    },
  };
}

export function nestContextConflictEntries(
  context: NestWorkspaceContext,
): NestConflictEntry[] {
  const fields = context.fields
    .filter((field) => field.value.trim())
    .map((field) => ({
      sourceId: `config:${field.key}`,
      sourceType: "config" as const,
      title: field.label,
      content: field.value,
    }));
  const knowledge = context.knowledge
    .filter(
      (item) =>
        !item.legacyFieldKey &&
        item.status !== "archived" &&
        item.content.trim(),
    )
    .map((item) => ({
      sourceId: `knowledge:${item.id}`,
      sourceType: "knowledge" as const,
      title: item.title,
      content: item.content,
    }));
  return [...fields, ...knowledge];
}
