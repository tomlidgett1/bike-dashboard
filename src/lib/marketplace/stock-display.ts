/** Default qoh when CSV / import did not supply stock on hand. */
export const DEFAULT_CATALOG_QOH = 9999;

export function formatStockOnHandLabel(
  qoh: number | null | undefined,
  listingType?: string | null,
): string | null {
  if (listingType === "private_listing") return null;

  const units = Math.floor(Number(qoh));
  if (!Number.isFinite(units) || units >= DEFAULT_CATALOG_QOH) return null;
  if (units <= 0) return "Out of stock";
  if (units === 1) return "1 in stock";
  return `${units} in stock`;
}
