const ROTATABLE_URL_KEYS = [
  "url",
  "cardUrl",
  "mobileCardUrl",
  "thumbnailUrl",
  "galleryUrl",
  "detailUrl",
] as const;

export function normaliseRotationDegrees(value: unknown): 0 | 90 | 180 | 270 {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  const degrees = ((Math.round(value / 90) * 90) % 360 + 360) % 360;
  return degrees === 90 || degrees === 180 || degrees === 270 ? degrees : 0;
}

function getExistingManualRotation(transformPath: string): 0 | 90 | 180 | 270 {
  const match = /(?:^|\/)a_(90|180|270)(?=\/)/.exec(transformPath);
  return match ? normaliseRotationDegrees(Number(match[1])) : 0;
}

function stripExistingManualRotation(transformPath: string): string {
  return transformPath.replace(/(?:^|\/)a_(?:90|180|270)(?=\/)/g, "");
}

export function getCloudinaryRotation(url: string | undefined): 0 | 90 | 180 | 270 {
  if (!url || !url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) {
    return 0;
  }

  const marker = "/image/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return 0;

  return getExistingManualRotation(url.slice(markerIndex + marker.length));
}

export function applyCloudinaryRotation(url: string | undefined, degrees: unknown): string | undefined {
  if (!url) return url;

  const rotation = normaliseRotationDegrees(degrees);
  if (!url.includes("res.cloudinary.com") || !url.includes("/image/upload/")) {
    return url;
  }

  const marker = "/image/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return url;

  const prefix = url.slice(0, markerIndex + marker.length);
  let rest = stripExistingManualRotation(url.slice(markerIndex + marker.length)).replace(/^\/+/, "");

  if (!rotation) return `${prefix}${rest}`;

  // Strip legacy a_auto segments from older delivery URLs.
  if (rest.startsWith("a_auto,")) {
    rest = rest.replace(/^a_auto,?\/?/, "");
  } else if (rest.startsWith("a_auto/")) {
    rest = rest.slice("a_auto/".length);
  }

  return `${prefix}a_${rotation}/${rest}`;
}

export function rotateCloudinaryUrlClockwise(url: string | undefined): string | undefined {
  const currentRotation = getCloudinaryRotation(url);
  const nextRotation = normaliseRotationDegrees(currentRotation + 90);
  return applyCloudinaryRotation(url, nextRotation);
}

export function rotateImageUrlsClockwise<T extends object>(image: T): T {
  const rotated = { ...(image as Record<string, unknown>) };

  for (const key of ROTATABLE_URL_KEYS) {
    const value = rotated[key];
    if (typeof value === "string") {
      rotated[key] = rotateCloudinaryUrlClockwise(value);
    }
  }

  return rotated as T;
}
