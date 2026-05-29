// f_auto lets Cloudinary negotiate AVIF/WebP/JPEG per the browser's Accept header
// (AVIF is ~20-30% smaller than WebP), so we never hardcode a single format.
export const CLOUDINARY_IMAGE_TRANSFORMS = {
  thumbnail: "w_120,c_limit,q_auto:low,f_auto",
  mobile_card: "w_320,ar_1:1,c_fill,g_center,q_auto:good,f_auto",
  grid_card: "w_640,ar_1:1,c_fill,g_center,q_auto:good,f_auto",
  mobile_hero: "w_1000,ar_1:1,c_pad,b_white,q_auto:best,f_auto",
  web_hero: "w_1600,ar_4:3,c_pad,b_white,q_auto:best,f_auto",
  zoom: "w_2000,c_limit,q_auto:best,f_auto",
} as const;

export type CloudinaryImageSlot = keyof typeof CLOUDINARY_IMAGE_TRANSFORMS;

export const CLOUDINARY_EAGER_TRANSFORMS = Object.values(CLOUDINARY_IMAGE_TRANSFORMS).join("|");

export function extractCloudinaryPublicId(url: string | null | undefined): string | null {
  if (!url || !url.includes("res.cloudinary.com")) return null;

  try {
    const parsed = new URL(url);
    const uploadIndex = parsed.pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    let rest = parsed.pathname.slice(uploadIndex + "/upload/".length);
    rest = rest.replace(/^v\d+\//, "");

    const parts = rest.split("/").filter(Boolean);
    const publicParts = parts.filter(
      (part) => !/^(w_|h_|c_|ar_|g_|q_|f_|b_|e_|l_|o_|dpr_|fl_|r_|x_|y_|z_)/.test(part)
    );

    if (publicParts.length === 0) return null;

    const lastIndex = publicParts.length - 1;
    publicParts[lastIndex] = publicParts[lastIndex].replace(/\.(jpg|jpeg|png|gif|webp|avif)$/i, "");

    return publicParts.join("/");
  } catch {
    return null;
  }
}

export function buildCloudinaryImageUrl(
  publicId: string | null | undefined,
  slot: CloudinaryImageSlot,
  cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME
): string | null {
  if (!publicId || !cloudName) return null;

  return `https://res.cloudinary.com/${cloudName}/image/upload/${CLOUDINARY_IMAGE_TRANSFORMS[slot]}/${publicId}`;
}

export function buildCloudinaryVariantUrls(
  publicId: string | null | undefined,
  cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME
) {
  return {
    thumbnailUrl: buildCloudinaryImageUrl(publicId, "thumbnail", cloudName),
    mobileCardUrl: buildCloudinaryImageUrl(publicId, "mobile_card", cloudName),
    cardUrl: buildCloudinaryImageUrl(publicId, "grid_card", cloudName),
    mobileHeroUrl: buildCloudinaryImageUrl(publicId, "mobile_hero", cloudName),
    galleryUrl: buildCloudinaryImageUrl(publicId, "web_hero", cloudName),
    detailUrl: buildCloudinaryImageUrl(publicId, "zoom", cloudName),
  };
}

// next/image loader for square product-card crops. `src` is the Cloudinary
// public_id; next/image calls this once per device width to build a real
// DPR-aware srcset. Cloudinary handles crop, format (AVIF) and quality.
export function cloudinaryCardLoader({
  src,
  width,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const cloudName =
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME;
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,g_center,ar_1:1,w_${width},q_auto,f_auto/${src}`;
}
