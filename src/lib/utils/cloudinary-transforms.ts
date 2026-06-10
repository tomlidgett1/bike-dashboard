import { normaliseRotationDegrees } from "@/lib/utils/cloudinary-rotation";

// f_auto lets Cloudinary negotiate AVIF/WebP/JPEG per the browser's Accept header
// (AVIF is ~20-30% smaller than WebP), so we never hardcode a single format.
// No a_auto — EXIF auto-orient was rotating some approved product shots incorrectly.
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

// ── Studio-hero normalisation ────────────────────────────────────────────────
//
// The gpt-image-2 prompt produces a FLAT pure-white background (measured ~#FEFEFE)
// with a soft grey contact shadow and the product at ~80% height, but a prompt
// can't reliably hit an exact size. So we enforce a hard-and-fast rule
// deterministically after the model runs:
//
//   1. e_trim:5         — trim the flat white border to the product's true bounds.
//                          Tolerance is deliberately LOW: against a near-white
//                          backdrop a high tolerance would eat light/near-white
//                          product edges, so 5 removes only the flat ~#FEFEFE
//                          border and leaves the product intact.
//   2. c_fit,h_N,w_N   — scale so the product's LONGER side = N px (HERO_PRODUCT_HEIGHT_PCT
//                          of 1024), preserving aspect ratio. Portrait/square shots
//                          land at target height; wide products (e.g. whole bikes)
//                          bound by width instead, so nothing overflows.
//   3. c_pad,1024²,b_rgb:ffffff — pad back to a perfect square with pure white,
//                          which matches the model's flat output to within ~1
//                          level, so the join is invisible.
//
// Because step 1 fully removes the model's background and step 3 fills ALL
// surrounding space with one fixed white, the final image has exactly ONE
// background tone everywhere. The fixed colour also keeps every product's
// backdrop identical across the grid. The grey contact shadow sits inside the
// product's bounding box (beneath it, not at the frame edge), so the trim
// never touches it.
//
// Adjust HERO_PRODUCT_HEIGHT_PCT to change how much of the frame the product
// occupies. At 0.85 the product fills 85% of the height, leaving ~7.5% white
// breathing room on both top and bottom.
export const HERO_PRODUCT_HEIGHT_PCT = 0.85;
const HERO_FIT_PX = Math.round(1024 * HERO_PRODUCT_HEIGHT_PCT); // 870
// c_lpad = "limited pad": centres the product on a white canvas WITHOUT
// upscaling. c_pad (used previously) would scale-up portrait images so
// their height hit 1024px, eliminating the intended top/bottom white gap.
// c_lpad only adds padding, so every product stays at ≤HERO_FIT_PX on its
// longest side with symmetric white breathing room on all four sides.
export const HERO_NORMALIZE_TRANSFORM = `e_trim:5/c_fit,h_${HERO_FIT_PX},w_${HERO_FIT_PX}/c_lpad,h_1024,w_1024,b_rgb:ffffff`;

// ── Compound public_id for hero images ─────────────────────────────────────────
//
// Instead of baking a new Cloudinary asset (which needs API creds), we store
// the normalisation transform as a prefix of the public_id:
//
//   e_trim:5/c_fit,h_870,w_870/c_pad,h_1024,w_1024,b_rgb:ffffff/<rawPublicId>
//
// buildCloudinaryImageUrl and cloudinaryCardLoader detect this prefix and
// inject the normalisation BEFORE any slot transform in the delivery URL, so
// Cloudinary applies: trim → fit → pad → slot-crop (in that order).
//
// No Cloudinary upload credentials are needed — everything happens on-the-fly.
//
// DETECTION: we use a regex rather than an exact string so that images approved
// under any previous HERO_PRODUCT_HEIGHT_PCT are still recognised. The raw asset
// id is extracted from the compound PID and the CURRENT HERO_NORMALIZE_TRANSFORM
// is always applied — so all hero images share the same product height regardless
// of when they were approved. Changing HERO_PRODUCT_HEIGHT_PCT instantly re-tunes
// every hero image across the whole marketplace.
// Matches compound PIDs created under any HERO_NORMALIZE_TRANSFORM version —
// both the old c_pad (upscales portrait images) and the current c_lpad
// (limited pad, no upscale). toCurrentHeroPublicId re-wraps old c_pad PIDs
// with the current c_lpad transform automatically.
const HERO_COMPOUND_RE =
  /^(e_trim:\d+\/c_fit,h_\d+,w_\d+\/c_l?pad,h_\d+,w_\d+,b_rgb:[0-9a-fA-F]+)\/(.+)/;
