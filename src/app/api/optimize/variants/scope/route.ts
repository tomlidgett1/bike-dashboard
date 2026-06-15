import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Counter = Map<string, number>;

function bump(counter: Counter, key: string | null | undefined) {
  const name = (key ?? "").trim();
  if (!name) return;
  counter.set(name, (counter.get(name) ?? 0) + 1);
}

function toSortedList(counter: Counter) {
  return [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * GET /api/optimize/variants/scope
 * Categories + brands present on the store's groupable products, with counts,
 * so the scope picker reflects exactly what a scan would cover.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const categories: Counter = new Map();
    const brands: Counter = new Map();
    let totalProducts = 0;
    const pageSize = 1000;

    for (let page = 0; page < 10; page++) {
      const from = page * pageSize;
      const { data, error } = await supabase
        .from("products")
        .select("category_name, brand, manufacturer_name")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .is("variant_group_id", null)
        .range(from, from + pageSize - 1);

      if (error) {
        return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
      }
      const rows = data ?? [];
      for (const row of rows) {
        totalProducts++;
        bump(categories, row.category_name);
        bump(brands, (row.brand as string | null) || (row.manufacturer_name as string | null));
      }
      if (rows.length < pageSize) break;
    }

    return NextResponse.json({
      totalProducts,
      categories: toSortedList(categories),
      brands: toSortedList(brands),
    });
  } catch (error) {
    console.error("[variants/scope]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
