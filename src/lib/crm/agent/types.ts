// CRM 2.0 agent types — brief parsing, audience rules, orchestration state.

import type { CampaignContent, CampaignItem, CrmContact } from "../types";

export type AudienceRuleType =
  | "min_spend"
  | "max_spend"
  | "min_visits"
  | "max_visits"
  | "joined_within_days"
  | "joined_before_days"
  | "last_purchase_within_days"
  | "no_purchase_within_days"
  | "inactive_days"
  | "purchased_category"
  | "purchased_brand"
  | "purchased_keyword"
  | "lapsed"
  | "new_members"
  | "high_value";

export type AudienceRule = {
  type: AudienceRuleType;
  value?: string | number;
  label?: string;
};

export type CrmPromoBrief = {
  kind: "none" | "percent_off" | "on_sale_only";
  discount_percent: number | null;
  brand: string | null;
  keyword: string | null;
  label: string | null;
  only_on_sale: boolean;
};

export type CrmAgentBrief = {
  campaign_goal: string;
  tone: string;
  audience_description: string;
  product_focus: string;
  layout_preference: "classic" | "minimal" | "editorial";
  include_products: boolean;
  max_recipients?: number | null;
  promo: CrmPromoBrief;
};

export type AudiencePreviewContact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  total_spend: number;
  sale_count: number;
  last_purchase_at: string | null;
  lightspeed_joined_at: string | null;
};

export type AudienceFunnelStep = {
  label: string;
  detail?: string;
  count: number;
};

export type AudienceResolution = {
  contactIds: string[];
  count: number;
  sample: AudiencePreviewContact[];
  rules: AudienceRule[];
  excludedOptedOut: number;
  sort?: {
    label: string;
    fields: string[];
  };
  /** How each rule narrowed the audience — the specs sheet renders this verbatim. */
  funnel?: AudienceFunnelStep[];
};

export type AgentProductPick = CampaignItem & {
  productId?: string;
  reason?: string;
};

export type AgentComposeResult = {
  subject: string;
  subjectVariants: string[];
  templateKey: string;
  content: CampaignContent;
  reasoning: string;
};

export type CrmAgentRunResult = {
  runId: string;
  brief: CrmAgentBrief;
  audience: AudienceResolution;
  products: AgentProductPick[];
  campaign: AgentComposeResult;
};

export type CrmAgentProgressEvent =
  | { type: "step"; step: string; message: string }
  | { type: "brief"; brief: CrmAgentBrief; rules: AudienceRule[] }
  | { type: "audience"; audience: AudienceResolution }
  | { type: "products"; products: AgentProductPick[] }
  | { type: "campaign"; campaign: AgentComposeResult }
  | { type: "complete"; result: CrmAgentRunResult }
  | { type: "error"; message: string };

export type CrmAudiencePreset = {
  id: string;
  name: string;
  description: string | null;
  prompt: string | null;
  audience_rules: AudienceRule[];
  created_at: string;
  updated_at: string;
};

export type CrmScheduledCampaign = {
  id: string;
  name: string;
  prompt: string | null;
  preset_id: string | null;
  schedule_type: "once" | "weekly" | "monthly";
  scheduled_at: string;
  auto_send: boolean;
  enabled: boolean;
  last_run_at: string | null;
  last_campaign_id: string | null;
  created_at: string;
};

export type StoreAgentContext = {
  storeName: string;
  logoUrl: string | null;
  styleProfile: {
    tone?: string;
    greeting_style?: string;
    signoff_style?: string;
    common_phrases?: string[];
  } | null;
  pastCampaigns: Array<{
    subject: string;
    openRate: number;
    clickRate: number;
    sentAt: string | null;
  }>;
  contactStats: {
    total: number;
    eligible: number;
    optedOut: number;
  };
};

export function contactToPreview(contact: CrmContact): AudiencePreviewContact {
  return {
    id: contact.id,
    email: contact.email,
    first_name: contact.first_name,
    last_name: contact.last_name,
    total_spend: contact.total_spend ?? 0,
    sale_count: contact.sale_count ?? 0,
    last_purchase_at: contact.last_purchase_at,
    lightspeed_joined_at: contact.lightspeed_joined_at,
  };
}
