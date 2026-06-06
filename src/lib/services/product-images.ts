/**
 * Product Images Service
 *
 * Single source of truth for all image operations.
 * All code paths should use this service for reading and writing product images.
 *
 * The canonical data store is the `product_images` table.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { getProductImageSlotUrl, resolveProductImage } from "@/lib/services/image-resolver";
import {
  buildCloudinaryVariantUrls,
  buildCloudinaryImageUrl,
  extractCloudinaryPublicId,
  toCurrentHeroPublicId,
} from "@/lib/utils/cloudinary-transforms";

// ============================================================
// Types
// ============================================================

export interface ProductImage {
  id: string;
  product_id: string | null;
  canonical_product_id: string | null;
  cloudinary_public_id: string | null;
  cloudinary_url: string | null;
  external_url: string | null;
  card_url: string | null;
  mobile_card_url: string | null;
  thumbnail_url: string | null;
  gallery_url: string | null;
  detail_url: string | null;
  is_primary: boolean;
  sort_order: number;
  approval_status: "pending" | "approved" | "rejected";
  source: string | null;
  created_at: string;
}

export interface CloudinaryImageResult {
  url: string;
  cardUrl: string;
  mobileCardUrl?: string;
  thumbnailUrl: string;
  galleryUrl?: string;
  detailUrl?: string;
  publicId?: string;
}

export interface AddImageOptions {
  setAsPrimary?: boolean;
  sortOrder?: number;
  source?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
}

// ============================================================
// Read Operations
// ============================================================

/**
 * Get all images for a product, ordered by sort_order
 * Looks up by product_id first, then falls back to canonical_product_id
 */
export async function getProductImages(
  supabase: SupabaseClient,
  productId: string,
  canonicalProductId?: string | null
): Promise<ProductImage[]> {
  // Try product_id first (for private listings and direct products)
  const { data: byProductId, error: productError } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .eq("approval_status", "approved")
    .order("sort_order", { ascending: true });

  if (!productError && byProductId && byProductId.length > 0) {
    return byProductId;
  }

  // Fall back to canonical_product_id (for Lightspeed/canonical products)
  if (canonicalProductId) {
    const { data: byCanonicalId, error: canonicalError } = await supabase
      .from("product_images")
      .select("*")
      .eq("canonical_product_id", canonicalProductId)
      .eq("approval_status", "approved")
      .order("sort_order", { ascending: true });

    if (!canonicalError && byCanonicalId) {
      return byCanonicalId;
    }
  }

  return [];
}

/**
 * Get the primary image for a product
 */
export async function getPrimaryImage(
  supabase: SupabaseClient,
  productId: string,
  canonicalProductId?: string | null
): Promise<ProductImage | null> {
  const images = await getProductImages(supabase, productId, canonicalProductId);

  // Find the primary image (is_primary = true OR sort_order = 0)
  const primary = images.find((img) => img.is_primary) || images[0] || null;
  return primary;
}

/**
 * Get the card URL for a product (fast, single query)
 * This is optimized for product grids where we only need the primary image
 */
export async function getProductCardUrl(
  supabase: SupabaseClient,
  productId: string,
  canonicalProductId?: string | null
): Promise<string | null> {
  const toCard = (row: { cloudinary_public_id: string | null; cloudinary_url: string | null; external_url: string | null } | null) => {
    if (!row) return null;
    const publicId = row.cloudinary_public_id || extractCloudinaryPublicId(row.cloudinary_url);
    return buildCloudinaryImageUrl(publicId, "grid_card") || row.external_url || row.cloudinary_url;
  };

  // Try product_id first
  const { data: byProductId } = await supabase
    .from("product_images")
    .select("cloudinary_public_id, cloudinary_url, external_url, is_primary")
    .eq("product_id", productId)
    .eq("approval_status", "approved")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .single();

  if (byProductId) {
    return toCard(byProductId);
  }

  // Fall back to canonical_product_id
  if (canonicalProductId) {
    const { data: byCanonicalId } = await supabase
      .from("product_images")
      .select("cloudinary_public_id, cloudinary_url, external_url, is_primary")
      .eq("canonical_product_id", canonicalProductId)
      .eq("approval_status", "approved")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .single();

    if (byCanonicalId) {
      return toCard(byCanonicalId);
    }
  }

  return null;
}

