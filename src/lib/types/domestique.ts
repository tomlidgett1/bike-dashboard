/**
 * The Domestique — background revenue agent types.
 *
 * The agent runs a nightly loop per store: detect opportunities from the
 * Lightspeed mirrors → score → propose plays (or auto-execute on autopilot)
 * over CRM email, Nest texts and storefront discounts → record every touch →
 * attribute POS revenue back against a holdout baseline.
 */

export type DomestiqueMode = "suggest" | "copilot" | "autopilot";

export type DomestiquePlaybookKey =
  | "service_chase"
  | "first_service_rescue"
  | "vip_winback"
  | "dead_stock_mover"
  | "consumables_cadence";

export type DomestiqueOpportunityStatus =
  | "proposed"
  | "approved"
  | "executing"
  | "executed"
  | "skipped"
  | "failed"
  | "expired";

export type DomestiqueChannel = "email" | "sms" | "email_sms" | "discount";

export interface DomestiqueConfig {
  user_id: string;
  is_enabled: boolean;
  mode: DomestiqueMode;
  timezone: string;
  run_hour: number;
  enabled_playbooks: DomestiquePlaybookKey[];
  autopilot_playbooks: DomestiquePlaybookKey[];
  max_plays_per_day: number;
  contact_cooldown_days: number;
  holdout_percent: number;
  attribution_window_days: number;
  max_sms_per_play: number;
  max_discount_percent: number;
  min_margin_floor_percent: number;
  send_brief_via_nest: boolean;
  brief_phone: string | null;
  last_run_at: string | null;
  last_brief_sent_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export type DomestiqueConfigUpdate = Partial<
  Omit<DomestiqueConfig, "user_id" | "last_run_at" | "last_brief_sent_at" | "created_at" | "updated_at">
>;

/** A customer targeted by a play. */
export interface DomestiqueTargetContact {
  contact_id: string;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  lightspeed_customer_id: string | null;
  /** Detector-specific context, e.g. "Trek Marlin 7 bought 11 months ago". */
  context?: string;
  /** Deterministically assigned holdout — recorded but never contacted. */
  is_holdout?: boolean;
}

/** A product discount within a dead-stock play. */
export interface DomestiqueDiscountItem {
  product_id: string;
  lightspeed_item_id: string | null;
  name: string;
  image_url?: string | null;
  category_name?: string | null;
  retail: number;
  cost: number;
  soh: number;
  days_since_sold: number | null;
  discount_percent: number;
  sale_price: number;
  margin_at_sale: number | null;
  reason: string;
  /** Product is already queued in an active/upcoming Specials carousel cycle. */
  in_specials_cycle?: boolean;
}

export interface DomestiqueEmailPlan {
  subject: string;
  title: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
  templateKey: string;
}

export interface DomestiqueActionPlan {
  channel: DomestiqueChannel;
  email?: DomestiqueEmailPlan;
  /** SMS body only — intro/signoff templates applied at send time. */
  sms?: { body: string };
  contacts?: DomestiqueTargetContact[];
  discounts?: DomestiqueDiscountItem[];
  /** Days a discount stays active. */
  discount_days?: number;
}

export interface DomestiqueEvidence {
  /** Human-readable bullet points backing the play. */
  points: string[];
  /** Detector metrics snapshot for the audit trail. */
  metrics?: Record<string, number | string | null>;
}

export interface DomestiqueOpportunity {
  id: string;
  user_id: string;
  run_id: string | null;
  playbook_key: DomestiquePlaybookKey;
  title: string;
  summary: string;
  evidence: DomestiqueEvidence;
  action_plan: DomestiqueActionPlan;
  expected_value: number;
  confidence: number;
  customer_count: number;
  product_count: number;
  status: DomestiqueOpportunityStatus;
  status_detail: string | null;
  result: DomestiqueExecutionResult | null;
  approved_at: string | null;
  executed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at?: string;
}

export interface DomestiqueExecutionResult {
  campaign_id?: string;
  emails_sent?: number;
  emails_failed?: number;
  sms_sent?: number;
  sms_failed?: number;
  holdouts?: number;
  products_discounted?: number;
  errors?: string[];
}

export interface DomestiqueRun {
  id: string;
  user_id: string;
  status: "running" | "completed" | "failed";
  trigger: "cron" | "manual";
  detectors_run: number;
  opportunities_found: number;
  opportunities_proposed: number;
  auto_executed: number;
  error: string | null;
  summary: Record<string, unknown> | null;
  started_at: string;
  finished_at: string | null;
}

export interface DomestiqueTouch {
  id: string;
  user_id: string;
  opportunity_id: string | null;
  playbook_key: string;
  contact_id: string | null;
  lightspeed_customer_id: string | null;
  channel: "email" | "sms" | "holdout";
  is_holdout: boolean;
  touched_at: string;
  attributed_revenue: number;
  attributed_sale_count: number;
  last_attributed_at: string | null;
}

export interface DomestiqueReceipt {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  touches_count: number;
  holdout_count: number;
  plays_executed: number;
  attributed_revenue: number;
  holdout_baseline: number;
  incremental_revenue: number;
  breakdown: Record<string, { touches: number; revenue: number }> | null;
  created_at: string;
}

/** Registry metadata for a playbook. */
export interface DomestiquePlaybookDefinition {
  key: DomestiquePlaybookKey;
  name: string;
  description: string;
  channel: DomestiqueChannel;
  /** Days before this playbook may propose again after a proposal. */
  cooldown_days: number;
  /** Rough conversion-rate assumption used for expected value. */
  assumed_conversion: number;
  /** Step-by-step explanation of exactly how the playbook detects and acts. */
  mechanics: string[];
}

/** Editable fields on a proposed opportunity (PATCH payload). */
export interface DomestiqueOpportunityEdit {
  email?: Partial<Pick<DomestiqueEmailPlan, "subject" | "title" | "body" | "ctaText" | "ctaUrl">>;
  sms?: { body: string };
  discount_days?: number;
  remove_discount_product_ids?: string[];
}
