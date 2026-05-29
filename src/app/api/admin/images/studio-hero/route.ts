/**
 * Image Workbench — OpenAI studio hero (light grey backdrop + soft shadow).
 * POST /api/admin/images/studio-hero
 *
 * Wraps the enhance-product-image edge function and saves the result as an
 * approved canonical product_images row.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: "No active session" }, { status: 401 });
    }

    const body = await request.json();
    const canonicalProductId = body.canonicalProductId as string | undefined;
    const imageId = body.imageId as string | undefined;
    const makePrimary = body.makePrimary !== false;

    if (!canonicalProductId || !imageId) {
      return NextResponse.json(
        { error: "canonicalProductId and imageId are required" },
        { status: 400 },
      );
    }

    const { data: canonical, error: canonicalError } = await supabase
      .from("canonical_products")
      .select("id")
      .eq("id", canonicalProductId)
      .single();

    if (canonicalError || !canonical) {
      return NextResponse.json({ error: "Canonical product not found" }, { status: 404 });
    }

    const { data: row, error: fetchError } = await supabase
      .from("product_images")
      .select(
        "id, canonical_product_id, cloudinary_url, external_url, approval_status",
      )
      .eq("id", imageId)
      .eq("canonical_product_id", canonicalProductId)
      .single();

    if (fetchError || !row) {
      return NextResponse.json(
        { error: "Image not found or not usable (need approved or pending)" },
        { status: 404 },
      );
    }

    const okStatus = row.approval_status === "approved" || row.approval_status === "pending";
    if (!okStatus) {
      return NextResponse.json(
        { error: "Image not found or not usable (need approved or pending)" },
        { status: 404 },
      );
    }

    const sourceUrl =
      row.cloudinary_url || row.external_url;
    if (!sourceUrl) {
      return NextResponse.json({ error: "No usable image URL for enhancement" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json({ error: "Supabase URL not configured" }, { status: 500 });
    }

    const enhanceResponse = await fetch(`${supabaseUrl}/functions/v1/enhance-product-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        imageUrl: sourceUrl,
        listingId: `workbench-${canonicalProductId}`,
      }),
    });

    const enhanceText = await enhanceResponse.text();
    let enhanceJson: { success?: boolean; error?: string; data?: Record<string, string> } = {};
    try {
      enhanceJson = JSON.parse(enhanceText) as typeof enhanceJson;
    } catch {
      return NextResponse.json(
        { error: enhanceText?.slice(0, 200) || "Enhancement returned invalid response" },
        { status: 502 },
      );
    }
    if (!enhanceResponse.ok || !enhanceJson.success) {
      return NextResponse.json(
        {
          error: enhanceJson.error || "Enhancement failed",
        },
        { status: enhanceResponse.ok ? 500 : enhanceResponse.status },
      );
    }

    const d = enhanceJson.data;
    if (!d?.url || !d?.publicId) {
      return NextResponse.json({ error: "Enhancement returned incomplete data" }, { status: 500 });
    }

    let nextSort = 0;
    const { data: sortRows } = await supabase
      .from("product_images")
      .select("sort_order")
      .eq("canonical_product_id", canonicalProductId)
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1);

    const top = sortRows?.[0]?.sort_order;
    if (typeof top === "number" && !Number.isNaN(top)) {
      nextSort = top + 1;
    }

    if (makePrimary) {
      await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("canonical_product_id", canonicalProductId);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("product_images")
      .insert({
        canonical_product_id: canonicalProductId,
        external_url: sourceUrl,
        cloudinary_url: d.url,
        cloudinary_public_id: d.publicId,
        is_downloaded: true,
        approval_status: "approved",
        is_primary: makePrimary,
        sort_order: nextSort,
        source: "openai_studio_hero",
        uploaded_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[IMAGE WORKBENCH] Studio hero insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    await supabase
      .from("canonical_products")
      .update({
        image_review_status: "ready",
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
        image_review_source: "serper_workbench",
      })
      .eq("id", canonicalProductId);

    await supabase
      .from("products")
      .update({
        image_review_status: "ready",
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
        image_review_source: "canonical",
      })
      .eq("canonical_product_id", canonicalProductId);

    return NextResponse.json({
      success: true,
      imageId: inserted.id,
      makePrimary,
    });
  } catch (error) {
    console.error("[IMAGE WORKBENCH] Studio hero error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Studio hero failed" },
      { status: 500 },
    );
  }
}