function isDisplayableImage(image: ProductImage): boolean {
  return image.approval_status === "approved" || image.approval_status == null;
}

function pickPrimaryProductImage(
  images: ProductImage[],
  selectedProductImageId?: string | null,
): ProductImage | null {
  const approved = images.filter(isDisplayableImage);
  if (approved.length === 0) return null;
  const sorted = [...approved].sort((a, b) => a.sort_order - b.sort_order);
  return (
    sorted.find((img) => img.id === selectedProductImageId) ||
    sorted.find((img) => img.is_primary) ||
    sorted[0] ||
    null
  );
}

type MarketplaceReadyImageRow = {
  id: string;
  resolved_image_id: string | null;
  resolved_image_source: string | null;
  resolved_external_url: string | null;
  resolved_cloudinary_url: string | null;
  resolved_cloudinary_public_id: string | null;
};

type ProductRowForImage = {
  id: string;
  lightspeed_item_id: string;
  canonical_product_id: string | null;
  selected_product_image_id: string | null;
  cached_image_url: string | null;
  cached_thumbnail_url: string | null;
  product_images?: ProductImage[] | null;
  canonical_products?: {
    product_images?: ProductImage[] | null;
  } | null;
};

function marketplaceCardImageUrl(row: MarketplaceReadyImageRow | undefined): string | null {
  if (!row) return null;
  const effectivePublicId = toCurrentHeroPublicId(
    row.resolved_cloudinary_public_id,
    row.resolved_image_source,
  );
  const resolved = resolveProductImage({
    id: row.resolved_image_id,
    cloudinary_public_id: effectivePublicId,
    cloudinary_url: row.resolved_cloudinary_url,
    external_url: row.resolved_external_url,
    approval_status: "approved",
  });
  return resolved?.card_url ?? resolved?.thumbnail_url ?? resolved?.original_url ?? null;
}

function resolveImageForProductRow(
  product: ProductRowForImage,
  marketplaceRow?: MarketplaceReadyImageRow,
): string | null {
  const marketplaceUrl = marketplaceCardImageUrl(marketplaceRow);
  if (marketplaceUrl) return marketplaceUrl;

  const canonicalImages = product.canonical_products?.product_images ?? [];
  const canonicalPrimary = pickPrimaryProductImage(
    canonicalImages,
    product.selected_product_image_id,
  );
  if (canonicalPrimary) {
    const url = productImageDisplayUrl(canonicalPrimary, "thumbnail");
    if (url) return url;
  }

  const productImages = product.product_images ?? [];
  const productPrimary = pickPrimaryProductImage(
    productImages,
    product.selected_product_image_id,
  );
  if (productPrimary) {
    const url = productImageDisplayUrl(productPrimary, "thumbnail");
    if (url) return url;
  }

  return product.cached_thumbnail_url || product.cached_image_url || null;
}

function productImageDisplayUrl(image: ProductImage, slot: "thumbnail" | "grid_card" = "thumbnail"): string | null {
  const effectivePublicId = toCurrentHeroPublicId(
    image.cloudinary_public_id || extractCloudinaryPublicId(image.cloudinary_url),
    image.source,
  );
  const resolvable: ProductImage = {
    ...image,
    cloudinary_public_id: effectivePublicId,
  };

  return (
    getProductImageSlotUrl(resolvable, slot) ||
    image.thumbnail_url ||
    image.card_url ||
    image.gallery_url ||
    image.external_url ||
    image.cloudinary_url
  );
}

/**
 * Batch-resolve Cloudinary thumbnail URLs for Lightspeed items.
 * Source of truth: cloudinary_public_id on product_images (or resolved_* on
 * marketplace_ready_products). URLs are built on the fly via getProductImageSlotUrl
 * — same pipeline as the homepage and product pages. Internal Lightspeed admin
 * surfaces fall back to the inventory mirror's primary_image_url when no
 * product_images/marketplace image exists yet.
 */
