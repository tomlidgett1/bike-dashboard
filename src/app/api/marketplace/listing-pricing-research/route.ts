import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { discoverListingPricing } from "@/lib/ai/discover-listing-pricing";
import type { ListingPricingInput } from "@/lib/ai/listing-pricing-schema";

// ============================================================
// POST /api/marketplace/listing-pricing-research
// LLM + web search for brand-new RRP and comparable listings
// while the seller sets their asking price.
// ============================================================

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "AI pricing research is not configured." }, { status: 503 });
    }

    const body = (await request.json()) as ListingPricingInput;

    const result = await discoverListingPricing(openai, body);

    if (!result.ok || !result.research) {
      return NextResponse.json({ error: result.error || "Could not research pricing." }, {
        status: result.status || 422,
      });
    }

    return NextResponse.json({ research: result.research });
  } catch (error) {
    console.error("Listing pricing research error:", error);
    return NextResponse.json({ error: "Failed to research pricing." }, { status: 500 });
  }
}
