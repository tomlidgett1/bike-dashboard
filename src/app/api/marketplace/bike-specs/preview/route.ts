import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { discoverBikeSpecs } from "@/lib/ai/discover-bike-specs";

// ============================================================
// POST /api/marketplace/bike-specs/preview
// Pre-publish AI spec discovery for the SELL flow. Unlike
// /api/products/bike-specs/discover, there is no saved product yet —
// the seller passes the bike details and we return the spec sheet
// for review. Nothing is persisted here; the chosen specs are sent
// with the listing on publish.
// ============================================================

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

    const body = await request.json();
    const { brand, model, modelYear, bikeType, frameSize, frameMaterial, groupset, wheelSize, title } =
      body as Record<string, string | undefined>;

    const productName =
      title || [brand, model, modelYear].filter(Boolean).join(" ") || "Unknown bicycle";

    if (!brand && !model && !title) {
      return NextResponse.json(
        { error: "Add a brand and model first so AI can find the right spec sheet." },
        { status: 400 },
      );
    }

    const result = await discoverBikeSpecs(openai, {
      productName,
      brand,
      model,
      modelYear,
      bikeType,
      frameSize,
      frameMaterial,
      groupset,
      wheelSize,
    });

    if (!result.ok || !result.bikeSpecs) {
      return NextResponse.json({ error: result.error || "Could not find specifications." }, {
        status: result.status || 422,
      });
    }

    return NextResponse.json({ bike_specs: result.bikeSpecs });
  } catch (error) {
    console.error("Bike specs preview error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bicycle specifications" },
      { status: 500 },
    );
  }
}
