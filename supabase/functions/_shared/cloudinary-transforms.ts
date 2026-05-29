// f_auto negotiates AVIF/WebP/JPEG per browser; keep in sync with
// src/lib/utils/cloudinary-transforms.ts so eager pre-warm matches delivery.
export const CLOUDINARY_IMAGE_TRANSFORMS = {
  thumbnail: "w_120,c_limit,q_auto:low,f_auto",
  mobileCard: "w_320,ar_1:1,c_fill,g_center,q_auto:good,f_auto",
  gridCard: "w_640,ar_1:1,c_fill,g_center,q_auto:good,f_auto",
  mobileHero: "w_1000,ar_1:1,c_pad,b_white,q_auto:best,f_auto",
  webHero: "w_1600,ar_4:3,c_pad,b_white,q_auto:best,f_auto",
  zoom: "w_2000,c_limit,q_auto:best,f_auto",
} as const;

export const CLOUDINARY_EAGER_TRANSFORMS = Object.values(CLOUDINARY_IMAGE_TRANSFORMS).join("|");

export function buildCloudinaryUrls(cloudName: string, publicId: string) {
  const baseUrl = `https://res.cloudinary.com/${cloudName}/image/upload`;

  return {
    thumbnailUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.thumbnail}/${publicId}`,
    mobileCardUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.mobileCard}/${publicId}`,
    cardUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.gridCard}/${publicId}`,
    mobileHeroUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.mobileHero}/${publicId}`,
    galleryUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.webHero}/${publicId}`,
    detailUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.zoom}/${publicId}`,
  };
}
