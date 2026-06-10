import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveProductImage } from "@/lib/services/image-resolver";
import { buildHeroPublicId } from "@/lib/utils/cloudinary-transforms";
import { refreshPublicMarketplaceAfterMutation } from "@/lib/server/refresh-public-marketplace";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ProductImageRow = {
  id: string;
  product_id: string | null;
  canonical_product_id: string | null;
  cloudinary_public_id: string | null;
  cloudinary_url: string | null;
  external_url: string | null;
  approval_status: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
  source: string | null;
};

function getSourceUrl(row: ProductImageRow) {
  const resolved = resolveProductImage(row);
  return resolved?.detail_url || resolved?.gallery_url || resolved?.original_url || null;
}

async function fetchPrimaryImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  canonicalProductId: string | null,
) {
  let query = supabase
    .from("product_images")
    .select(
      "id, product_id, canonical_product_id, cloudinary_public_id, cloudinary_url, external_url, approval_status, is_primary, sort_order, source",
    )
    .or("approval_status.eq.approved,approval_status.is.null")
    .order("is_primary", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true, nullsFirst: false })
    .limit(1);

  query = canonicalProductId
    ? query.eq("canonical_product_id", canonicalProductId)
    : query.eq("product_id", productId);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as ProductImageRow | null;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    const { id: productId } = await params;
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, user_id, canonical_product_id")
      .eq("id", productId)
      .eq("user_id", user.id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const canonicalProductId = product.canonical_product_id as string | null;
    const sourceImage = await fetchPrimaryImage(supabase, productId, canonicalProductId);
    if (!sourceImage) {
      return NextResponse.json(
        { error: "No approved product image found to process" },
        { status: 400 },
      );
    }

    const sourceUrl = getSourceUrl(sourceImage);
    if (!sourceUrl) {
      return NextResponse.json(
        { error: "No usable image URL found for background fix" },
        { status: 400 },
      );
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
        listingId: `store-card-${productId}`,
      }),
    });

    const enhanceText = await enhanceResponse.text();
    let enhanceJson: {
      success?: boolean;
      error?: string;
      data?: {
        url?: string;
        publicId?: string;
      };
    } = {};

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
        { error: enhanceJson.error || "Background fix failed" },
        { status: enhanceResponse.ok ? 500 : enhanceResponse.status },
      );
    }

    const enhancedUrl = enhanceJson.data?.url;
    const rawPublicId = enhanceJson.data?.publicId;
    if (!enhancedUrl || !rawPublicId) {
      return NextResponse.json(
        { error: "Enhancement returned incomplete image data" },
        { status: 500 },
      );
    }

    const finalPublicId = buildHeroPublicId(rawPublicId) || rawPublicId;

    if (canonicalProductId) {
      await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("canonical_product_id", canonicalProductId);
    } else {
      await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", productId);
    }

    const { data: sortRows } = await supabase
      .from("product_images")
      .select("sort_order")
      .eq(canonicalProductId ? "canonical_product_id" : "product_id", canonicalProductId ?? productId)
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1);

    const topSort = sortRows?.[0]?.sort_order;
    const nextSort = typeof topSort === "number" && !Number.isNaN(topSort) ? topSort + 1 : 0;

    const { data: inserted, error: insertError } = await supabase
      .from("product_images")
      .insert({
        product_id: canonicalProductId ? null : productId,
        canonical_product_id: canonicalProductId,
        external_url: sourceUrl,
        cloudinary_url: enhancedUrl,
        cloudinary_public_id: finalPublicId,
        is_downloaded: true,
        approval_status: "approved",
        is_primary: true,
        sort_order: nextSort,
        source: "openai_studio_hero",
        uploaded_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[PRODUCT-BG-REMOVE] Insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
    if (!inserted) {
      return NextResponse.json({ error: "Enhanced image was not saved" }, { status: 500 });
    }

    if (canonicalProductId) {
      await supabase
        .from("canonical_products")
        .update({
          image_review_status: "ready",
          image_reviewed_at: new Date().toISOString(),
          image_reviewed_by: user.id,
          image_review_source: "hero_background",
        })
        .eq("id", canonicalProductId);
    }

    await supabase
      .from("products")
      .update({
        image_review_status: "ready",
        image_reviewed_at: new Date().toISOString(),
        image_reviewed_by: user.id,
        image_review_source: "canonical",
      })
      .eq(canonicalProductId ? "canonical_product_id" : "id", canonicalProductId ?? productId);

    await refreshPublicMarketplaceAfterMutation();
    revalidatePath(`/marketplace/store/${user.id}`);
    revalidatePath(`/api/marketplace/store/${user.id}`);

    const resolved = resolveProductImage({
      id: inserted.id,
      cloudinary_public_id: finalPublicId,
      cloudinary_url: enhancedUrl,
      external_url: sourceUrl,
      approval_status: "approved",
      is_primary: true,
    });
    const primaryImageUrl = resolved?.card_url || resolved?.original_url || enhancedUrl;

    return NextResponse.json({
      success: true,
      imageId: inserted.id,
      product: {
        id: productId,
        primary_image_url: primaryImageUrl,
        card_url: primaryImageUrl,
        mobile_card_url: resolved?.mobile_card_url || primaryImageUrl,
        thumbnail_url: resolved?.thumbnail_url || primaryImageUrl,
        detail_url: resolved?.detail_url || resolved?.gallery_url || primaryImageUrl,
        cloudinary_public_id: finalPublicId,
      },
    });
  } catch (error) {
    console.error("[PRODUCT-BG-REMOVE] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Background fix failed" },
      { status: 500 },
    );
  }
}
