export const COACH_CONFIG_FIELDS = [
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

export type CoachConfigField = (typeof COACH_CONFIG_FIELDS)[number];

export type PromptCoachProposal = {
  id: string;
  target: "config" | "knowledge";
  operation: "add" | "append" | "replace" | "delete";
  field?: CoachConfigField | null;
  knowledgeItemId?: string | null;
  title?: string | null;
  currentSnippet?: string | null;
  proposedSnippet?: string | null;
  mergedValue?: string | null;
  status: "ready" | "contradiction" | "duplicate";
  summary: string;
  conflictingLine?: string | null;
};

export type PromptCoachChatMessage = {
  role: "user" | "assistant";
  text: string;
};

export type PromptCoachChatResult = {
  reply: string;
  followUp: string | null;
  proposals: PromptCoachProposal[];
};

export type PromptCoachUndoSnapshot = {
  proposalId: string;
  target: "config" | "knowledge";
  field?: CoachConfigField | null;
  knowledgeItemId?: string | null;
  title?: string | null;
  /** Content before the apply. null when a new knowledge item was created. */
  previousValue: string | null;
  /** Present when a knowledge item was deleted — used to recreate on undo. */
  deletedContent?: string | null;
  /** When booking apply scrubbed FAQ/extra knowledge, restore this on undo. */
  previousExtraKnowledge?: string | null;
  operationApplied: "add" | "append" | "replace" | "delete";
};

export type PromptCoachApplyResult = {
  applied: Array<{
    id: string;
    ok: boolean;
    summary: string;
    error?: string;
    undo?: PromptCoachUndoSnapshot;
  }>;
};

const FIELD_LABELS: Record<CoachConfigField, string> = {
  business_display_name: "Business name",
  opening_line: "Opening message",
  contact_text: "Contact details",
  hours_text: "Hours",
  prices_text: "Pricing",
  services_products_text: "Services & products",
  booking_info_text: "Booking info",
  policies_text: "Policies",
  extra_knowledge: "Extra knowledge",
  style_notes: "Style notes",
  topics_to_avoid: "Topics to avoid",
  escalation_text: "Escalation rules",
};

export function coachFieldLabel(field: CoachConfigField | null | undefined): string {
  if (!field) return "Nest settings";
  return FIELD_LABELS[field] ?? field;
}

export function isConfigField(value: unknown): value is CoachConfigField {
  return typeof value === "string" && (COACH_CONFIG_FIELDS as readonly string[]).includes(value);
}

export { FIELD_LABELS };
