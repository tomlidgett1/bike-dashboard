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

export type GenieProposal =
  | CarouselLayoutProposal
  | DiscountApplyProposal
  | DiscountRemoveProposal;

/** Result returned by /api/genie/agent/apply after a successful mutation. */
export interface ApplyResult {
  ok: true;
  kind: GenieProposal['kind'];
  affected: number;
  message: string;
}
