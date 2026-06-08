/**
 * Genie Store Agent — proposal contracts.
 *
 * The agent endpoint (/api/genie/agent) NEVER mutates. It streams `proposal`
 * events describing an intended change. The UI shows a preview + Apply button.
 * On Apply, the exact proposal object is POSTed to /api/genie/agent/apply,
 * which re-validates ownership and performs the mutation.
 *
 * These types are the single source of truth shared by all three.
 */

export type CarouselSizeOption = 'featured' | 'normal' | 'compact';

/** One carousel row whose order/visibility/size will change. */
export interface CarouselChange {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  carousel_size: CarouselSizeOption;
  // Previous values, for a before→after diff in the UI.
  prev_display_order: number;
  prev_is_active: boolean;
  prev_carousel_size: CarouselSizeOption;
}

export interface CarouselLayoutProposal {
  kind: 'carousel_layout';
  summary: string;
  /** Only the rows that actually change (what Apply will write). */
  changes: CarouselChange[];
  /** Full resulting order, for a readable "this is how your page will look" list. */
  order_preview: Array<{ name: string; is_active: boolean; carousel_size: CarouselSizeOption }>;
}

/**
 * Sentinel id that marks where the about-to-be-created carousel sits inside
 * `CarouselCreateProposal.ordered_ids`. The real (DB-assigned) id replaces it
 * on Apply, after the row is inserted.
 */
export const NEW_CAROUSEL_SLOT = '__new_carousel__';

export interface CarouselProductRef {
  id: string;
  name: string;
}

/** Create a brand-new custom carousel of products, named and positioned. */
export interface CarouselCreateProposal {
  kind: 'carousel_create';
  summary: string;
  /** The new carousel's display name. */
  name: string;
  carousel_size: CarouselSizeOption;
  /** Human label for the products matched, e.g. "12 products matching \"Clif\"". */
  match_label: string;
  product_ids: string[];
  products_preview: CarouselProductRef[];
  /**
   * Final display order of carousel ids after insertion. Exactly one entry is
   * the NEW_CAROUSEL_SLOT sentinel marking the new carousel's slot.
   */
  ordered_ids: string[];
  /** Readable resulting order for the preview UI; is_new flags the new row. */
  order_preview: Array<{ name: string; is_active: boolean; carousel_size: CarouselSizeOption; is_new: boolean }>;
}

/** Rename an existing carousel. */
export interface CarouselRenameProposal {
  kind: 'carousel_rename';
  summary: string;
  id: string;
  prev_name: string;
  name: string;
}

export interface DiscountProductPreview {
  id: string;
  name: string;
  price: number;
  sale_price: number;
}

export interface DiscountApplyProposal {
  kind: 'discount_apply';
  summary: string;
  /** Human label for what was matched, e.g. "all products matching \"Clif\"". */
  match_label: string;
  discount_percent: number;
  /** ISO timestamp, or null for no expiry. */
  ends_at: string | null;
  product_ids: string[];
  products_preview: DiscountProductPreview[];
}

export interface DiscountRemoveProposal {
  kind: 'discount_remove';
  summary: string;
  match_label: string;
  product_ids: string[];
  products_preview: Array<{ id: string; name: string }>;
}

export interface PriceUpdateProductPreview {
  id: string;
  name: string;
  current_price: number;
  new_price: number;
  /** Cost used to compute the margin, if available. */
  cost: number | null;
  /** Gross margin % = (new_price - cost) / new_price * 100, or null if no cost. */
  margin_percent: number | null;
}

/** Propose retail price adjustments computed from cost / markup. */
export interface PriceUpdateProposal {
  kind: 'price_update';
  summary: string;
  /** Human label for the products matched. */
  match_label: string;
  product_ids: string[];
  /** Map of product_id → new retail price (rounded to 2dp). */
  new_prices: Record<string, number>;
  products_preview: PriceUpdateProductPreview[];
}

