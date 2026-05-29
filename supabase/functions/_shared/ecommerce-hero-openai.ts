/**
 * OpenAI Images Edit — ecommerce hero (flat white background + soft grey contact shadow).
 * Uses gpt-image-2 on /v1/images/edits (newest OpenAI image model).
 */

export const OPENAI_ECOMMERCE_IMAGE_MODEL = "gpt-image-2";

/** Prompt: flat single-colour backdrop + consistent framing; preserve product pixels/condition. */
export const ECOMMERCE_HERO_PROMPT = `Place this exact product photograph on a single, perfectly FLAT, uniform PURE WHITE background (clean bright white, #FFFFFF). Create a square 1:1 hero product shot for marketplace listings.

BACKGROUND — it must be ONE seamless white:
- The background must be a SINGLE flat white filling the ENTIRE frame, edge to edge and corner to corner.
- Do NOT create a floor and a wall, a horizon line, a tabletop, a platform, or any visible surface or scene.
- No gradient, no vignette, no darkening or greying around the product, no second tone — the whole background is one even pure white.

FRAMING — must be consistent for EVERY product:
- Centre the product in the frame.
- Scale the product so it occupies about 80% of the frame's height, leaving roughly equal empty padding above and below it (about 10% margin at the top and 10% at the bottom).
- Keep this sizing consistent so different products are all presented at the same scale.
- Ensure the entire product is visible with comfortable, even margins on all sides.

SHADOW:
- Add only a small, soft, neutral GREY contact shadow directly beneath the product so it feels grounded on the white background. Keep it subtle and tight to the product — do NOT render it as a floor or surface plane.

REMOVE EVERYTHING THAT IS NOT THE PRODUCT:
- The final image must contain ONLY the physical product on the white background — nothing else.
- Remove any graphics that were overlaid on top of the source photo: text boxes, captions, watermarks, price tags, promotional banners, "sale"/"new" badges, stickers, separate logos, borders, frames, arrows, or call-out boxes. Erase them completely and fill that area with the clean white background.
- DISTINCTION — keep the product's own design: do NOT remove text, labels, branding, or artwork that is physically printed ON the product or its packaging (for example a wrapper's flavour name or a box's printed graphics). That printing IS the product and must be preserved exactly as shown.

CRITICAL — do NOT change the product:
1. Do NOT alter, enhance, clean, repair, or modify the product itself in ANY way.
2. Preserve every scratch, dirt mark, scuff, wear sign, and imperfection exactly as shown.
3. The product must remain photographically identical to the input — same colours, same condition, same details, same sharpness.
4. Only replace the scene with the flat white background, remove the non-product overlays described above, and add the subtle grey contact shadow described above.

The goal is a clean, consistent listing hero: the same product, presented at a uniform size on one seamless flat white background.`;

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
