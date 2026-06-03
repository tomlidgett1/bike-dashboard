type RotationRecommendation = {
  index?: number;
  rotate_degrees?: number;
  rotateDegrees?: number;
  confidence?: number;
};

const ROTATABLE_URL_KEYS = [
  "url",
  "cardUrl",
  "mobileCardUrl",
  "thumbnailUrl",
  "galleryUrl",
  "detailUrl",
] as const;

function normaliseRotationDegrees(value: unknown): 0 | 90 | 180 | 270 {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const degrees = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return degrees === 90 || degrees === 180 || degrees === 270 ? degrees : 0;
}

function stripExistingManualRotation(transformPath: string): string {
  return transformPath.replace(/(?:^|\/)a_(?:90|180|270)(?=\/)/g, "");
}

export function applyCloudinaryRotation(url: string | undefined, degrees: unknown): string | undefined {
  if (!url) return url;

  const rotation = normaliseRotationDegrees(degrees);
  if (!rotation || !url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) {
    return url;
  }

  const marker = "/image/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return url;

  const prefix = url.slice(0, markerIndex + marker.length);
  let rest = stripExistingManualRotation(url.slice(markerIndex + marker.length)).replace(/^\/+/, "");

  if (rest.startsWith("a_auto,")) {
    const slashIndex = rest.indexOf("/");
    if (slashIndex === -1) return `${prefix}a_auto/a_${rotation}/${rest.replace(/^a_auto,?/, "")}`;

    const firstTransform = rest.slice(0, slashIndex).replace(/^a_auto,?/, "");
    const remaining = rest.slice(slashIndex + 1);
    return firstTransform
      ? `${prefix}a_auto/a_${rotation}/${firstTransform}/${remaining}`
      : `${prefix}a_auto/a_${rotation}/${remaining}`;
  }

  if (rest.startsWith("a_auto/")) {
    rest = rest.slice("a_auto/".length);
  }

  return `${prefix}a_auto/a_${rotation}/${rest}`;
}

export function applyImageRotations<T extends object>(
  images: T[],
  rotations: RotationRecommendation[] | undefined | null,
  minConfidence = 80
): T[] {
  if (!Array.isArray(rotations) || rotations.length === 0) return images;

  const rotationByIndex = new Map<number, 90 | 180 | 270>();
  for (const recommendation of rotations) {
    const index = typeof recommendation.index === "number" ? recommendation.index : -1;
    const confidence = typeof recommendation.confidence === "number" ? recommendation.confidence : 100;
    const degrees = normaliseRotationDegrees(
      recommendation.rotate_degrees ?? recommendation.rotateDegrees
    );

    if (index >= 0 && degrees && confidence >= minConfidence) {
      rotationByIndex.set(index, degrees);
    }
  }

  if (rotationByIndex.size === 0) return images;

  return images.map((image, index) => {
    const degrees = rotationByIndex.get(index);
    if (!degrees) return image;

    const rotated = { ...(image as Record<string, unknown>) };
    for (const key of ROTATABLE_URL_KEYS) {
      const value = rotated[key];
      if (typeof value === "string") {
        rotated[key] = applyCloudinaryRotation(value, degrees);
      }
    }

    return rotated as T;
  });
}