/** One product whose brand and/or category will be written back to Lightspeed. */
export interface ProductBrandCategoryChange {
  lightspeed_item_id: string;
  product_name: string;
  sku: string | null;
  image_url: string | null;
  prev_brand_id: string | null;
  prev_brand_name: string | null;
  next_brand_id: string | null;
  next_brand_name: string | null;
  /** When true, Lightspeed manufacturer is created on apply before assigning. */
  create_brand?: boolean;
  /** When true, clears the product brand in Lightspeed (manufacturerID 0). */
  clear_brand?: boolean;
  prev_category_id: string | null;
  prev_category_name: string | null;
  prev_category_path: string | null;
  next_category_id: string | null;
  next_category_name: string | null;
  next_category_path: string | null;
  /** Parent Lightspeed category id when creating a nested category. */
  next_category_parent_id?: string | null;
  /** When true, Lightspeed category is created on apply before assigning. */
  create_category?: boolean;
  /** When true, clears the product category in Lightspeed (categoryID 0). */
  clear_category?: boolean;
}

/** Stage brand/category changes for human approval before Lightspeed write-back. */
export interface ProductBrandCategoryUpdateProposal {
  kind: 'product_brand_category_update';
  summary: string;
  match_label: string;
  changes: ProductBrandCategoryChange[];
}

/** Stage a new Lightspeed category (no product assignment). */
export interface LightspeedCategoryCreateProposal {
  kind: 'lightspeed_category_create';
  summary: string;
  name: string;
  path: string;
  parent_category_id: string | null;
  parent_category_name: string | null;
}

export type GmailEmailActionKind = 'send' | 'draft';

/** Stage a Gmail send or draft for human approval before Composio executes. */
export interface GmailEmailActionProposal {
  kind: 'gmail_email_action';
  action: GmailEmailActionKind;
  summary: string;
  recipient_email: string;
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  is_html?: boolean;
  connected_account_id?: string | null;
  /** Short human-readable description for the approval card. */
  description: string;
  /** Data categories shown in the approval card footer. */
  sharing_data: Array<{ label: string; value: string }>;
}

export type GmailSortOrder = 'newest' | 'oldest';

export type GmailScanDepth = 'quick' | 'full';

export type GmailSenderRoleHint = 'sales' | 'support' | 'automated' | 'unknown';

export interface GmailSenderSummary {
  from: string;
  email_count: number;
  first_seen_ms: number | null;
  first_seen_label: string | null;
  last_seen_ms: number | null;
  last_seen_label: string | null;
  display_name?: string | null;
  email_address?: string | null;
  role_hint?: GmailSenderRoleHint;
  sample_subjects?: string[];
}

export interface GmailContactCandidate {
  from: string;
  display_name: string | null;
  email_address: string | null;
  role_hint: GmailSenderRoleHint;
  first_seen_ms: number | null;
  first_seen_label: string | null;
  email_count: number;
  sample_subjects: string[];
  sales_signal_score: number;
}

export interface GmailContactAnalysis {
  earliest_likely_sales_contact: GmailContactCandidate | null;
  earliest_any_contact: GmailContactCandidate | null;
  likely_sales_contacts: GmailContactCandidate[];
  support_or_automated_senders: GmailContactCandidate[];
  analysis_notes: string[];
}

export interface GmailEmailPreview {
  message_id: string;
  thread_id: string | null;
  subject: string;
  from: string;
  to: string | null;
  snippet: string;
  /** Unix ms for reliable sorting; null when Composio omits a timestamp. */
  internal_date_ms: number | null;
  date_label: string | null;
  /** Composio connected account that owns this message (multi-mailbox search). */
  connected_account_id?: string;
  mailbox_label?: string | null;
}

/** Full message text for the agent — not shown in the Gmail UI card. */
export interface GmailMessageContent extends GmailEmailPreview {
  body_text: string;
  body_truncated: boolean;
}

export interface GmailAgentContextBody {
  message_id: string;
  connected_account_id?: string;
  thread_id?: string | null;
  from: string;
  to: string | null;
  subject: string;
  mailbox_label?: string | null;
  body_text: string;
}

