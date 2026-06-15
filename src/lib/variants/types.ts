// ============================================================
// Product variant detection — shared types
// ============================================================
// These flow from the deterministic pre-filter through the AI
// detector into detection candidates. Only structured/text fields
// are ever used for grouping — images are never inspected by AI.

export type VariantConfidence = "high" | "medium" | "low";

/** A product as seen by the detector. Structured fields only. */
export type VariantCandidateProduct = {
  product_id: string;
  lightspeed_item_id: string | null;
  /** Yellow Jersey display title (AI-cleaned; may have dropped the size/colour). */
  title: string;
  /** Original Lightspeed listing text (usually still carries the size/colour). */
  lightspeed_description: string | null;
  brand: string | null;
  category_name: string | null;
  marketplace_category: string | null;
  system_sku: string | null;
  custom_sku: string | null;
  manufacturer_sku: string | null;
  upc: string | null;
  price: number | null;
  qoh: number | null;
  model_year: string | null;
  // Structured option-like signals already stored on the product.
  size: string | null;
  frame_size: string | null;
  wheel_size: string | null;
  color_primary: string | null;
  color_secondary: string | null;
  // Display only — never sent to the AI model.
  image_url: string | null;
};

export type VariantOptionType = { name: string };

/** Deterministic pre-filter output: a bucket of likely-related products. */
export type VariantBucket = {
  /** brand + normalized base title (stable identity for the bucket). */
  key: string;
  brand: string | null;
  base_title: string;
  category_name: string | null;
  products: VariantCandidateProduct[];
  /** Warnings detected without the AI (price spread, category mismatch). */
  warnings: VariantWarning[];
};

export type VariantWarning =
  | "price_mismatch"
  | "category_mismatch"
  | "model_year_conflict"
  | "ambiguous_titles"
  | "possible_false_positive"
  | "missing_sku"
  | "already_lightspeed_matrix";

/** One product's place inside a proposed group, as decided by the AI. */
export type VariantCandidateItem = {
  product_id: string;
  lightspeed_item_id: string | null;
  title: string;
  /** { "Size": "Small", "Colour": "Black" } */
  variant_values: Record<string, string>;
  price: number | null;
  qoh: number | null;
  image_url: string | null;
  // Extra detail surfaced to the reviewer (so they can see what the cleaned
  // Yellow Jersey title dropped). Optional — only set when present.
  lightspeed_description?: string | null;
  color?: string | null;
  color_secondary?: string | null;
  size?: string | null;
  frame_size?: string | null;
  wheel_size?: string | null;
};

/** A reviewable suggested variant group (persisted as a candidate row). */
export type VariantCandidate = {
  proposed_master_title: string;
  base_title: string | null;
  brand: string | null;
  category_name: string | null;
  option_types: VariantOptionType[];
  items: VariantCandidateItem[];
  confidence: VariantConfidence;
  explanation: string;
  warnings: VariantWarning[];
};
