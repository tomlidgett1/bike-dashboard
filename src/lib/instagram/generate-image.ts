/**
 * Generate an Instagram-ready image with OpenAI gpt-image-2, then host it via
 * the existing Supabase upload-to-cloudinary edge function (Cloudinary secrets
 * already live in Supabase).
 *
 * When "Include our logo" is on, the store logo is passed as an image input to
 * /v1/images/edits so the model composes it into the scene (not a post overlay).
 */

import OpenAI from "openai";
import sharp from "sharp";
import {
  formatInstagramProductFacts,
  resolveInstagramCatalogueProduct,
  type InstagramCatalogueProduct,
} from "@/lib/instagram/catalogue";
import { generateInstagramCaption } from "@/lib/instagram/generate-caption";
import {
  type InstagramDestination,
  type InstagramFormat,
  type InstagramPostAspect,
  resolveInstagramFormat,
} from "@/lib/instagram/formats";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Latest OpenAI image generation model. */
const DEFAULT_IMAGE_MODEL = "gpt-image-2";

function getOpenAIApiKey() {
  const apiKey =
    process.env.OPENAI_API_KEY?.trim() || process.env.NEST_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return apiKey;
}

function getOpenAI() {
  return new OpenAI({ apiKey: getOpenAIApiKey() });
}

