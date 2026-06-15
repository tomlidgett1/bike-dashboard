/**
 * GET /api/optimize/hero-images/product-search?q=...
 *
 * Finds the signed-in store's active products by name and enriches each with
 * its canonical brand / UPC / search-query, so the Smart Photos workbench can
 * test against real catalogue items (the ones that are painful to do by hand).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ products: [] });

  const { data: rows, error } = await supabase
    .from("products")
    .select("id, display_name, description, primary_image_url, canonical_product_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .or(`display_name.ilike.%${q}%,description.ilike.%${q}%`)
    .limit(12);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const canonicalIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.canonical_product_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];

  const canonicalById = new Map<
    string,
    { manufacturer: string | null; upc: string | null; normalized_name: string | null; image_review_search_query: string | null }
  >();
  if (canonicalIds.length > 0) {
    const { data: canon } = await supabase
      .from("canonical_products")
      .select("id, manufacturer, upc, normalized_name, image_review_search_query")
      .in("id", canonicalIds);
    for (const c of canon ?? []) {
      canonicalById.set(c.id as string, {
        manufacturer: (c.manufacturer as string | null) ?? null,
        upc: (c.upc as string | null) ?? null,
        normalized_name: (c.normalized_name as string | null) ?? null,
        image_review_search_query: (c.image_review_search_query as string | null) ?? null,
      });
    }
  }

  const products = (rows ?? []).map((r) => {
    const canon = r.canonical_product_id
      ? canonicalById.get(r.canonical_product_id as string)
      : undefined;
    return {
      product_id: r.id as string,
      name: ((r.display_name as string) || canon?.normalized_name || (r.description as string) || "").trim(),
      brand: canon?.manufacturer ?? null,
      upc: canon?.upc ?? null,
      search_query: canon?.image_review_search_query ?? null,
      current_image_url: (r.primary_image_url as string | null) ?? null,
    };
  });

  return NextResponse.json({ products });
}
