import {
  buildCloudinaryImageUrl,
  type CloudinaryImageSlot,
  extractCloudinaryPublicId,
} from "@/lib/utils/cloudinary-transforms";

export interface ResolvableProductImage {
  id?: string | null;
  cloudinary_public_id?: string | null;
  cloudinary_url?: string | null;
  external_url?: string | null;
  thumbnail_url?: string | null;
  mobile_card_url?: string | null;
  card_url?: string | null;
  gallery_url?: string | null;
  detail_url?: string | null;
  approval_status?: string | null;
  is_primary?: boolean | null;
  sort_order?: number | null;
}

export interface ResolvedProductImage {
  id: string | null;
  thumbnail_url: string | null;
  mobile_card_url: string | null;
  card_url: string | null;
  mobile_hero_url: string | null;
  gallery_url: string | null;
  detail_url: string | null;
  original_url: string | null;
}

export function isApprovedImage(image: ResolvableProductImage | null | undefined): image is ResolvableProductImage {
  return !!image && (image.approval_status == null || image.approval_status === "approved");
}

export function getProductImageSlotUrl(
  image: ResolvableProductImage | null | undefined,
  slot: CloudinaryImageSlot
): string | null {
  if (!image) return null;

  // Single source of truth: every variant is generated from the public_id
  // (extracted from cloudinary_url for any straggler that lacks the column).
  const publicId = image.cloudinary_public_id || extractCloudinaryPublicId(image.cloudinary_url);
  const generated = buildCloudinaryImageUrl(publicId, slot);
  if (generated) return generated;

  // Non-Cloudinary fallback: retailer/external images that can't be hosted on
  // Cloudinary (e.g. sources that 403 on download) are served at their origin URL.
  return image.external_url || image.cloudinary_url || null;
}

export function resolveProductImage(image: ResolvableProductImage | null | undefined): ResolvedProductImage | null {
  if (!image) return null;

  const cardUrl = getProductImageSlotUrl(image, "grid_card");
  const originalUrl = image.cloudinary_url || image.external_url || cardUrl;

  return {
    id: image.id || null,
    thumbnail_url: getProductImageSlotUrl(image, "thumbnail"),
    mobile_card_url: getProductImageSlotUrl(image, "mobile_card"),
    card_url: cardUrl,
    mobile_hero_url: getProductImageSlotUrl(image, "mobile_hero"),
    gallery_url: getProductImageSlotUrl(image, "web_hero"),
    detail_url: getProductImageSlotUrl(image, "zoom"),
    original_url: originalUrl || null,
  };
}

export function pickPrimaryImage<T extends ResolvableProductImage>(images: T[] | null | undefined): T | null {
  const approved = (images || []).filter(isApprovedImage);
  return (
    approved.find((image) => image.is_primary) ||
    [...approved].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0] ||
    null
  );
}