export async function resolveThumbnailUrlsByLightspeedItemIds(
  supabase: SupabaseClient,
  userId: string,
  lightspeedItemIds: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const uniqueItemIds = [...new Set(lightspeedItemIds.map(String).filter(Boolean))];
  if (uniqueItemIds.length === 0) return result;

  const { data: inventoryRows } = await supabase
    .from("lightspeed_inventory")
    .select("lightspeed_item_id, product_uuid, primary_image_url")
    .eq("user_id", userId)
    .in("lightspeed_item_id", uniqueItemIds);

  const productUuidByItem = new Map<string, string | null>();
  const inventoryImageByItem = new Map<string, string | null>();
  for (const row of inventoryRows ?? []) {
    const itemId = String(row.lightspeed_item_id);
    productUuidByItem.set(itemId, row.product_uuid ? String(row.product_uuid) : null);
    inventoryImageByItem.set(
      itemId,
      typeof row.primary_image_url === "string" && row.primary_image_url.trim()
        ? row.primary_image_url.trim()
        : null,
    );
  }

  const linkedProductIds = [
    ...new Set(
      [...productUuidByItem.values()].filter((id): id is string => Boolean(id)),
    ),
  ];

  let productsQuery = supabase
    .from("products")
    .select(`
      id,
      lightspeed_item_id,
      canonical_product_id,
      selected_product_image_id,
      cached_image_url,
      cached_thumbnail_url,
      product_images!product_id (
        id,
        product_id,
        canonical_product_id,
        cloudinary_public_id,
        cloudinary_url,
        external_url,
        is_primary,
        approval_status,
        sort_order,
        source
      ),
      canonical_products!canonical_product_id (
        product_images!canonical_product_id (
          id,
          product_id,
          canonical_product_id,
          cloudinary_public_id,
          cloudinary_url,
          external_url,
          is_primary,
          approval_status,
          sort_order,
          source
        )
      )
    `)
    .eq("user_id", userId);

  if (linkedProductIds.length > 0) {
    productsQuery = productsQuery.or(
      `lightspeed_item_id.in.(${uniqueItemIds.join(",")}),id.in.(${linkedProductIds.join(",")})`,
    );
  } else {
    productsQuery = productsQuery.in("lightspeed_item_id", uniqueItemIds);
  }

  const { data: products } = await productsQuery;
  const productRows = (products ?? []) as unknown as ProductRowForImage[];

  const productIds = productRows.map((product) => String(product.id));
  const mrpByProductId = new Map<string, MarketplaceReadyImageRow>();
  if (productIds.length > 0) {
    const { data: marketplaceRows } = await supabase
      .from("marketplace_ready_products")
      .select(`
        id,
        resolved_image_id,
        resolved_image_source,
        resolved_external_url,
        resolved_cloudinary_url,
        resolved_cloudinary_public_id
      `)
      .eq("user_id", userId)
      .in("id", productIds);

    for (const row of (marketplaceRows ?? []) as MarketplaceReadyImageRow[]) {
      mrpByProductId.set(String(row.id), row);
    }
  }

  const urlByProductId = new Map<string, string | null>();
  const urlByLightspeedItemId = new Map<string, string | null>();
  for (const product of productRows) {
    const url = resolveImageForProductRow(
      product,
      mrpByProductId.get(String(product.id)),
    );
    urlByProductId.set(String(product.id), url);
    urlByLightspeedItemId.set(String(product.lightspeed_item_id), url);
  }

  for (const itemId of uniqueItemIds) {
    const url =
      urlByLightspeedItemId.get(itemId) ??
      (() => {
        const productId = productUuidByItem.get(itemId);
        return productId ? urlByProductId.get(productId) ?? null : null;
      })() ??
      inventoryImageByItem.get(itemId) ??
      null;

    result.set(itemId, url ?? null);
  }

  return result;
}

/**
 * Get thumbnail URL for a product (for search results)
 */
export async function getProductThumbnailUrl(
  supabase: SupabaseClient,
  productId: string,
  canonicalProductId?: string | null
): Promise<string | null> {
  const toThumb = (row: { cloudinary_public_id: string | null; cloudinary_url: string | null; external_url: string | null } | null) => {
    if (!row) return null;
    const publicId = row.cloudinary_public_id || extractCloudinaryPublicId(row.cloudinary_url);
    return buildCloudinaryImageUrl(publicId, "thumbnail") || row.external_url || row.cloudinary_url;
  };

  // Try product_id first
  const { data: byProductId } = await supabase
    .from("product_images")
    .select("cloudinary_public_id, cloudinary_url, external_url, is_primary")
    .eq("product_id", productId)
    .eq("approval_status", "approved")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .single();

  if (byProductId) {
    return toThumb(byProductId);
  }

  // Fall back to canonical_product_id
  if (canonicalProductId) {
    const { data: byCanonicalId } = await supabase
      .from("product_images")
      .select("cloudinary_public_id, cloudinary_url, external_url, is_primary")
      .eq("canonical_product_id", canonicalProductId)
      .eq("approval_status", "approved")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .single();

    if (byCanonicalId) {
      return toThumb(byCanonicalId);
    }
  }

  return null;
}

