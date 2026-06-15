// Client-side shapes mirroring the variant API responses.

export type ScopeOption = { name: string; count: number };
export type ScopeResponse = { totalProducts: number; categories: ScopeOption[]; brands: ScopeOption[] };

export type VariantRunStatus = "queued" | "running" | "ready" | "failed" | "cancelled";

export type VariantRun = {
  id: string;
  status: VariantRunStatus;
  phase: string | null;
  message: string | null;
  error_message: string | null;
  products_total: number;
  buckets_total: number;
  buckets_done: number;
  candidates_total: number;
  created_at: string;
  completed_at: string | null;
};

export type CandidateStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "applied_local"
  | "applied_lightspeed"
  | "failed";

export type OptionType = { name: string };

export type CandidateItem = {
  product_id: string;
  lightspeed_item_id: string | null;
  title: string;
  variant_values: Record<string, string>;
  price: number | null;
  qoh: number | null;
  image_url: string | null;
  // Extra detail recovered from the original Lightspeed listing / structured fields.
  lightspeed_description?: string | null;
  color?: string | null;
  color_secondary?: string | null;
  size?: string | null;
  frame_size?: string | null;
  wheel_size?: string | null;
};

export type Candidate = {
  id: string;
  run_id: string;
  status: CandidateStatus;
  proposed_master_title: string;
  base_title: string | null;
  brand: string | null;
  category_name: string | null;
  option_types: OptionType[];
  items: CandidateItem[];
  confidence: "high" | "medium" | "low";
  explanation: string;
  warnings: string[];
  applied_group_id: string | null;
  error_message: string | null;
};

export type VisibilityMode = "master_only" | "individual_and_master";
export type SyncTarget = "local" | "lightspeed";

export type VariantGroupSummary = {
  id: string;
  master_title: string;
  visibility_mode: VisibilityMode;
  sync_target: SyncTarget;
  lightspeed_status: "not_requested" | "requested" | "synced" | "failed";
  lightspeed_error: string | null;
  lightspeed_synced_item_ids: string[];
};

export const WARNING_LABELS: Record<string, string> = {
  price_mismatch: "Prices differ a lot",
  category_mismatch: "Different categories",
  model_year_conflict: "Different model years",
  ambiguous_titles: "Names are ambiguous",
  possible_false_positive: "Might not be variants",
  missing_sku: "Some products have no SKU",
  already_lightspeed_matrix: "Already a Lightspeed matrix",
};

/** Distinct values per option across a candidate's items, in first-seen order. */
export function optionValueMap(candidate: Candidate): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const o of candidate.option_types) out[o.name] = [];
  for (const item of candidate.items) {
    for (const [option, value] of Object.entries(item.variant_values)) {
      if (!out[option]) out[option] = [];
      if (!out[option].includes(value)) out[option].push(value);
    }
  }
  return out;
}

export function formatPrice(price: number | null): string {
  if (price == null || !Number.isFinite(price)) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(price);
}
