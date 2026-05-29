/**
 * OpenAI Images Edit — ecommerce hero (light-grey primer + soft contact shadow).
 * Uses gpt-image-2 on /v1/images/edits (newest OpenAI image model).
 */

export const OPENAI_ECOMMERCE_IMAGE_MODEL = "gpt-image-2";

/** Prompt: background primer + professional shadow; preserve product pixels/condition. */
export const ECOMMERCE_HERO_PROMPT = `Place this exact product photograph on a soft light grey e‑commerce background (not pure white — use a subtle off‑white / very light grey like #F5F5F5 or #F8F8F8). Create a square hero product shot suitable for marketplace listings.

Add a soft, realistic product photography shadow beneath and slightly behind the product (contact shadow + gentle falloff) so the product feels grounded on the surface — professional studio look, not harsh.

CRITICAL REQUIREMENTS:
1. Do NOT alter, enhance, clean, repair, or modify the product itself in ANY way
2. Preserve every scratch, dirt mark, scuff, wear sign, and imperfection exactly as shown
3. The product must remain photographically identical to the input — same colours, same condition, same details
4. Only replace the scene with the soft light grey backing and add the subtle shadows described above
5. Centre the product in the frame with comfortable padding for e‑commerce
6. Ensure the entire product is visible in the frame
7. Keep the product sharp and true to the source

The goal is a clean listing hero with a true-to-life product presentation.`;

export interface DownloadedImage {
  base64: string;
  mimeType: string;
}

const EXT_FOR_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

/**
 * Download an image URL and return raw base64 + detected MIME (for OpenAI multipart).
 */
export async function downloadImageAsBase64(url: string): Promise<DownloadedImage | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BikeMarketplace/1.0)",
      },
    });

    if (!response.ok) {
      console.error(`[ECOMMERCE-HERO-AI] Download failed: HTTP ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.startsWith("image/")) {
      console.error(`[ECOMMERCE-HERO-AI] Invalid content type: ${contentType}`);
      return null;
    }

    const mimeType = contentType.split(";")[0].trim().toLowerCase();
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }

    return { base64: btoa(binary), mimeType };
  } catch (error) {
    console.error("[ECOMMERCE-HERO-AI] Download error:", error);
    return null;
  }
}

function mimeToBlobFilename(mimeType: string): { type: string; filename: string } {
  const ext = EXT_FOR_MIME[mimeType] || "png";
  const type = ext === "jpg" ? "image/jpeg" : mimeType.startsWith("image/") ? mimeType : "image/png";
  return { type, filename: `source.${ext}` };
}

async function remoteImageUrlToBase64(imageUrl: string): Promise<string | null> {
  const r = await fetch(imageUrl);
  if (!r.ok) return null;
  const buf = await r.arrayBuffer();
  const uint8Array = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.slice(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Run OpenAI image edits → PNG bytes as base64 (for Cloudinary data URI upload).
 */
export async function callOpenAIEcommerceHeroEdit(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  prompt: string = ECOMMERCE_HERO_PROMPT,
): Promise<string | null> {
  const binaryString = atob(imageBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { type: blobType, filename } = mimeToBlobFilename(mimeType);
  const blob = new Blob([bytes], { type: blobType });

  const formData = new FormData();
  formData.append("image", blob, filename);
  formData.append("prompt", prompt);
  formData.append("model", OPENAI_ECOMMERCE_IMAGE_MODEL);
  formData.append("size", "1024x1024");
  // quality drives latency hard on gpt-image-2 image edits:
  //   high ≈ 184 s, medium ≈ 68 s, low ≈ 29 s (measured 2026-05).
  // "low" still produces a clean studio-grade hero for product packshots and
  // is the only tier that comfortably fits the < 60 s budget.
  formData.append("quality", "low");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[ECOMMERCE-HERO-AI] OpenAI ${response.status}: ${errorText}`);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  if (!result.data?.[0]) {
    throw new Error("No image in OpenAI response");
  }

  const item = result.data[0] as { b64_json?: string; url?: string };

  if (item.b64_json) {
    return item.b64_json;
  }

  if (item.url) {
    const b64 = await remoteImageUrlToBase64(item.url);
    if (b64) return b64;
  }

  throw new Error("OpenAI returned no b64_json or readable url");
}
