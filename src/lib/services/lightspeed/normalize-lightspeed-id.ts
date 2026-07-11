/**
 * Lightspeed uses "0" for unset foreign keys. Treat those as absent.
 */
export function normalizeLightspeedId(value: unknown): string | null {
  const cleaned = String(value ?? "").trim();
  if (!cleaned || cleaned === "0") return null;
  return cleaned;
}

export function hasLightspeedId(value: unknown): boolean {
  return normalizeLightspeedId(value) != null;
}
