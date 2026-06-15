import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/optimize/variants/product-search?q=...&exclude=id1,id2
 * Ungrouped, active store products matching the query — used to add a product
 * to a candidate group during review.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  const exclude = (request.nextUrl.searchParams.get("exclude") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (q.length < 2) return NextResponse.json({ products: [] });

  let query = supabase
    .from("products")
    .select("id, lightspeed_item_id, display_name, description, price, qoh, primary_image_url")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .is("variant_group_id", null)
    .or(`display_name.ilike.%${q}%,description.ilike.%${q}%`)
    .limit(10);

  if (exclude.length) query = query.not("id", "in", `(${exclude.join(",")})`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const products = (data ?? []).map((p) => ({
    product_id: p.id as string,
    lightspeed_item_id: (p.lightspeed_item_id as string | null) ?? null,
    title: ((p.display_name as string) || (p.description as string) || "").trim(),
    price: typeof p.price === "number" ? p.price : p.price ? Number(p.price) : null,
    qoh: typeof p.qoh === "number" ? p.qoh : p.qoh ? Number(p.qoh) : null,
    image_url: (p.primary_image_url as string | null) ?? null,
  }));

  return NextResponse.json({ products });
}