function getSupabaseFunctionUrl(functionName: string): string {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`;
}

/** Prefer the shared edge secret (not the service-role JWT). */
function getInternalEdgeSecret(): string {
  const secret =
    process.env.INTERNAL_EDGE_SHARED_SECRET?.trim() ||
    process.env.NEST_INTERNAL_EDGE_SHARED_SECRET?.trim();
  if (!secret) {
    throw new Error("INTERNAL_EDGE_SHARED_SECRET is not configured.");
  }
  return secret;
}

async function toInstagramJpegBytes(
  base64: string,
  format: InstagramFormat,
): Promise<Buffer> {
  const raw = base64.replace(/^data:image\/\w+;base64,/, "");
  const source = Buffer.from(raw, "base64");
  return sharp(source)
    .resize(format.width, format.height, {
      fit: "cover",
      position: "center",
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function remoteUrlToInstagramJpeg(
  imageUrl: string,
  format: InstagramFormat,
): Promise<Buffer> {
  const res = await fetch(imageUrl, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Could not download generated image (${res.status}).`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return sharp(buffer)
    .resize(format.width, format.height, {
      fit: "cover",
      position: "center",
    })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function fetchStoreLogoUrl(ownerUserId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("users")
    .select("logo_url")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (error) {
    console.error("[ig-logo] failed to load store logo:", error.message);
    return null;
  }
  const url = typeof data?.logo_url === "string" ? data.logo_url.trim() : "";
  if (!url || url.includes("googleusercontent.com")) return null;
  return url;
}

async function downloadReferenceImage(
  imageUrl: string,
  label: string,
  maxEdge = 1024,
): Promise<{ bytes: Buffer; filename: string; contentType: string }> {
  const response = await fetch(imageUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not download ${label} (${response.status}).`);
  }
  const source = Buffer.from(await response.arrayBuffer());
  // JPEG keeps multipart edits under Cloudflare/OpenAI body limits (520s).
  const bytes = await sharp(source)
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
  return {
    bytes,
    filename: `${label.replace(/\s+/g, "-").toLowerCase()}.jpg`,
    contentType: "image/jpeg",
  };
}

function buildImagePrompt(params: {
  prompt: string;
  format: InstagramFormat;
  includeLogo: boolean;
  productName?: string | null;
  productFacts?: string | null;
  hasProductImage: boolean;
}): string {
  return [
    "Create a high-quality Instagram marketing image for a bicycle store.",
    params.format.promptHint,
    "Professional photography style, no watermarks, no UI chrome, no phone frames.",
    params.hasProductImage
      ? [
          "The first input image is a real catalogue product photo.",
          params.productName
            ? `The product is: ${params.productName}.`
            : null,
          "Feature that exact product as the hero of the scene. Preserve its shape, colours, materials and key details accurately.",
          "Do not invent a different bike or product. Place it naturally in a compelling lifestyle or retail scene.",
        ]
          .filter(Boolean)
          .join(" ")
      : null,
    params.productFacts
      ? [
          "Use these exact catalogue product facts when the brief mentions price, discount, product name, or features:",
          params.productFacts,
          "If the brief asks for a discount such as 50% off, show the calculated discounted price from these facts. Do not invent prices.",
        ].join("\n")
      : null,
    params.includeLogo
      ? [
          params.hasProductImage
            ? "The second input image is the brand logo."
            : "A brand logo image is provided as input.",
          "Naturally incorporate that exact logo into the scene (signage, product, apparel, packaging, or a clean branded placement).",
          "Preserve the logo's colours, shapes, and any text accurately. Do not invent a different logo or redraw it incorrectly.",
          "The logo should feel designed into the photo, not pasted on as a sticker overlay.",
        ].join(" ")
      : null,
    `Creative brief: ${params.prompt}`,
  ]
    .filter(Boolean)
    .join(" ");
}

type OpenAIImageItem = {
  b64_json?: string;
  url?: string;
  revised_prompt?: string;
};

/**
 * Pass catalogue / logo images into gpt-image-2 edits so they are composed into
 * a new scene (not post overlays).
 */
function parseOpenAiErrorMessage(status: number, errorText: string): string {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: { message?: string };
    };
    if (parsed.error?.message?.trim()) {
      return parsed.error.message.trim();
    }
  } catch {
    // ignore
  }
  const trimmed = errorText.replace(/\s+/g, " ").trim();
  if (trimmed) return trimmed.slice(0, 220);
  if (status === 520 || status === 502 || status === 503 || status === 504) {
    return "The image service timed out. Try again with a shorter prompt.";
  }
  return `OpenAI edits failed (${status})`;
}

async function generateImageWithReferences(params: {
  references: Array<{ bytes: Buffer; filename: string; contentType: string }>;
  prompt: string;
  size: string;
}): Promise<OpenAIImageItem> {
  if (params.references.length === 0) {
    throw new Error("At least one reference image is required.");
  }

  const model = process.env.INSTAGRAM_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const quality = process.env.INSTAGRAM_IMAGE_QUALITY?.trim() || "medium";
  // Keep edit prompts bounded; huge product-fact blobs contribute to 520s.
  const prompt =
    params.prompt.length > 2500
      ? `${params.prompt.slice(0, 2497).trim()}…`
      : params.prompt;

  const attempt = async () => {
    const formData = new FormData();
    // OpenAI multi-image edits expect repeated image[] parts.
    const imageKey = params.references.length > 1 ? "image[]" : "image";
    for (const reference of params.references) {
      formData.append(
        imageKey,
        new Blob([new Uint8Array(reference.bytes)], {
          type: reference.contentType,
        }),
        reference.filename,
      );
    }
    formData.append("prompt", prompt);
    formData.append("model", model);
    formData.append("size", params.size);
    formData.append("n", "1");
    formData.append("quality", quality);

    return fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenAIApiKey()}`,
      },
      body: formData,
    });
  };

  let response = await attempt();
  // Transient Cloudflare/OpenAI edge failures.
  if ([520, 502, 503, 504].includes(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    response = await attempt();
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(
      "[ig-reference] OpenAI edits error:",
      response.status,
      errorText,
    );
    throw new Error(
      `Could not generate image from your selected photo: ${parseOpenAiErrorMessage(response.status, errorText)}`,
    );
  }

  const result = (await response.json()) as { data?: OpenAIImageItem[] };
  const item = result.data?.[0];
  if (!item) {
    throw new Error("OpenAI did not return an image.");
  }
  return item;
}

