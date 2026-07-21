import { NextRequest, NextResponse } from "next/server";
import { requireBicycleStore } from "@/lib/store/online-products-store-auth";
import type {
  SupplierAudience,
  SupplierCatalogueSearchHit,
  SupplierStockStatus,
} from "@/lib/supplier-catalogue/types";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  supplier_name: string;
  audience: string;
  product_type: string | null;
  sizes: string[] | null;
  colours: string[] | null;
  cost_price: number | string | null;
  retail_price: number | string | null;
  currency: string | null;
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

function mapRow(row: ProductRow): SupplierCatalogueSearchHit {
  return {
    productId: row.id,
    relevanceScore: 0,
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

/**
 * GET /api/store/supplier-lookup/catalogue
 * Browse the full shared supplier catalogue (paginated).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireBicycleStore();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = request.nextUrl;
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") || 200), 1),
      500,
    );
    const offset = Math.max(Number(searchParams.get("offset") || 0), 0);
    const supplier = searchParams.get("supplier")?.trim() || null;

    let query = auth.supabase
      .from("supplier_catalogue_products")
      .select(
        "id, name, brand, supplier_name, audience, product_type, sizes, colours, cost_price, retail_price, currency, stock_status, stock_quantity, hero_image_url, source_url, category_path, supplier_sku, upc",
        { count: "exact" },
      )
      .order("supplier_name", { ascending: true })
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (supplier) {
      query = query.ilike("supplier_name", `%${supplier}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const results = ((data as ProductRow[] | null) ?? []).map(mapRow);
    const total = count ?? results.length;

    return NextResponse.json({
      results,
      count: results.length,
      total,
      offset,
      limit,
      hasMore: offset + results.length < total,
    });
  } catch (error) {
    console.error("[supplier-lookup] catalogue browse failed", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load catalogue",
        results: [],
      },
      { status: 500 },
    );
  }
}