// ============================================================
// Write Operations
// ============================================================

/**
 * Add a new image to a product
 */
export async function addProductImage(
  supabase: SupabaseClient,
  productId: string,
  cloudinaryResult: CloudinaryImageResult,
  options: AddImageOptions = {},
  canonicalProductId?: string | null
): Promise<ProductImage | null> {
  const {
    setAsPrimary = false,
    sortOrder = 0,
    source = "upload",
    approvalStatus = "approved",
  } = options;

  // If setting as primary, unset all other primary flags and adjust sort orders
  if (setAsPrimary && sortOrder === 0) {
    // Get all existing images for this product
    const { data: existingImages } = await supabase
      .from("product_images")
      .select("id, sort_order")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });

    if (existingImages && existingImages.length > 0) {
      // Increment sort_order of all existing images to make room at position 0
      for (const img of existingImages) {
        await supabase
          .from("product_images")
          .update({ is_primary: false, sort_order: img.sort_order + 1 })
          .eq("id", img.id);
      }
    }

    // Also handle canonical images if applicable
    if (canonicalProductId) {
      const { data: canonicalImages } = await supabase
        .from("product_images")
        .select("id, sort_order")
        .eq("canonical_product_id", canonicalProductId)
        .order("sort_order", { ascending: true });

      if (canonicalImages && canonicalImages.length > 0) {
        for (const img of canonicalImages) {
          await supabase
            .from("product_images")
            .update({ is_primary: false, sort_order: img.sort_order + 1 })
            .eq("id", img.id);
        }
      }
    }
  } else if (setAsPrimary) {
    // Just unset is_primary flags without changing sort_order
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", productId);

    if (canonicalProductId) {
      await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("canonical_product_id", canonicalProductId);
    }
  }

  // Insert the new image
  const { data, error } = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      canonical_product_id: canonicalProductId,
      external_url: cloudinaryResult.url,
      cloudinary_url: cloudinaryResult.url,
      cloudinary_public_id:
        cloudinaryResult.publicId || extractCloudinaryPublicId(cloudinaryResult.url),
      is_primary: setAsPrimary,
      sort_order: sortOrder,
      approval_status: approvalStatus,
      source: source,
    })
    .select()
    .single();

  if (error) {
    console.error("[ProductImages] Failed to add image:", error);
    return null;
  }

  return data;
}

/**
 * Set an image as the primary/hero image
 */
export async function setHeroImage(
  supabase: SupabaseClient,
  productId: string,
  imageId: string,
  canonicalProductId?: string | null
): Promise<boolean> {
  // Unset all other primary flags for this product
  await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId);

  if (canonicalProductId) {
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("canonical_product_id", canonicalProductId);
  }

  // Set this image as primary and move to sort_order 0
  const { error } = await supabase
    .from("product_images")
    .update({ is_primary: true, sort_order: 0 })
    .eq("id", imageId);

  if (error) {
    console.error("[ProductImages] Failed to set hero image:", error);
    return false;
  }

  return true;
}

/**
 * Remove an image from a product
 */
export async function removeProductImage(
  supabase: SupabaseClient,
  imageId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", imageId);

  if (error) {
    console.error("[ProductImages] Failed to remove image:", error);
    return false;
  }

  return true;
}

/**
 * Reorder images for a product
 * @param imageOrder Array of { id: string, sortOrder: number }
 */
export async function reorderProductImages(
  supabase: SupabaseClient,
  imageOrder: Array<{ id: string; sortOrder: number }>
): Promise<boolean> {
  const updatePromises = imageOrder.map(({ id, sortOrder }) =>
    supabase.from("product_images").update({ sort_order: sortOrder }).eq("id", id)
  );

  const results = await Promise.all(updatePromises);
  const hasError = results.some((r) => r.error);

  if (hasError) {
    console.error("[ProductImages] Failed to reorder images");
    return false;
  }

  return true;
}

// ============================================================
// Bulk Operations (for batch inserts)
// ============================================================

