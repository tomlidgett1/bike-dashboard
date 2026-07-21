/**
 * Instagram publish formats (Meta Content Publishing guidance, 2026).
 *
 * Feed:
 *  - Square  1:1  → 1080 × 1080
 *  - Portrait 4:5 → 1080 × 1350 (tallest supported feed ratio)
 * Stories / Reels:
 *  - 9:16 → 1080 × 1920
 *
 * Note: 9:16 is for Stories (and Reels), not feed posts.
 */

export type InstagramDestination = "post" | "story";
export type InstagramPostAspect = "square" | "portrait";

export type InstagramFormatId =
  | "post_square"
  | "post_portrait"
  | "story";

export type InstagramFormat = {
  id: InstagramFormatId;
  destination: InstagramDestination;
  aspect: InstagramPostAspect | "story";
  label: string;
  shortLabel: string;
  ratioLabel: string;
  /** Final JPEG pixels for Instagram. */
  width: number;
  height: number;
  /**
   * OpenAI gpt-image-2 size (edges must be multiples of 16).
   * We then sharp-resize to the exact Instagram pixels above.
   */
  openaiSize: `${number}x${number}`;
  /** Composio / Graph media_type; omit for feed IMAGE posts. */
  mediaType: "STORIES" | null;
  promptHint: string;
};

export const INSTAGRAM_FORMATS: Record<InstagramFormatId, InstagramFormat> = {
  post_square: {
    id: "post_square",
    destination: "post",
    aspect: "square",
    label: "Square post",
    shortLabel: "Square",
    ratioLabel: "1:1",
    width: 1080,
    height: 1080,
    openaiSize: "1024x1024",
    mediaType: null,
    promptHint:
      "Square 1:1 Instagram feed post. Compose for a centred subject with balanced margins.",
  },
  post_portrait: {
    id: "post_portrait",
    destination: "post",
    aspect: "portrait",
    label: "Portrait post",
    shortLabel: "Portrait",
    ratioLabel: "4:5",
    width: 1080,
    height: 1350,
    // gpt-image sizes must be supported by the API (then we sharp-resize to 4:5).
    openaiSize: "1024x1536",
    mediaType: null,
    promptHint:
      "Vertical 4:5 Instagram feed post (1080x1350). Fill the taller frame; keep key subject in the centre-upper third.",
  },
  story: {
    id: "story",
    destination: "story",
    aspect: "story",
    label: "Story",
    shortLabel: "Story",
    ratioLabel: "9:16",
    width: 1080,
    height: 1920,
    // Closest supported portrait size; we sharp-resize to 9:16 afterwards.
    openaiSize: "1024x1536",
    mediaType: "STORIES",
    promptHint:
      "Full-screen Instagram Story 9:16 (1080x1920). Keep important content inside a centre safe zone (avoid top ~14% and bottom ~20% UI overlays).",
  },
};

export function resolveInstagramFormat(params: {
  destination: InstagramDestination;
  aspect?: InstagramPostAspect | null;
}): InstagramFormat {
  if (params.destination === "story") {
    return INSTAGRAM_FORMATS.story;
  }
  if (params.aspect === "portrait") {
    return INSTAGRAM_FORMATS.post_portrait;
  }
  return INSTAGRAM_FORMATS.post_square;
}

export function isInstagramDestination(
  value: unknown,
): value is InstagramDestination {
  return value === "post" || value === "story";
}

export function isInstagramPostAspect(
  value: unknown,
): value is InstagramPostAspect {
  return value === "square" || value === "portrait";
}