/** Compact Gmail state carried across chat turns for reply/draft follow-ups. */
export interface GmailAgentContext {
  message_bodies?: GmailAgentContextBody[];
}

export interface GmailEmailsPayload {
  title: string;
  query: string;
  emails: GmailEmailPreview[];
  truncated?: boolean;
  connected_mailboxes?: Array<{
    id: string;
    label: string;
    email_address: string | null;
  }>;
  /** Agent-only context for follow-up turns; not rendered in the UI card. */
  agent_context?: GmailAgentContext;
  scan_stats?: {
    total_matched: number;
    pages_scanned: number;
    scan_mode: GmailScanDepth;
    oldest_date_ms: number | null;
    newest_date_ms: number | null;
    oldest_date_label: string | null;
    newest_date_label: string | null;
    capped: boolean;
    mailboxes_searched?: number;
  };
  sender_summary?: GmailSenderSummary[];
  contact_analysis?: GmailContactAnalysis;
  message_bodies?: GmailMessageContent[];
  answer_readiness?: {
    ready_to_answer: boolean;
    gaps: string[];
    criteria_checked: string[];
  };
}

/** Gmail OAuth connect card streamed when the store needs to authorise Gmail. */
export interface GmailConnectPayload {
  url: string;
  reason?: 'search' | 'send' | 'status' | 'add_account';
  accounts?: Array<{
    id: string;
    label: string;
    email_address: string | null;
    status: string;
  }>;
  can_add_more?: boolean;
}

export type GenieProposal =
  | CarouselLayoutProposal
  | CarouselCreateProposal
  | CarouselRenameProposal
  | DiscountApplyProposal
  | DiscountRemoveProposal
  | PriceUpdateProposal
  | ProductBrandCategoryUpdateProposal
  | LightspeedCategoryCreateProposal
  | GmailEmailActionProposal;

/** Read-only Lightspeed work order row streamed to the Genie UI. */
export interface GenieWorkorderLineCard {
  line_id: string;
  note: string;
  done: boolean;
}

export interface GenieWorkorderItemCard {
  item_id: string;
  description: string | null;
  sku: string | null;
  note: string;
  quantity: number | null;
  unit_price: number | null;
  line_total: number | null;
}

export interface GenieWorkorderCard {
  workorder_id: string;
  status_id: string;
  status_name: string;
  status_system_value: string | null;
  is_finished: boolean;
  archived: boolean;
  time_in: string;
  eta_out: string;
  updated_at: string;
  note: string;
  internal_note: string;
  warranty: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  employee_id: string;
  shop_id: string;
  sale_id: string | null;
  serialized_id: string | null;
  lines: GenieWorkorderLineCard[];
  items: GenieWorkorderItemCard[];
  items_subtotal: number | null;
}

export interface GenieWorkorderCardsPayload {
  title: string;
  scope: 'open' | 'finished' | 'all' | 'single';
  truncated?: boolean;
  workorders: GenieWorkorderCard[];
}

export interface GenieCustomerProfileCandidate {
  customer_id: string;
  name: string;
  company: string | null;
}

export interface GenieCustomerProfileContactPhone {
  number: string;
  use_type: string | null;
}

export interface GenieCustomerProfileContactEmail {
  address: string;
  use_type: string | null;
}

