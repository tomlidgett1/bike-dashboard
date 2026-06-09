import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isReadyForImageApproval,
  type ImageApprovalProduct,
} from "@/lib/optimize/image-approval-queue";

export const dynamic = "force-dynamic";

const MAX_SCAN = 1000;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }

    const countOnly = request.nextUrl.searchParams.get("countOnly") === "true";

    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        canonical_product_id,
        description,
        display_name,
        product_description,
        product_specs,
        brand,
        category_name,
        listing_source,
        custom_sku,
        system_sku,
        price,
        qoh,
        is_bicycle,
        cached_image_url,
        cached_thumbnail_url,
        product_images!product_id (
          id,
          cloudinary_public_id,
          cloudinary_url,
          external_url,
          is_primary,
          approval_status,
          sort_order,
          source
        ),
        canonical_products!canonical_product_id (
          id,
          upc,
          normalized_name,
          serper_candidates,
          serper_candidates_search_query,
          serper_candidates_fetched_at,
          serper_ai_selection,
          product_images!canonical_product_id (
            id,
            cloudinary_public_id,
            cloudinary_url,
            external_url,
            is_primary,
            approval_status,
            sort_order,
            source
          )
        )
      `,
      )
      .eq("user_id", user.id)
      .eq("is_active", true)
      .not("canonical_product_id", "is", null)
      .not("display_name", "is", null)
      .not("product_description", "is", null)
      .not("product_specs", "is", null)
      .order("updated_at", { ascending: false })
      .limit(MAX_SCAN);

    if (error) {
      console.error("[image-approval-queue]", error);
      return NextResponse.json({ error: "Failed to load queue" }, { status: 500 });
    }

    const rows = (data ?? []).map((row) => {
      const raw = row as Record<string, unknown>;
      const canonical = raw.canonical_products;
      return {
        ...(raw as ImageApprovalProduct),
        canonical_products: Array.isArray(canonical)
          ? (canonical[0] as ImageApprovalProduct["canonical_products"])
          : (canonical as ImageApprovalProduct["canonical_products"]),
      };
    });
    const ready = rows.filter((row) => isReadyForImageApproval(row));

    if (countOnly) {
      return NextResponse.json({ count: ready.length });
    }

    return NextResponse.json({
      count: ready.length,
      products: ready,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