const MANUAL_ROTATION_RE = /^(a_(?:90|180|270))\/(.+)/;

function isCloudinaryTransformSegment(part: string): boolean {
  return /^(a_|w_|h_|c_|ar_|g_|q_|f_|b_|e_|l_|o_|dpr_|fl_|r_|x_|y_|z_|t_|if_|pg_|so_|sp_|u_|vc_|vs_)/.test(part);
}

function extractManualRotationTransform(part: string): "a_90" | "a_180" | "a_270" | null {
  const match = /(?:^|,)a_(90|180|270)(?:,|$)/.exec(part);
  if (!match) return null;
  return `a_${match[1]}` as "a_90" | "a_180" | "a_270";
}

/** @internal Split a compound hero public_id into its transform prefix + raw id. */
function parseHeroCompoundId(
  publicId: string
): { normalizeTransform: string; rawId: string } | null {
  const m = HERO_COMPOUND_RE.exec(publicId);
  if (!m) return null;
  return { normalizeTransform: m[1], rawId: m[2] };
}

/** @internal Split a public_id prefixed with a manual display rotation. */
function parseManualRotationPublicId(
  publicId: string
): { rotationTransform: "a_90" | "a_180" | "a_270"; rawId: string } | null {
  const match = MANUAL_ROTATION_RE.exec(publicId);
  if (!match) return null;
  return {
    rotationTransform: match[1] as "a_90" | "a_180" | "a_270",
    rawId: match[2],
  };
}

function parseTransformPublicId(publicId: string): { preTransforms: string[]; rawId: string } {
  const preTransforms: string[] = [];
  let rawId = publicId;

  const rotation = parseManualRotationPublicId(rawId);
  if (rotation) {
    preTransforms.push(rotation.rotationTransform);
    rawId = rotation.rawId;
  }

  const hero = parseHeroCompoundId(rawId);
  if (hero) {
    preTransforms.push(hero.normalizeTransform);
    rawId = hero.rawId;
  }

  return { preTransforms, rawId };
}

/** Returns true if the public_id is a compound hero id (any version). */
export function isHeroCompoundId(publicId: string | null | undefined): boolean {
  return !!publicId && HERO_COMPOUND_RE.test(publicId);
}

/**
 * Wrap a raw model-output public_id into a compound hero public_id that
 * carries the current normalisation transform prefix. Idempotent — if the id
 * is already compound (any version) it is returned unchanged.
 */
export function buildHeroPublicId(rawPublicId: string | null | undefined): string | null {
  if (!rawPublicId) return null;
  if (isHeroCompoundId(rawPublicId)) return rawPublicId;
  return `${HERO_NORMALIZE_TRANSFORM}/${rawPublicId}`;
}

/**
 * Normalise any hero public_id to use the CURRENT HERO_NORMALIZE_TRANSFORM.
 *
 * - Compound PIDs of any version (h_973, h_870, …) → extract rawId, re-wrap
 *   with the current transform so all hero images share the same product height
 *   regardless of when they were approved.
 * - Raw PIDs where imageSource === 'openai_studio_hero' → wrap with current
 *   transform (handles the pre-compound-PID approval era).
 * - All other PIDs → returned unchanged.
 *
 * Call this at the API / server level before passing cloudinary_public_id to
 * ProductCard. The URL builders (buildCloudinaryImageUrl, cloudinaryCardLoader)
 * then trust whatever transform is stored in the compound PID.
 */
export function toCurrentHeroPublicId(
  publicId: string | null | undefined,
  imageSource?: string | null
): string | null {
  if (!publicId) return null;
  const rotation = parseManualRotationPublicId(publicId);
  if (rotation) {
    const currentRawId = toCurrentHeroPublicId(rotation.rawId, imageSource);
    return currentRawId ? `${rotation.rotationTransform}/${currentRawId}` : publicId;
  }
  const heroMatch = HERO_COMPOUND_RE.exec(publicId);
  if (heroMatch) {
    // Any compound PID (any h_N) → re-wrap with current transform
    return `${HERO_NORMALIZE_TRANSFORM}/${heroMatch[2]}`;
  }
  if (imageSource === 'openai_studio_hero') {
    // Raw PID from pre-compound era → wrap with current transform
    return `${HERO_NORMALIZE_TRANSFORM}/${publicId}`;
  }
  return publicId;
}

