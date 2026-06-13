import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ListingAnalysisResult } from "@/lib/ai/schemas";
import { generateListingFieldSuggestions } from "@/lib/ai/listing-field-suggestions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    const analysis = body?.analysis as ListingAnalysisResult | undefined;

    if (!analysis || typeof analysis !== "object") {
      return NextResponse.json({ error: "Analysis payload is required." }, { status: 400 });
    }

    const fields = await generateListingFieldSuggestions(analysis);

    return NextResponse.json({ fields });
  } catch (error) {
    console.error("Listing field suggestions error:", error);
    return NextResponse.json({ error: "Could not generate field suggestions." }, { status: 500 });
  }
}