async function generateImageFromPrompt(params: {
  prompt: string;
  size: string;
}): Promise<OpenAIImageItem> {
  const openai = getOpenAI();
  const model = process.env.INSTAGRAM_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const response = await openai.images.generate({
    model,
    prompt: params.prompt,
    size: params.size as `${number}x${number}`,
    n: 1,
  });
  const item = response.data?.[0] as OpenAIImageItem | undefined;
  if (!item) {
    throw new Error("OpenAI did not return an image.");
  }
  return item;
}

async function uploadToCloudinaryViaSupabase(params: {
  listingId: string;
  index?: number;
  jpegBytes: Buffer;
}): Promise<{ url: string; publicId: string }> {
  const endpoint = getSupabaseFunctionUrl("upload-to-cloudinary");
  const secret = getInternalEdgeSecret();
  const listingId = params.listingId;
  const index = params.index ?? 0;

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(params.jpegBytes)], { type: "image/jpeg" }),
    "instagram.jpg",
  );
  form.append("listingId", listingId);
  form.append("index", String(index));

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-internal-secret": secret,
    },
    body: form,
    cache: "no-store",
  });

  const data = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    data?: { url?: string; publicId?: string };
  };

  if (!response.ok || !data.success || !data.data?.url) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Cloudinary upload via Supabase failed (${response.status}).`,
    );
  }

  return {
    url: String(data.data.url),
    publicId: String(data.data.publicId || ""),
  };
}

export type GeneratedInstagramImage = {
  postId: string;
  imageUrl: string;
  publicId: string;
  prompt: string;
  caption: string;
  revisedPrompt: string | null;
  destination: InstagramDestination;
  aspect: InstagramPostAspect | "story";
  formatId: string;
  width: number;
  height: number;
  includedLogo: boolean;
  productId: string | null;
  productName: string | null;
};

async function createAndHostImage(params: {
  ownerUserId: string;
  prompt: string;
  format: InstagramFormat;
  includeLogo?: boolean;
  logoUrl?: string | null;
  productImageUrl?: string | null;
  productName?: string | null;
  productFacts?: string | null;
}): Promise<{
  url: string;
  publicId: string;
  revisedPrompt: string | null;
  includedLogo: boolean;
}> {
  const includeLogo = Boolean(params.includeLogo && params.logoUrl);
  const hasProductImage = Boolean(params.productImageUrl);
  const fullPrompt = buildImagePrompt({
    prompt: params.prompt,
    format: params.format,
    includeLogo,
    productName: params.productName,
    productFacts: params.productFacts,
    hasProductImage,
  });

  const references: Array<{
    bytes: Buffer;
    filename: string;
    contentType: string;
  }> = [];
  if (params.productImageUrl) {
    references.push(
      await downloadReferenceImage(params.productImageUrl, "product-primary"),
    );
  }
  if (includeLogo && params.logoUrl) {
    references.push(await downloadReferenceImage(params.logoUrl, "store-logo"));
  }

  const item =
    references.length > 0
      ? await generateImageWithReferences({
          references,
          prompt: fullPrompt,
          size: params.format.openaiSize,
        })
      : await generateImageFromPrompt({
          prompt: fullPrompt,
          size: params.format.openaiSize,
        });

  let jpegBytes: Buffer;
  if (item.b64_json) {
    jpegBytes = await toInstagramJpegBytes(item.b64_json, params.format);
  } else if (item.url) {
    jpegBytes = await remoteUrlToInstagramJpeg(item.url, params.format);
  } else {
    throw new Error("OpenAI returned neither b64_json nor url.");
  }

  const uploaded = await uploadToCloudinaryViaSupabase({
    listingId: `store-instagram-${params.ownerUserId}`,
    jpegBytes,
  });

  return {
    url: uploaded.url,
    publicId: uploaded.publicId,
    revisedPrompt: item.revised_prompt ?? null,
    includedLogo: includeLogo,
  };
}

/**
 * Edit already-uploaded photos with AI (optional logo), then re-host.
 * Used for History → Edit, upload + logo, and prompt-driven photo reworks.
 */
export async function editInstagramPhotoUrls(params: {
  ownerUserId: string;
  imageUrls: string[];
  aspect?: InstagramPostAspect | null;
  prompt?: string | null;
  includeLogo?: boolean;
}): Promise<string[]> {
  const urls = params.imageUrls.map((url) => url.trim()).filter(Boolean);
  if (urls.length === 0) {
    throw new Error("Add at least one photo first.");
  }

  const brief = params.prompt?.trim() || "";
  const includeLogo = Boolean(params.includeLogo);
  if (!brief && !includeLogo) {
    throw new Error("Describe the changes you want, or turn on Include our logo.");
  }

  let logoReference: {
    bytes: Buffer;
    filename: string;
    contentType: string;
  } | null = null;
  if (includeLogo) {
    const logoUrl = await fetchStoreLogoUrl(params.ownerUserId);
    if (!logoUrl) {
      throw new Error(
        "No store logo found. Upload one in Settings → Store profile first.",
      );
    }
    logoReference = await downloadReferenceImage(logoUrl, "store-logo");
  }

  const format = resolveInstagramFormat({
    destination: "post",
    aspect: params.aspect ?? "square",
  });
  const editedUrls: string[] = [];

  for (let index = 0; index < urls.length; index += 1) {
    const photoReference = await downloadReferenceImage(
      urls[index],
      `photo-${index + 1}`,
    );
    const references = [photoReference];
    if (logoReference) {
      references.push(logoReference);
    }

    const promptParts = [
      "Edit this photograph for an Instagram bicycle store post.",
      format.promptHint,
      "The first input image is the source photo.",
      brief
        ? "Apply the requested creative changes while keeping the product recognisable and high quality."
        : "Preserve the product, framing, lighting and overall look as closely as possible.",
      includeLogo
        ? [
            "The second input image is the brand logo.",
            "Naturally incorporate that exact logo into the photo (signage, apparel, packaging, or a clean branded placement).",
            "Preserve the logo's colours, shapes and text accurately. Do not invent a different logo.",
          ].join(" ")
        : null,
      "Do not add watermarks, UI chrome or phone frames.",
      brief
        ? `Requested changes: ${brief}`
        : "Creative note: Keep this product photo looking natural and premium.",
    ].filter(Boolean);

    const item = await generateImageWithReferences({
      references,
      prompt: promptParts.join(" "),
      size: format.openaiSize,
    });

    let jpegBytes: Buffer;
    if (item.b64_json) {
      jpegBytes = await toInstagramJpegBytes(item.b64_json, format);
    } else if (item.url) {
      jpegBytes = await remoteUrlToInstagramJpeg(item.url, format);
    } else {
      throw new Error("OpenAI returned neither b64_json nor url.");
    }

    const uploaded = await uploadToCloudinaryViaSupabase({
      listingId: `store-instagram-${params.ownerUserId}`,
      index: Date.now() + index,
      jpegBytes,
    });
    editedUrls.push(uploaded.url);
  }

  return editedUrls;
}

/** @deprecated Prefer editInstagramPhotoUrls with includeLogo: true */
export async function brandInstagramPhotoUrlsWithLogo(params: {
  ownerUserId: string;
  imageUrls: string[];
  aspect?: InstagramPostAspect | null;
  prompt?: string | null;
}): Promise<string[]> {
  return editInstagramPhotoUrls({
    ...params,
    includeLogo: true,
  });
}

export async function generateInstagramImageForStore(params: {
  ownerUserId: string;
  prompt: string;
  caption?: string | null;
  existingPostId?: string | null;
  storeUsername?: string | null;
  destination?: InstagramDestination;
  aspect?: InstagramPostAspect | null;
  includeLogo?: boolean;
  /** Marketplace-ready catalogue product whose approved primary image is a model input. */
  productId?: string | null;
  /** When true (default), draft a caption from the prompt if none was provided. */
  autoCaption?: boolean;
}): Promise<GeneratedInstagramImage> {
  const prompt = params.prompt.trim();
  if (!prompt) {
    throw new Error("Prompt is required.");
  }
  if (prompt.length > 3500) {
    throw new Error("Prompt is too long (max 3500 characters).");
  }

  const format = resolveInstagramFormat({
    destination: params.destination ?? "post",
    aspect: params.aspect ?? "square",
  });

  const providedCaption = params.caption?.trim() || "";
  const shouldAutoCaption = params.autoCaption !== false && !providedCaption;
  const includeLogo = Boolean(params.includeLogo);

  let logoUrl: string | null = null;
  if (includeLogo) {
    logoUrl = await fetchStoreLogoUrl(params.ownerUserId);
    if (!logoUrl) {
      throw new Error(
        "No store logo found. Upload one in Settings → Store profile first.",
      );
    }
  }

  let productImageUrl: string | null = null;
  let productName: string | null = null;
  let productId: string | null = null;
  let productFacts: string | null = null;
  let product: InstagramCatalogueProduct | null = null;
  if (params.productId) {
    product = await resolveInstagramCatalogueProduct({
      ownerUserId: params.ownerUserId,
      productId: params.productId,
    });
    productId = product.id;
    productName = product.name;
    productImageUrl = product.imageUrl;
    productFacts = formatInstagramProductFacts(product);
  }

  const captionPrompt = productFacts
    ? `${prompt}\n\nFeatured product facts:\n${productFacts}`
    : productName
      ? `${prompt}\nFeatured product: ${productName}`
      : prompt;

  const [image, draftedCaption] = await Promise.all([
    createAndHostImage({
      ownerUserId: params.ownerUserId,
      prompt,
      format,
      includeLogo,
      logoUrl,
      productImageUrl,
      productName,
      productFacts,
    }),
    shouldAutoCaption
      ? generateInstagramCaption({
          prompt: captionPrompt,
          storeUsername: params.storeUsername,
          destination: format.destination,
          productFacts,
        }).catch((error) => {
          console.error("[ig-caption] draft failed:", error);
          return "";
        })
      : Promise.resolve(providedCaption),
  ]);

  const caption = (draftedCaption || providedCaption).trim();

  const admin = createServiceRoleClient();
  const postMutation = params.existingPostId
    ? admin
        .from("store_instagram_posts")
        .update({
          prompt,
          caption,
          image_url: image.url,
          status: "draft",
          destination: format.destination,
          aspect: format.aspect,
          error_message: null,
        })
        .eq("id", params.existingPostId)
        .eq("user_id", params.ownerUserId)
    : admin.from("store_instagram_posts").insert({
        user_id: params.ownerUserId,
        prompt,
        caption,
        image_url: image.url,
        status: "draft",
        destination: format.destination,
        aspect: format.aspect,
      });
  const { data, error } = await postMutation.select("id").single();

  if (error || !data) {
    throw new Error(`Could not save generated image: ${error?.message ?? "unknown"}`);
  }

  return {
    postId: data.id as string,
    imageUrl: image.url,
    publicId: image.publicId,
    prompt,
    caption,
    revisedPrompt: image.revisedPrompt,
    destination: format.destination,
    aspect: format.aspect,
    formatId: format.id,
    width: format.width,
    height: format.height,
    includedLogo: image.includedLogo,
    productId,
    productName,
  };
}

const InstagramImageApi = {
  editInstagramPhotoUrls,
  brandInstagramPhotoUrlsWithLogo,
  generateInstagramImageForStore,
};

export default InstagramImageApi;