// Build the hero delivery URL from a raw Cloudinary URL using the CURRENT
// normalisation setting (used by the admin panel preview).
export function buildNormalizedHeroUrl(
  url: string | null | undefined,
  cloudName?: string
): string | null {
  const publicId = extractCloudinaryPublicId(url);
  const cn = resolveCloudName(cloudName);
  if (!publicId || !cn) return null;
  return `https://res.cloudinary.com/${cn}/image/upload/${HERO_NORMALIZE_TRANSFORM}/${publicId}`;
}

export function extractCloudinaryPublicId(url: string | null | undefined): string | null {
  if (!url || !url.includes("res.cloudinary.com")) return null;

  try {
    const parsed = new URL(url);
    const uploadIndex = parsed.pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    const rest = parsed.pathname.slice(uploadIndex + "/upload/".length);

    const parts = rest.split("/").filter(Boolean);
    const publicParts: string[] = [];
    let manualRotation: "a_90" | "a_180" | "a_270" | null = null;

    for (const part of parts) {
      // Cloudinary version segments can appear after delivery transforms:
      // /upload/a_auto/a_90/v123/public_id.jpg
      if (publicParts.length === 0 && /^v\d+$/.test(part)) continue;

      const rotation = extractManualRotationTransform(part);
      if (rotation) manualRotation = rotation;

      if (isCloudinaryTransformSegment(part)) continue;
      publicParts.push(part);
    }

    if (publicParts.length === 0) return null;

    const lastIndex = publicParts.length - 1;
    publicParts[lastIndex] = publicParts[lastIndex].replace(/\.(jpg|jpeg|png|gif|webp|avif)$/i, "");

    const publicId = publicParts.join("/");
    return manualRotation ? `${manualRotation}/${publicId}` : publicId;
  } catch {
    return null;
  }
}

// Trim to guard against env vars with trailing newlines (common in CI/CD and .env files)
function resolveCloudName(
  override?: string
): string | undefined {
  const raw = override ?? (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME);
  return raw?.trim() || undefined;
}

/** Rotate a stored public_id clockwise (updates the a_90/a_180/a_270 prefix). */
export function rotateCloudinaryPublicIdClockwise(
  publicId: string | null | undefined
): string | null {
  if (!publicId) return null;

  const parsed = parseTransformPublicId(publicId);
  const rotIdx = parsed.preTransforms.findIndex((t) => /^a_(90|180|270)$/.test(t));
  const currentDeg =
    rotIdx >= 0 ? normaliseRotationDegrees(Number(parsed.preTransforms[rotIdx].slice(2))) : 0;
  const nextDeg = normaliseRotationDegrees(currentDeg + 90);
  const otherPre =
    rotIdx >= 0 ? parsed.preTransforms.filter((_, i) => i !== rotIdx) : [...parsed.preTransforms];
  const nextPre = nextDeg ? [`a_${nextDeg}`, ...otherPre] : otherPre;

  if (nextPre.length === 0) return parsed.rawId;
  return `${nextPre.join("/")}/${parsed.rawId}`;
}

export function buildCloudinaryImageUrl(
  publicId: string | null | undefined,
  slot: CloudinaryImageSlot,
  cloudName?: string
): string | null {
  const cn = resolveCloudName(cloudName);
  if (!publicId || !cn) return null;

  const parsed = parseTransformPublicId(publicId);
  const slotTransform = CLOUDINARY_IMAGE_TRANSFORMS[slot];
  const transforms = [...parsed.preTransforms, slotTransform].join("/");

  return `https://res.cloudinary.com/${cn}/image/upload/${transforms}/${parsed.rawId}`;
}

export function buildCloudinaryVariantUrls(
  publicId: string | null | undefined,
  cloudName?: string
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
  const cloudName = resolveCloudName();

  const parsed = parseTransformPublicId(src);
  const transforms = [
    ...parsed.preTransforms,
    `c_fill,g_center,ar_1:1,w_${width},q_auto,f_auto`,
  ].join("/");

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transforms}/${parsed.rawId}`;
}
