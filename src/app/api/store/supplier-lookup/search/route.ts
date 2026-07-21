import { NextResponse } from "next/server";
import { requireBicycleStore } from "@/lib/store/online-products-store-auth";
import { parseSupplierLookupQuery } from "@/lib/supplier-catalogue/parse-query";
import { searchSupplierCatalogue } from "@/lib/supplier-catalogue/search";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /api/store/supplier-lookup/search
 * Body: { query: string, limit?: number }
 */
export async function POST(request: Request) {
  try {
    const auth = await requireBicycleStore();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await request.json()) as {
      query?: string;
      limit?: number;
    };

    const query = body.query?.trim() ?? "";
    if (!query) {
      return NextResponse.json(
        { error: "query is required", results: [], parse: null },
        { status: 400 },
      );
    }

    const limit = Math.min(Math.max(body.limit ?? 50, 1), 100);
    const parsed = await parseSupplierLookupQuery(query);

    const results = await searchSupplierCatalogue(
      auth.supabase,
      parsed.searchText || query,
      parsed.filters,
      limit,
    );

    return NextResponse.json({
      results,
      parse: {
        searchText: parsed.searchText,
        filters: parsed.filters,
        summary: parsed.summary,
        usedLlm: parsed.usedLlm,
      },
      count: results.length,
    });
  } catch (error) {
    console.error("[supplier-lookup] search failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Search failed",
        results: [],
      },
      { status: 500 },
    );
  }
}
