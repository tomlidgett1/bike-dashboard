import type { BikeSpecSection } from "@/lib/types/bike-specs";

/** One selectable frame size found on the official bike page. */
export interface BikeUrlSize {
  name: string;
  sku: string | null;
}

/**
 * Everything YJ extracts from an official bike product page. The store owner
 * reviews and edits this draft before it becomes catalogue products.
 */
export interface BikeUrlDraft {
  sourceUrl: string;
  name: string;
  brand: string | null;
  model: string | null;
  modelYear: string | null;
  /** e.g. "Electric Mountain", "Road" — free text from the page. */
  bikeType: string | null;
  /** YJ marketplace Bicycles subcategory guess. */
  subcategory: string;
  colors: string[];
  /** Long formatted marketing description for the product page. */
  description: string;
  specSections: BikeSpecSection[];
  sizes: BikeUrlSize[];
  /** Price shown on the page, if any. */
  price: number | null;
  /** ISO currency of that price (pages are often EUR/USD, not AUD). */
  currency: string | null;
  imageUrls: string[];
  heroImageUrl: string | null;
}

export interface BikeUrlImportRequest {
  draft: BikeUrlDraft;
  /** Store selling price in AUD, set by the owner during review. */
  price: number;
  sizes: Array<{ name: string; sku: string | null; qoh: number }>;
  imageUrls: string[];
  heroImageUrl: string | null;
  subcategory: string;
}

export interface BikeUrlImportResult {
  created: number;
  groupCreated: boolean;
  imagesSaved: number;
  masterProductId: string | null;
  errors: string[];
}
