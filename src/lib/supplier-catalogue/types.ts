export type SupplierCatalogueStatus =
  | "pending"
  | "discovering"
  | "crawling"
  | "ready"
  | "coverage_unverified"
  | "incomplete"
  | "error";

export type SupplierCatalogueRunStatus =
  | "queued"
  | "discovering"
  | "crawling"
  | "enriching"
  | "succeeded"
  | "coverage_unverified"
  | "incomplete"
  | "failed"
  | "cancelled";

export type SupplierAudience = "kids" | "mens" | "womens" | "unisex" | "unknown";

export type SupplierStockStatus = "in_stock" | "out_of_stock" | "unknown";

export type SupplierPriceConfidence = "known" | "inferred" | "unknown";

export interface SupplierCatalogue {
  id: string;
  name: string;
  baseUrl: string;
  loginUrl: string;
  status: SupplierCatalogueStatus;
  scrapeConfig: Record<string, unknown>;
  lastRunAt: string | null;
  lastRunStatus:
    | "running"
    | "succeeded"
    | "coverage_unverified"
    | "incomplete"
    | "failed"
    | null;
  lastRunSummary: Record<string, unknown>;
  productCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierCatalogueProduct {
  id: string;
  catalogueId: string;
  supplierName: string;
  supplierProductId: string;
  supplierSku: string | null;
  upc: string | null;
  ean: string | null;
  sourceUrl: string;
  name: string;
  brand: string | null;
  description: string | null;
  categoryPath: string[];
  productType: string | null;
  audience: SupplierAudience;
  audienceRaw: string | null;
  costPrice: number | null;
  retailPrice: number | null;
  currency: string;
  priceConfidence: SupplierPriceConfidence;
  stockStatus: SupplierStockStatus;
  stockQuantity: number | null;
  stockRaw: string | null;
  sizes: string[];
  colours: string[];
  variantSummary: SupplierVariantSummary[];
  heroImageUrl: string | null;
  imageUrls: string[];
  attributes: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  scrapedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierVariantSummary {
  optionName?: string | null;
  optionValue?: string | null;
  sku?: string | null;
  soh?: number | null;
  price?: number | null;
  stockStatus?: SupplierStockStatus;
}

export interface SupplierCatalogueSearchFilters {
  audience?: SupplierAudience | null;
  brand?: string | null;
  productType?: string | null;
  colour?: string | null;
  size?: string | null;
  inStockOnly?: boolean;
  supplier?: string | null;
  keywords?: string[];
}

export interface SupplierCatalogueSearchHit {
  productId: string;
  relevanceScore: number;
  name: string;
  brand: string | null;
  supplierName: string;
  audience: SupplierAudience;
  productType: string | null;
  sizes: string[];
  colours: string[];
  costPrice: number | null;
  retailPrice: number | null;
  currency: string;
  stockStatus: SupplierStockStatus;
  stockQuantity: number | null;
  heroImageUrl: string | null;
  sourceUrl: string;
  categoryPath: string[];
  supplierSku: string | null;
  upc: string | null;
}

export interface CanonicalSupplierProductInput {
  catalogueId: string;
  supplierName: string;
  supplierProductId: string;
  supplierSku?: string | null;
  upc?: string | null;
  ean?: string | null;
  sourceUrl: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  categoryPath?: string[];
  productType?: string | null;
  audience?: SupplierAudience;
  audienceRaw?: string | null;
  costPrice?: number | null;
  retailPrice?: number | null;
  currency?: string;
  priceConfidence?: SupplierPriceConfidence;
  stockStatus?: SupplierStockStatus;
  stockQuantity?: number | null;
  stockRaw?: string | null;
  sizes?: string[];
  colours?: string[];
  variantSummary?: SupplierVariantSummary[];
  heroImageUrl?: string | null;
  imageUrls?: string[];
  attributes?: Record<string, unknown>;
  rawPayload?: Record<string, unknown>;
}