/**
 * Add multiple images to a product at once
 * Useful for bulk upload flows
 */
export async function addProductImages(
  supabase: SupabaseClient,
  productId: string,
  images: Array<{
    cloudinaryResult: CloudinaryImageResult;
    isPrimary?: boolean;
    sortOrder?: number;
    source?: string;
  }>,
  canonicalProductId?: string | null
): Promise<ProductImage[]> {
  // If any image is marked as primary, unset all existing primaries first
  const hasPrimary = images.some((img) => img.isPrimary);
  if (hasPrimary) {
    await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", productId);

    if (canonicalProductId) {
      await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("canonical_product_id", canonicalProductId);
    }
  }

  // Prepare insert data
  const insertData = images.map((img, index) => ({
    product_id: productId,
    canonical_product_id: canonicalProductId,
    external_url: img.cloudinaryResult.url,
    cloudinary_url: img.cloudinaryResult.url,
    cloudinary_public_id:
      img.cloudinaryResult.publicId || extractCloudinaryPublicId(img.cloudinaryResult.url),
    is_primary: img.isPrimary || false,
    sort_order: img.sortOrder ?? index,
    approval_status: "approved" as const,
    source: img.source || "bulk_upload",
  }));

  console.log("[ProductImages] Attempting to insert:", JSON.stringify(insertData, null, 2));
  
  const { data, error } = await supabase
    .from("product_images")
    .insert(insertData)
    .select();

  if (error) {
    console.error("[ProductImages] Failed to add images:", error);
    console.error("[ProductImages] Error code:", error.code);
    console.error("[ProductImages] Error details:", error.details);
    console.error("[ProductImages] Error hint:", error.hint);
    return [];
  }

  console.log("[ProductImages] Successfully inserted:", data?.length, "images");
  return data || [];
}

// ============================================================
// Helper: Convert ProductImage to JSONB format (for backwards compat)
// ============================================================

export function toJsonbFormat(images: ProductImage[]): Array<{
  id: string;
  url: string;
  cardUrl: string | null;
  mobileCardUrl: string | null;
  thumbnailUrl: string | null;
  galleryUrl: string | null;
  detailUrl: string | null;
  isPrimary: boolean;
  order: number;
  source: string | null;
}> {
  return images.map((img) => {
    // Single source of truth: derive every variant from the public_id.
    const publicId = img.cloudinary_public_id || extractCloudinaryPublicId(img.cloudinary_url);
    const fallback = img.cloudinary_url || img.external_url || null;
    const slot = (s: Parameters<typeof buildCloudinaryImageUrl>[1]) =>
      buildCloudinaryImageUrl(publicId, s) || fallback;
    return {
      id: img.id,
      url: img.cloudinary_url || img.external_url || "",
      cardUrl: slot("grid_card"),
      mobileCardUrl: slot("mobile_card"),
      thumbnailUrl: slot("thumbnail"),
      galleryUrl: slot("web_hero"),
      detailUrl: slot("zoom"),
      isPrimary: img.is_primary,
      order: img.sort_order,
      source: img.source,
    };
  });
}

/**
 * Helper: Generate all Cloudinary variant URLs from a base URL
 */
export function generateCloudinaryVariants(
  cloudinaryUrl: string
): CloudinaryImageResult | null {
  if (!cloudinaryUrl || !cloudinaryUrl.includes("res.cloudinary.com")) {
    return null;
  }

  try {
    const publicId = extractCloudinaryPublicId(cloudinaryUrl);

    if (!publicId) {
      return null;
    }

    // Extract cloud name
    const cloudNameMatch = cloudinaryUrl.match(
      /res\.cloudinary\.com\/([^\/]+)\//
    );
    const cloudName = cloudNameMatch?.[1] || "dydrzocpt";

    const variants = buildCloudinaryVariantUrls(publicId, cloudName);

    return {
      url: `https://res.cloudinary.com/${cloudName}/image/upload/${publicId}`,
      publicId,
      cardUrl: variants.cardUrl || cloudinaryUrl,
      mobileCardUrl: variants.mobileCardUrl || cloudinaryUrl,
      thumbnailUrl: variants.thumbnailUrl || cloudinaryUrl,
      galleryUrl: variants.galleryUrl || cloudinaryUrl,
      detailUrl: variants.detailUrl || cloudinaryUrl,
    };
  } catch {
    return null;
  }
}
