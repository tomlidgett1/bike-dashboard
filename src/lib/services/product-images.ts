/**
 * Product Images Service
 *
 * Single source of truth for all image operations.
 * All code paths should use this service for reading and writing product images.
 *
 * The canonical data store is the `product_images` table.
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Types
// ============================================================

export interface ProductImage {
  id: string;
  product_id: string | null;
  canonical_product_id: string | null;
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
  // Try product_id first
  const { data: byProductId } = await supabase
    .from("product_images")
    .select("card_url, cloudinary_url, is_primary")
    .eq("product_id", productId)
    .eq("approval_status", "approved")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .single();

  if (byProductId) {
    return byProductId.card_url || byProductId.cloudinary_url;
  }

  // Fall back to canonical_product_id
  if (canonicalProductId) {
    const { data: byCanonicalId } = await supabase
      .from("product_images")
      .select("card_url, cloudinary_url, is_primary")
      .eq("canonical_product_id", canonicalProductId)
      .eq("approval_status", "approved")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .single();

    if (byCanonicalId) {
      return byCanonicalId.card_url || byCanonicalId.cloudinary_url;
    }
  }

  return null;
}

/**
 * Get thumbnail URL for a product (for search results)
 */
export async function getProductThumbnailUrl(
  supabase: SupabaseClient,
  productId: string,
  canonicalProductId?: string | null
): Promise<string | null> {
  // Try product_id first
  const { data: byProductId } = await supabase
    .from("product_images")
    .select("thumbnail_url, card_url, cloudinary_url, is_primary")
    .eq("product_id", productId)
    .eq("approval_status", "approved")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .limit(1)
    .single();

  if (byProductId) {
    return (
      byProductId.thumbnail_url ||
      byProductId.card_url ||
      byProductId.cloudinary_url
    );
  }

  // Fall back to canonical_product_id
  if (canonicalProductId) {
    const { data: byCanonicalId } = await supabase
      .from("product_images")
      .select("thumbnail_url, card_url, cloudinary_url, is_primary")
      .eq("canonical_product_id", canonicalProductId)
      .eq("approval_status", "approved")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1)
      .single();

    if (byCanonicalId) {
      return (
        byCanonicalId.thumbnail_url ||
        byCanonicalId.card_url ||
        byCanonicalId.cloudinary_url
      );
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

  // If setting as primary, unset all other primary flags first
  if (setAsPrimary) {
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
      card_url: cloudinaryResult.cardUrl,
      mobile_card_url: cloudinaryResult.mobileCardUrl || null,
      thumbnail_url: cloudinaryResult.thumbnailUrl,
      gallery_url: cloudinaryResult.galleryUrl || null,
      detail_url: cloudinaryResult.detailUrl || null,
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
    card_url: img.cloudinaryResult.cardUrl,
    mobile_card_url: img.cloudinaryResult.mobileCardUrl || null,
    thumbnail_url: img.cloudinaryResult.thumbnailUrl,
    gallery_url: img.cloudinaryResult.galleryUrl || null,
    detail_url: img.cloudinaryResult.detailUrl || null,
    is_primary: img.isPrimary || false,
    sort_order: img.sortOrder ?? index,
    approval_status: "approved" as const,
    source: img.source || "bulk_upload",
  }));

  const { data, error } = await supabase
    .from("product_images")
    .insert(insertData)
    .select();

  if (error) {
    console.error("[ProductImages] Failed to add images:", error);
    return [];
  }

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
  return images.map((img) => ({
    id: img.id,
    url: img.cloudinary_url || img.external_url || "",
    cardUrl: img.card_url,
    mobileCardUrl: img.mobile_card_url,
    thumbnailUrl: img.thumbnail_url,
    galleryUrl: img.gallery_url,
    detailUrl: img.detail_url,
    isPrimary: img.is_primary,
    order: img.sort_order,
    source: img.source,
  }));
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
    // Extract the public ID from the URL
    // URL format: https://res.cloudinary.com/CLOUD_NAME/image/upload/[transformations/]VERSION/PUBLIC_ID
    const urlObj = new URL(cloudinaryUrl);
    const pathname = urlObj.pathname;
    const uploadIndex = pathname.indexOf("/upload/");

    if (uploadIndex === -1) {
      return null;
    }

    let afterUpload = pathname.substring(uploadIndex + 8);

    // Remove version if present (v1234567890/)
    afterUpload = afterUpload.replace(/^v\d+\//, "");

    // Remove any existing transformations (everything before the last path segment that starts with the folder)
    // Transformations look like: w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp/
    const parts = afterUpload.split("/");
    const publicIdParts: string[] = [];
    let foundFolder = false;

    for (const part of parts) {
      // If part contains common transformation patterns, skip it
      if (
        /^(w_|h_|c_|ar_|g_|q_|f_|b_|e_|l_|o_|t_|x_|y_|z_|dpr_|fl_|if_|pg_|r_|so_|sp_|u_|vc_|vs_)/.test(
          part
        )
      ) {
        continue;
      }
      // Known folders
      if (
        part === "bike-marketplace" ||
        part === "listings" ||
        part === "ecommerce-hero" ||
        part === "canonical"
      ) {
        foundFolder = true;
      }
      if (foundFolder || publicIdParts.length > 0) {
        publicIdParts.push(part);
      }
    }

    // Remove file extension from last part
    if (publicIdParts.length > 0) {
      const lastPart = publicIdParts[publicIdParts.length - 1];
      publicIdParts[publicIdParts.length - 1] = lastPart.replace(
        /\.(jpg|jpeg|png|gif|webp)$/i,
        ""
      );
    }

    const publicId = publicIdParts.join("/");

    if (!publicId) {
      return null;
    }

    // Extract cloud name
    const cloudNameMatch = cloudinaryUrl.match(
      /res\.cloudinary\.com\/([^\/]+)\//
    );
    const cloudName = cloudNameMatch?.[1] || "dydrzocpt";

    const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`;

    return {
      url: `${baseUrl}/${publicId}`,
      publicId,
      cardUrl: `${baseUrl}/w_400,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${publicId}`,
      mobileCardUrl: `${baseUrl}/w_200,ar_1:1,c_fill,g_center,q_auto:good,f_webp/${publicId}`,
      thumbnailUrl: `${baseUrl}/w_100,c_limit,q_auto:low,f_webp/${publicId}`,
      galleryUrl: `${baseUrl}/w_1200,ar_4:3,c_pad,b_white,q_auto:best,f_webp/${publicId}`,
      detailUrl: `${baseUrl}/w_2000,c_limit,q_auto:best,f_webp/${publicId}`,
    };
  } catch {
    return null;
  }
}

