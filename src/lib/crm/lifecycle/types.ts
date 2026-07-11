// Lifecycle CRM machine — shared types.
//
// The engine continuously classifies every CRM contact into a lifecycle
// stage, runs one automated outreach program per stage, and attributes
// POS revenue back against a deterministic holdout baseline.

import type { CampaignContent } from "../types";

export const LIFECYCLE_STAGES = [
  "new",
  "active",
  "vip",
  "reactivated",
  "at_risk",
  "dormant",
  "churned",
  "prospect",
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

export function isLifecycleStage(value: string): value is LifecycleStage {
  return (LIFECYCLE_STAGES as readonly string[]).includes(value);
}

/** Stage boundaries. Auto-computed per store; overridable in settings. */
export type LifecycleThresholds = {
  /** First purchase within this many days = "new". */
  new_days: number;
  /** Purchased within this many days = active/vip. */
  active_days: number;
  /** Recency beyond active but within this = at risk. */
  at_risk_days: number;
  /** Recency beyond at-risk but within this = dormant; beyond = churned. */
  dormant_days: number;
  /** Lifetime spend for VIP (top ~20% of spenders). */
  vip_min_spend: number;
  /** Days a returning lapsed customer stays "reactivated" before normal rules. */
  reactivated_hold_days: number;
};

export type LifecycleContactMetrics = {
  recency_days: number | null;
  frequency: number;
  monetary: number;
  aov: number;
  opted_out: boolean;
};

export type LifecycleState = {
  id: string;
  contact_id: string;
  stage: LifecycleStage;
  previous_stage: LifecycleStage | null;
  entered_at: string;
  metrics: LifecycleContactMetrics;
  updated_at: string;
};

export type LifecycleProgramMode = "review" | "auto";
export type LifecycleOfferPolicy = "none" | "soft" | "winback";

export type LifecycleProgram = {
  id: string;
  key: string;
  stage: LifecycleStage;
  name: string;
  description: string;
  enabled: boolean;
  mode: LifecycleProgramMode;
  entry_delay_days: number;
  cooldown_days: number;
  offer_policy: LifecycleOfferPolicy;
  config: Record<string, unknown>;
  last_run_at: string | null;
};

export type LifecycleActionStatus =
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "sent"
  | "skipped"
  | "expired"
  | "failed";

export type LifecycleActionTarget = {
  contact_id: string;
  email: string;
  first_name: string | null;
  lightspeed_customer_id: string | null;
  /** One line on why this specific customer is included. */
  context: string;
  is_holdout: boolean;
};

export type LifecycleEmailDraft = {
  subject: string;
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  templateKey: string;
  /**
   * Full campaign content when a saved / premade design is applied.
   * When absent, the classic CRM layout renderer uses title/body/cta only.
   */
  content?: CampaignContent;
  /** Human label for the chosen design (layout name or saved template name). */
  templateLabel?: string;
};

/** Per-program design preference stored in `crm_lifecycle_programs.config`. */
export type LifecycleProgramTemplateConfig = {
  /** Saved `crm_email_templates.id` — preferred when set. */
  templateId?: string | null;
  /** Classic CRM layout key (e.g. store_announcement) when not using a saved template. */
  templateKey?: string | null;
  /** Display name of the chosen design. */
  templateLabel?: string | null;
};

/**
 * A fully store-designed campaign for a program, stored in
 * `crm_lifecycle_programs.config.custom_email`. When present it is used
 * verbatim for every send (merge tags still apply) — the engine writes no
 * copy of its own.
 */
export type LifecycleProgramCustomEmail = {
  subject: string;
  templateKey: string;
  templateLabel?: string | null;
  content: CampaignContent;
  updated_at?: string;
};

/** Subject-line A/B test config, stored in `config.ab`. */
export type LifecycleProgramAbConfig = {
  enabled: boolean;
  /** Variant B subject; variant A is the campaign's main subject. */
  subject_b: string;
};

export type LifecycleActionPayload = {
  email: LifecycleEmailDraft;
  targets: LifecycleActionTarget[];
  /** Present when this send runs a subject A/B split. */
  ab?: {
    subject_b: string;
    /** Filled in after execution. */
    campaign_b_id?: string;
    a_count?: number;
    b_count?: number;
  };
};

export type LifecycleAction = {
  id: string;
  program_id: string | null;
  program_key: string;
  stage: LifecycleStage;
  status: LifecycleActionStatus;
  status_detail: string | null;
  subject: string;
  reasoning: string;
  payload: LifecycleActionPayload;
  contact_count: number;
  holdout_count: number;
  campaign_id: string | null;
  expires_at: string | null;
  executed_at: string | null;
  created_at: string;
};

export type LifecycleSettings = {
  user_id: string;
  is_enabled: boolean;
  timezone: string;
  frequency_cap_days: number;
  holdout_percent: number;
  attribution_window_days: number;
  thresholds: Partial<LifecycleThresholds>;
  learned: {
    /** Preferred local send hour derived from historical opens. */
    send_hour?: number;
    [key: string]: unknown;
  };
  last_classified_at: string | null;
  last_planned_at: string | null;
  last_attributed_at: string | null;
};

export type LifecycleInsight = {
  id: string;
  program_key: string | null;
  kind: "lesson" | "timing" | "cadence" | "alert";
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
  status: "active" | "dismissed" | "superseded";
  created_at: string;
};

export type LifecycleProgramStats = {
  program_key: string;
  actions_sent: number;
  emails_sent: number;
  open_rate: number | null;
  click_rate: number | null;
  conversions: number;
  attributed_revenue: number;
  holdout_baseline: number;
  incremental_revenue: number;
  unsubscribes: number;
  reactivations: number;
};

export type LifecycleStageDistribution = {
  stage: LifecycleStage;
  count: number;
  /** Net movement into (+) or out of (−) the stage over the last 7 days. */
  delta7d: number;
  totalSpend: number;
};

export type LifecycleImpact = {
  window_days: number;
  emails_sent: number;
  contacts_touched: number;
  attributed_revenue: number;
  holdout_baseline: number;
  incremental_revenue: number;
  conversions: number;
  reactivations: number;
  unsubscribes: number;
};
