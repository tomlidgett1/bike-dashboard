import { NextRequest, NextResponse } from "next/server";
import {
  hydrateProductGenieContext,
  type ProductGenieContext,
} from "@/lib/genie/product-context";
import { createPublicSupabaseClient } from "@/lib/marketplace/public-card-feed";
import { generateProductGenieSuggestions } from "@/lib/genie/product-suggestions";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { product?: ProductGenieContext };

    if (!body.product?.id || !body.product.name) {
      return NextResponse.json({ error: "Invalid product context" }, { status: 400 });
    }

    const publicSupabase = createPublicSupabaseClient();
    const product = await hydrateProductGenieContext(publicSupabase, body.product);
    const suggestions = await generateProductGenieSuggestions(product);

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("[product-suggestions] POST failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load suggestions" },
      { status: 500 },
    );
  }
}
