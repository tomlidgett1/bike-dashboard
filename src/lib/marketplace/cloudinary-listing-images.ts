export const CLOUDINARY_IMAGE_TRANSFORMS = {
  thumbnail: "a_auto,w_120,c_limit,q_auto:low,f_auto",
  mobileCard: "a_auto,w_320,ar_1:1,c_fill,g_center,q_auto:good,f_auto",
  gridCard: "a_auto,w_640,ar_1:1,c_fill,g_center,q_auto:good,f_auto",
  mobileHero: "a_auto,w_1000,ar_1:1,c_pad,b_white,q_auto:best,f_auto",
  webHero: "a_auto,w_1600,ar_4:3,c_pad,b_white,q_auto:best,f_auto",
  zoom: "a_auto,w_2000,c_limit,q_auto:best,f_auto",
} as const;

export interface CloudinaryListingImage {
  url: string;
  cardUrl: string;
  mobileCardUrl: string;
  thumbnailUrl: string;
  galleryUrl: string;
  detailUrl: string;
  publicId: string;
  width?: number;
  height?: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function buildCloudinaryListingUrls(cloudName: string, publicId: string) {
  const baseUrl = `https://res.cloudinary.com/${cloudName.trim()}/image/upload`;
  return {
    thumbnailUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.thumbnail}/${publicId}`,
    mobileCardUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.mobileCard}/${publicId}`,
    cardUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.gridCard}/${publicId}`,
    galleryUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.webHero}/${publicId}`,
    detailUrl: `${baseUrl}/${CLOUDINARY_IMAGE_TRANSFORMS.zoom}/${publicId}`,
  };
}

function getSupabaseFunctionUrl(functionName: string): string {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
}

function getSupabaseFunctionSecret(): string {
  return (
    process.env.NEST_SUPABASE_SECRET_KEY?.trim() ||
    process.env.INTERNAL_EDGE_SHARED_SECRET?.trim() ||
    process.env.NEST_INTERNAL_EDGE_SHARED_SECRET?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEYS?.trim() ||
    process.env.NEW_SUPABASE_SECRET_KEY?.trim() ||
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY")
  );
}

export async function uploadRemoteListingImageToCloudinary(params: {
  imageUrl: string;
  token: string;
  index: number;
}): Promise<CloudinaryListingImage> {
  const response = await fetch(getSupabaseFunctionUrl("upload-to-cloudinary"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": getSupabaseFunctionSecret(),
    },
    body: JSON.stringify({
      imageUrl: params.imageUrl,
      listingId: params.token,
      index: params.index,
    }),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.data) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Cloudinary upload failed",
    );
  }

  const image = data.data as Record<string, unknown>;

  return {
    url: String(image.url || ""),
    cardUrl: String(image.cardUrl || image.url || ""),
    mobileCardUrl: String(image.mobileCardUrl || image.cardUrl || image.url || ""),
    thumbnailUrl: String(image.thumbnailUrl || image.cardUrl || image.url || ""),
    galleryUrl: String(image.galleryUrl || image.url || ""),
    detailUrl: String(image.detailUrl || image.galleryUrl || image.url || ""),
    publicId: String(image.publicId || ""),
    width: typeof image.width === "number" ? image.width : undefined,
    height: typeof image.height === "number" ? image.height : undefined,
  };
}
