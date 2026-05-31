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

export type GenieProposal =
  | CarouselLayoutProposal
  | CarouselCreateProposal
  | CarouselRenameProposal
  | DiscountApplyProposal
  | DiscountRemoveProposal;

/** Result returned by /api/genie/agent/apply after a successful mutation. */
export interface ApplyResult {
  ok: true;
  kind: GenieProposal['kind'];
  affected: number;
  message: string;
}
