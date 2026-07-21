import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { WorldClassProductPage } from "@/lib/demo/world-class-product-page-types";

export const dynamic = "force-dynamic";

function isWorldClassProductPage(value: unknown): value is WorldClassProductPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Record<string, unknown>;
  return (
    typeof page.productName === "string" &&
    page.productName.trim().length > 0 &&
    Array.isArray(page.images) &&
    Array.isArray(page.specifications) &&
    typeof page.generatedAt === "string"
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: { productId?: string; page?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productId = body.productId?.trim();
  if (!productId) {
    return NextResponse.json(
      { error: "Select a catalogue product to publish to." },
      { status: 400 },
    );
  }

  if (!isWorldClassProductPage(body.page)) {
    return NextResponse.json(
      { error: "Generate a product page before publishing." },
      { status: 400 },
    );
  }

  const { data: existingProduct, error: fetchError } = await supabase
    .from("products")
    .select("id, user_id, display_name, description")
    .eq("id", productId)
    .maybeSingle();

  if (fetchError) {
    console.error("Error fetching product for world-class publish:", fetchError);
    return NextResponse.json(
      { error: fetchError.message || "Failed to load product." },
      { status: 500 },
    );
  }

  if (!existingProduct) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  if (existingProduct.user_id !== user.id) {
    return NextResponse.json(
      { error: "Unauthorised to publish to this product." },
      { status: 403 },
    );
  }

  const { data: updatedProduct, error: updateError } = await supabase
    .from("products")
    .update({
      world_class_page: body.page,
      // Prefer world-class layout over immersive when both could apply.
      immersive_page: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .select("id, display_name, description")
    .single();

  if (updateError) {
    console.error("Error publishing world-class page:", updateError);
    return NextResponse.json(
      { error: updateError.message || "Failed to publish product page." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    product: updatedProduct,
  });
}
