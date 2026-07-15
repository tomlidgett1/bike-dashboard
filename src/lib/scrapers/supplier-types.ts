import type {
  FEsportsScrapedProduct,
  FEsportsVariant,
} from "@/lib/scrapers/fesports-scraper";
import type { FieldMapping } from "@/lib/scrapers/fesports-field-mapping";

export type SupplierBrowseMode = "brand" | "category";

export interface SupplierBrowseOption {
  id: string;
  kind: SupplierBrowseMode | "subcategory";
  name: string;
  url: string;
  imageUrl: string | null;
  parentId?: string | null;
}

export interface SupplierScrapeTarget {
  id: string;
  name: string;
  url: string;
  parentId?: string | null;
}

export interface SupplierLoginSelectors {
  username: string;
  password: string;
  submit: string;
}

export interface SupplierProductSelectors {
  name: string;
  price: string | null;
  sku: string | null;
  stock: string | null;
  brand: string | null;
  description: string | null;
  category: string | null;
  specifications: string | null;
  image: string;
  imageAttribute: "src" | "data-src" | "srcset";
  variantRow: string | null;
  variantName: string | null;
  variantValue: string | null;
  variantSku: string | null;
  variantStock: string | null;
  variantPrice: string | null;
}

export interface SupplierScraperConfig {
  version: 1;
  supplierName: string;
  baseUrl: string;
  loginUrl: string;
  catalogueUrl: string;
  loginSelectors: SupplierLoginSelectors | null;
  browseModes: SupplierBrowseMode[];
  brandOptions: SupplierBrowseOption[];
  categoryOptions: SupplierBrowseOption[];
  productLinkSelector: string;
  nextPageSelector: string | null;
  productSelectors: SupplierProductSelectors;
  alternatePhotoSource?: AlternatePhotoSourceConfig | null;
}

export interface AlternatePhotoSourceConfig {
  enabled: boolean;
  websiteUrl: string;
  sourceName: string;
  searchUrlTemplate: string | null;
}

export interface AlternatePhotoMatch {
  sourceName: string;
  websiteUrl: string;
  productUrl: string | null;
  imageUrls: string[];
  heroImageUrl: string | null;
  matchMethod: "sku" | "name" | "none";
  matchScore: number;
  status: "matched" | "not_found" | "error";
  error?: string | null;
}

export type SupplierImageSourcePreference = "supplier" | "alternate" | "both";
export type SupplierImageSourcePreferences = Record<string, SupplierImageSourcePreference>;

export type SupplierScrapedProduct = FEsportsScrapedProduct & {
  alternatePhoto?: AlternatePhotoMatch | null;
};
export type SupplierVariant = FEsportsVariant;

export type SupplierScraperStatus = "draft" | "ready" | "error" | "archived";

export interface StoredSupplierScraper {
  id: string;
  name: string;
  baseUrl: string;
  loginUrl: string;
  credentialSaved: boolean;
  status: SupplierScraperStatus;
  config: SupplierScraperConfig;
  fieldMapping: FieldMapping;
  lastRunAt: string | null;
  lastRunStatus: "running" | "succeeded" | "failed" | null;
  lastRunSummary: Record<string, unknown>;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierProductMatch {
  status: "new" | "changed" | "unchanged";
  existingProductIds: string[];
  changes: string[];
}

export type SupplierProductMatches = Record<string, SupplierProductMatch>;
