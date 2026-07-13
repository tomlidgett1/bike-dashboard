import type {
  BrandKnowledgeProduct,
  BrandKnowledgeSourceType,
  BrandKnowledgeStatus,
} from "@/lib/nest-portal/lib/brand-knowledge";

export const NEST_WORKSPACE_TABS = ["learn", "test", "knowledge"] as const;

export type NestWorkspaceTab = (typeof NEST_WORKSPACE_TABS)[number];

export const NEST_EDITABLE_CONFIG_FIELDS = [
  "business_display_name",
  "opening_line",
  "contact_text",
  "hours_text",
  "prices_text",
  "services_products_text",
  "booking_info_text",
  "policies_text",
  "extra_knowledge",
  "style_notes",
  "topics_to_avoid",
  "escalation_text",
] as const;

export type NestEditableConfigField =
  (typeof NEST_EDITABLE_CONFIG_FIELDS)[number];

export type NestWorkspaceField = {
  key: NestEditableConfigField;
  label: string;
  description: string;
  category: "business" | "behaviour";
  value: string;
  updatedAt: string;
  assignedProducts: BrandKnowledgeProduct[];
};

export type NestWorkspaceKnowledgeItem = {
  id: string;
  title: string;
  content: string;
  summary: string;
  sourceType: BrandKnowledgeSourceType;
  status: BrandKnowledgeStatus;
  assignedProducts: BrandKnowledgeProduct[];
  legacyFieldKey: string | null;
  fileName: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NestWorkspaceRuntimeLayer = {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
};

export type NestWorkspaceContext = {
  brandKey: string;
  displayName: string;
  configUpdatedAt: string;
  fields: NestWorkspaceField[];
  knowledge: NestWorkspaceKnowledgeItem[];
  compiledStorePrompt: string;
  personalityPrompt: string;
  businessTimezone: string;
  openingSchedule: Record<string, unknown>;
  styleTemplate: string;
  runtime: {
    models: Array<{ label: string; value: string; description: string }>;
    inputs: NestWorkspaceRuntimeLayer[];
    guardrails: NestWorkspaceRuntimeLayer[];
    tools: NestWorkspaceRuntimeLayer[];
  };
  health: {
    completedFields: number;
    totalFields: number;
    knowledgeCount: number;
    possibleDuplicateCount: number;
    failedKnowledgeCount: number;
  };
};

export type NestConflictRelationship =
  | "duplicate"
  | "contradiction"
  | "overlap";

export type NestConflictMatch = {
  sourceId: string;
  sourceType: "config" | "knowledge";
  title: string;
  relationship: NestConflictRelationship;
  existingText: string;
  reason: string;
};

export type NestConflictAnalysis = {
  status: "clear" | NestConflictRelationship;
  summary: string;
  matches: NestConflictMatch[];
};

export type NestRevisionSource = "manual" | "coach" | "restore";
export type NestRevisionTargetType = "config" | "knowledge";
export type NestRevisionOperation = "create" | "update" | "delete" | "restore";

export type NestContentRevision = {
  id: string;
  brandKey: string;
  actorUserId: string | null;
  actorRole: string;
  source: NestRevisionSource;
  targetType: NestRevisionTargetType;
  targetKey: string;
  operation: NestRevisionOperation;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  restoredFromRevisionId: string | null;
  createdAt: string;
};

export type NestTestPromptSource = {
  title: string;
  excerpt: string;
};

export type NestProductionTestTrace = {
  model: string | null;
  route: string | null;
  totalLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolsUsed: string[];
  context: string[];
  promptSources?: NestTestPromptSource[];
};
