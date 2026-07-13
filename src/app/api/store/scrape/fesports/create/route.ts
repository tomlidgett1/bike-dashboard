import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildExistingCatalogIndex,
  catalogMatchKey,
  findDuplicateForProduct,
} from "@/lib/store/online-products-csv";
import type { FEsportsScrapedProduct } from "@/lib/scrapers/fesports-scraper";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface CreatePayloadProduct {
  productId: string;
  name: string;
  brand: string | null;
  price: number | null;
  soh: number | null;
  sku: string | null;
  categoryUrl: string;
  url: string;
  imageUrls: string[];
}

function resolveProductQoh(soh: number | null | undefined) {
  if (typeof soh === "number" && Number.isFinite(soh)) {
    return Math.max(0, Math.floor(soh));
  }
  return 9999;
}

function inferMarketplaceCategory(brand: string | null) {
  const lowered = (brand ?? "").toLowerCase();
  if (["helmet", "glove", "jersey", "jacket", "shoe", "apparel", "goggle"].some((k) => lowered.includes(k))) {
    return { category: "Apparel", subcategory: "Other" };
  }
  if (["bike", "bicycle", "frame"].some((k) => lowered.includes(k))) {
    return { category: "Bicycles", subcategory: "Other" };
  }
  if (["nutrition", "gel", "bar", "drink"].some((k) => lowered.includes(k))) {
    return { category: "Nutrition", subcategory: "Other" };
  }
  return { category: "Parts", subcategory: "Other" };
}

async function ensureCanonical(
  supabase: Awaited<ReturnType<typeof createClient>>,
  name: string,
  brand: string | null,
): Promise<string> {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ");

  const { data: existing } = await supabase
    .from("canonical_products")
    .select("id")
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("canonical_products")
    .insert({
      normalized_name: normalized,
      manufacturer: brand || null,
      cleaned: false,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Failed to create canonical product: ${error?.message}`);
  }
  return created.id;
}

function toPayloadProduct(product: FEsportsScrapedProduct | CreatePayloadProduct): CreatePayloadProduct {
  return {
    productId: product.productId,
    name: product.name,
    brand: product.brand,
    price: product.price,
    soh: product.soh,
    sku: product.sku,
    categoryUrl: product.categoryUrl,
    url: product.url,
    imageUrls: product.imageUrls ?? [],
  };
}

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

    const { data: profile } = await supabase
      .from("users")
      .select("account_type, bicycle_store")
      .eq("user_id", user.id)
      .single();

    if (!profile || profile.account_type !== "bicycle_store" || !profile.bicycle_store) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const rawProducts: Array<FEsportsScrapedProduct | CreatePayloadProduct> = body.products ?? [];
    if (!rawProducts.length) {
      return NextResponse.json({ error: "No products provided" }, { status: 400 });
    }

    const products = rawProducts.map(toPayloadProduct);
    const createdIds: string[] = [];
    const errors: string[] = [];
    const skippedDuplicates: string[] = [];
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const now = Date.now();

    const { data: existingRows } = await supabase
      .from("products")
      .select("id, display_name, description, brand")
      .eq("user_id", user.id)
      .eq("listing_type", "store_inventory");

    const catalogIndex = buildExistingCatalogIndex(existingRows ?? []);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const duplicate = findDuplicateForProduct(product.name, product.brand, catalogIndex);
      if (duplicate) {
        skippedDuplicates.push(product.name);
        errors.push(`${product.name}: duplicate of existing store product`);
        continue;
      }

      const resolvedPrice =
        typeof product.price === "number" && Number.isFinite(product.price) ? product.price : 0;
      const marketplace = inferMarketplaceCategory(product.brand);
      const descriptionParts = [
        product.brand ? `Brand: ${product.brand}` : null,
        product.sku ? `SKU: ${product.sku}` : null,
        `Source: FEsports`,
        product.url,
      ].filter(Boolean);

      const canonicalId = await ensureCanonical(supabase, product.name, product.brand);
      const primaryUrl = product.imageUrls[0] ?? null;

      const { data: inserted, error: insertError } = await supabase
        .from("products")
        .insert({
          user_id: user.id,
          listing_type: "store_inventory",
          listing_source: "fesports_scrape",
          listing_status: "active",
          is_active: true,
          canonical_product_id: canonicalId,
          description: product.name,
          display_name: product.name,
          brand: product.brand,
          price: resolvedPrice,
          marketplace_category: marketplace.category,
          marketplace_subcategory: marketplace.subcategory,
          product_description: descriptionParts.join("\n"),
          product_specs: product.sku ? `SKU: ${product.sku}` : null,
          qoh: resolveProductQoh(product.soh),
          system_sku: product.sku || `FE-${product.productId}`,
          lightspeed_item_id: `fesports_scrape-${product.productId}-${now}`,
          primary_image_url: primaryUrl,
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        errors.push(`${product.name}: ${insertError?.message ?? "unknown error"}`);
        continue;
      }

      createdIds.push(inserted.id);

      const matchKey = catalogMatchKey(product.name, product.brand);
      if (matchKey) {
        catalogIndex.byCatalogKey.set(matchKey, {
          existingProductId: inserted.id,
          existingProductName: product.name,
        });
      }

      if (product.imageUrls.length > 0) {
        await supabase
          .from("product_images")
          .update({ approval_status: "rejected" })
          .eq("canonical_product_id", canonicalId)
          .eq("approval_status", "pending");

        for (let imageIndex = 0; imageIndex < product.imageUrls.length; imageIndex++) {
          const imageUrl = product.imageUrls[imageIndex];
          if (!imageUrl) continue;

          const { data: imgInserted } = await supabase
            .from("product_images")
            .insert({
              canonical_product_id: canonicalId,
              external_url: imageUrl,
              is_downloaded: false,
              approval_status: "approved",
              is_primary: imageUrl === primaryUrl,
              sort_order: imageIndex,
              source: "fesports_scrape",
              uploaded_by: user.id,
            })
            .select("id")
            .single();

          if (imgInserted && supabaseUrl && accessToken) {
            void fetch(`${supabaseUrl}/functions/v1/upload-to-cloudinary`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                imageUrl,
                listingId: `canonical-${canonicalId}`,
                index: imageIndex,
              }),
            })
              .then(async (res) => {
                if (!res.ok) return;
                const data = await res.json();
                if (!data.success) return;
                await supabase
                  .from("product_images")
                  .update({
                    cloudinary_url: data.data?.url,
                    cloudinary_public_id: data.data?.publicId,
                    is_downloaded: true,
                  })
                  .eq("id", imgInserted.id);
              })
              .catch(() => undefined);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      created: createdIds.length,
      ids: createdIds,
      errors,
      skippedDuplicates: skippedDuplicates.length,
    });
  } catch (error) {
    console.error("[fesports/create]", error);
    return NextResponse.json({ error: "Failed to create products from FEsports scrape" }, { status: 500 });
  }
}