export interface GenieCustomerProfileAddress {
  address1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

export interface GenieCustomerProfileCustomer {
  customer_id: string;
  name: string;
  company: string | null;
  phones: GenieCustomerProfileContactPhone[];
  emails: GenieCustomerProfileContactEmail[];
  addresses: GenieCustomerProfileAddress[];
  no_email: boolean;
  no_phone: boolean;
  no_mail: boolean;
  created_at: string | null;
  updated_at: string | null;
  archived: boolean;
}

export interface GenieCustomerBikeProfile {
  serialized_id: string;
  label: string | null;
  serial: string | null;
  item_id: string | null;
  updated_at: string | null;
  source: 'customer_serialized' | 'workorder_serialized' | 'sales_or_workorder_inference';
  linked_workorder_ids: string[];
}

export interface GenieCustomerSaleLineProfile {
  item_id: string | null;
  description: string | null;
  sku: string | null;
  category: string | null;
  quantity: number;
  total: number;
}

export interface GenieCustomerSaleProfile {
  sale_id: string;
  completed_at: string | null;
  completed_at_utc: string | null;
  ticket_number: string | null;
  items: string | null;
  units: number | null;
  subtotal: number;
  discounts: number;
  total: number;
  gross_profit: number | null;
  lines: GenieCustomerSaleLineProfile[];
}

export interface GenieCustomerTopItemProfile {
  item_id: string | null;
  description: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  gross_sales: number;
  last_purchase_at: string | null;
}

export interface GenieCustomerSalesSummaryProfile {
  sale_count: number;
  total_spend: number;
  subtotal: number;
  discounts: number;
  gross_profit: number | null;
  units: number;
  average_sale: number;
  first_purchase_at: string | null;
  last_purchase_at: string | null;
}

export interface GenieCustomerProfileDataQuality {
  sales_rows_checked: number;
  sales_row_limit_reached: boolean;
  workorders_truncated: boolean;
  serialized_status: 'ok' | 'error';
  serialized_error: string | null;
}

export interface GenieCustomerProfilePayload {
  title: string;
  query: string | null;
  status: 'resolved' | 'ambiguous' | 'not_found';
  customer: GenieCustomerProfileCustomer | null;
  candidates: GenieCustomerProfileCandidate[];
  sales_summary: GenieCustomerSalesSummaryProfile | null;
  bikes: GenieCustomerBikeProfile[];
  workorders: GenieWorkorderCard[];
  recent_sales: GenieCustomerSaleProfile[];
  top_items: GenieCustomerTopItemProfile[];
  data_quality: GenieCustomerProfileDataQuality;
}

/** Structured analysis plan streamed to the thinking/progress panel. */
export interface GenieAnalysisPlanPayload {
  source: 'planner' | 'agent';
  user_intent?: string | null;
  execution_steps: string[];
  primary_tools?: string[];
  sql_strategy_summary?: string | null;
  date_range_label?: string | null;
  recheck_strategy?: string | null;
  answer_success_criteria?: string[];
}

/** Visual args used when a SQL query produced a chart, table, or pivot. */
export interface GenieAnalysisQueryVisualArgs {
  table_title?: string;
  table_subtitle?: string;
  pivot_table?: {
    title?: string;
    row_fields: string[];
    column_fields?: string[];
    value_field?: string;
    aggregation?: 'sum' | 'count' | 'avg' | 'min' | 'max' | 'count_distinct';
    value_format?: 'currency' | 'number' | 'percent';
    show_totals?: boolean;
  };
  chart_kind?: 'bar' | 'line';
  chart_title?: string;
  chart_subtitle?: string;
  chart_x_key?: string;
  chart_y_keys?: string[];
  value_format?: 'currency' | 'number' | 'percent';
}

/** SQL or lookup executed during analysis, shown in the queries dropdown. */
export interface GenieAnalysisQueryPayload {
  id: string;
  tool_name: string;
  purpose: string;
  sql: string | null;
  status: 'running' | 'ok' | 'error' | 'rejected';
  at: string;
  row_count?: number | null;
  error?: string | null;
  visual?: GenieAnalysisQueryVisualArgs | null;
  limit?: number | null;
}

/** One captured SSE / client debug event for the raw logs panel. */
export interface GenieRawDebugLogEntry {
  seq: number;
  at: string;
  payload: Record<string, unknown>;
}

/** Result returned by /api/genie/agent/apply after a successful mutation. */
export interface ApplyResult {
  ok: true;
  kind: GenieProposal['kind'];
  affected: number;
  message: string;
  /** Resolved Lightspeed values written for brand/category updates (for undo). */
  applied_changes?: ProductBrandCategoryChange[];
}
