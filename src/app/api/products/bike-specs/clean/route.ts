import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import { cleanBikeSpecsWithAI } from "@/lib/ai/bike-specs-clean";
import {
  hasBikeSpecs,
  parseBikeSpecs,
  type BikeSpecsData,
} from "@/lib/types/bike-specs";

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

    const body = await request.json();
    const { productId } = body as { productId?: string };

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const { data: product, error: fetchError } = await supabase
      .from("products")
      .select("id, user_id, description, display_name, bike_specs")
      .eq("id", productId)
      .single();

    if (fetchError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    if (product.user_id !== user.id) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 403 });
    }

    const parsed = parseBikeSpecs(product.bike_specs);
    if (!hasBikeSpecs(parsed)) {
      return NextResponse.json(
        { error: "No specifications to polish. Run AI Add first." },
        { status: 422 }
      );
    }

    const productName =
      product.display_name || product.description || "Unknown bicycle";

    const polishedSections = await cleanBikeSpecsWithAI(openai, parsed!.sections, {
      productName,
    });

    const bikeSpecs: BikeSpecsData = {
      sections: polishedSections,
      metadata: parsed!.metadata,
    };

    const { data: updated, error: updateError } = await supabase
      .from("products")
      .update({
        bike_specs: bikeSpecs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", productId)
      .select("id, is_bicycle, bike_specs")
      .single();

    if (updateError) {
      console.error("Failed to save polished bike specs:", updateError);
      return NextResponse.json({ error: "Failed to save specifications" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      bike_specs: updated.bike_specs,
      is_bicycle: updated.is_bicycle,
    });
  } catch (error) {
    console.error("Bike specs clean error:", error);
    return NextResponse.json(
      { error: "Failed to polish specifications" },
      { status: 500 }
    );
  }
}
