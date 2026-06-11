import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ items: [] });
  }

  // Build OR filters: split into tokens and probe description, name, skus, upc
  const raw = q.toLowerCase().replace(/[%_,()]/g, "");
  const tokens = raw.split(/\s+/).filter((token) => token.length >= 2).slice(0, 6);

  const orFilters = tokens.flatMap((token) => [
    `description.ilike.%${token}%`,
    `name.ilike.%${token}%`,
    `custom_sku.ilike.%${token}%`,
    `manufacturer_sku.ilike.%${token}%`,
    `upc.ilike.%${token}%`,
  ]);

  const { data, error } = await supabase
    .from("lightspeed_inventory")
    .select("lightspeed_item_id, name, description, custom_sku, manufacturer_sku, upc, default_cost, total_qoh")
    .eq("user_id", user.id)
    .eq("archived", false)
    .or(orFilters.join(","))
    .order("name", { ascending: true })
    .limit(30);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    lightspeed_item_id: string;
    name: string | null;
    description: string | null;
    custom_sku: string | null;
    manufacturer_sku: string | null;
    upc: string | null;
    default_cost: string | null;
    total_qoh: number | null;
  }[];

  // Score by token overlap so the most relevant results surface first
  const scored = rows.map((row) => {
    const haystack = `${row.name ?? ""} ${row.description ?? ""} ${row.custom_sku ?? ""} ${row.manufacturer_sku ?? ""}`.toLowerCase();
    const hits = tokens.filter((token) => haystack.includes(token)).length;
    const score = tokens.length > 0 ? hits / tokens.length : 0;
    return { row, score };
  });
  scored.sort((a, b) => b.score - a.score);

  const items = scored.slice(0, 10).map(({ row, score }) => ({
    item_id: row.lightspeed_item_id,
    name: row.name ?? row.description ?? `Item ${row.lightspeed_item_id}`,
    sku: row.custom_sku || row.manufacturer_sku || null,
    upc: row.upc ?? null,
    default_cost: row.default_cost ? parseFloat(row.default_cost) : null,
    qoh: row.total_qoh ?? null,
    confidence: score,
    matched_on: "search" as const,
  }));

  return NextResponse.json({ items });
}
