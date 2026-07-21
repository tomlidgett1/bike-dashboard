import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SupplierAudience,
  SupplierCatalogueSearchFilters,
  SupplierCatalogueSearchHit,
  SupplierStockStatus,
} from "@/lib/supplier-catalogue/types";

interface RpcRow {
  product_id: string;
  relevance_score: number;
  name: string;
  brand: string | null;
  supplier_name: string;
  audience: string;
  product_type: string | null;
  sizes: string[] | null;
  colours: string[] | null;
  cost_price: number | string | null;
  retail_price: number | string | null;
  currency: string;
  stock_status: string;
  stock_quantity: number | string | null;
  hero_image_url: string | null;
  source_url: string;
  category_path: string[] | null;
  supplier_sku: string | null;
  upc: string | null;
}

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapHit(row: RpcRow): SupplierCatalogueSearchHit {
  return {
    productId: row.product_id,
    relevanceScore: Number(row.relevance_score) || 0,
    name: row.name,
    brand: row.brand,
    supplierName: row.supplier_name,
    audience: (row.audience as SupplierAudience) || "unknown",
    productType: row.product_type,
    sizes: row.sizes ?? [],
    colours: row.colours ?? [],
    costPrice: asNumber(row.cost_price),
    retailPrice: asNumber(row.retail_price),
    currency: row.currency || "AUD",
    stockStatus: (row.stock_status as SupplierStockStatus) || "unknown",
    stockQuantity: asNumber(row.stock_quantity),
    heroImageUrl: row.hero_image_url,
    sourceUrl: row.source_url,
    categoryPath: row.category_path ?? [],
    supplierSku: row.supplier_sku,
    upc: row.upc,
  };
}

export async function searchSupplierCatalogue(
  supabase: SupabaseClient,
  queryText: string,
  filters: SupplierCatalogueSearchFilters = {},
  limit = 50,
): Promise<SupplierCatalogueSearchHit[]> {
  const payload = {
    audience: filters.audience ?? null,
    brand: filters.brand ?? null,
    productType: filters.productType ?? null,
    colour: filters.colour ?? null,
    size: filters.size ?? null,
    inStockOnly: Boolean(filters.inStockOnly),
    supplier: filters.supplier ?? null,
  };

  const { data, error } = await supabase.rpc("search_supplier_catalogue", {
    query_text: queryText,
    filters: payload,
    result_limit: limit,
  });

  if (error) {
    throw new Error(error.message || "Supplier catalogue search failed");
  }

  return ((data as RpcRow[] | null) ?? []).map(mapHit);
}
