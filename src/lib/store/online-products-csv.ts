/**
 * Shared helpers for online product CSV import and duplicate detection.
 */

export interface ExistingCatalogProduct {
  id: string;
  display_name: string | null;
  description: string | null;
  brand: string | null;
}

export interface DuplicateMatch {
  existingProductId: string;
  existingProductName: string;
}

function tokenize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Stable key for matching enriched or saved catalog products. */
export function catalogMatchKey(name: string, brand?: string | null): string {
  const n = tokenize(name || '');
  const b = tokenize(brand || '');
  if (!n && !b) return '';
  return `${b}::${n}`;
}

/** Fingerprint of raw CSV row values (order-independent). */
export function csvRowFingerprint(values: Record<string, string>): string {
  const parts = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => tokenize(value))
    .filter((part) => part.length > 0);
  return parts.join('|');
}

export function buildExistingCatalogIndex(existing: ExistingCatalogProduct[]) {
  const byCatalogKey = new Map<string, DuplicateMatch>();

  for (const product of existing) {
    const name = (product.display_name || product.description || '').trim();
    const brand = product.brand?.trim() || '';
    const match: DuplicateMatch = {
      existingProductId: product.id,
      existingProductName: name || 'Existing product',
    };

    const key = catalogMatchKey(name, brand);
    if (key && !byCatalogKey.has(key)) {
      byCatalogKey.set(key, match);
    }
  }

  return { byCatalogKey };
}

export function findDuplicateForProduct(
  name: string,
  brand: string | null | undefined,
  index: ReturnType<typeof buildExistingCatalogIndex>,
): DuplicateMatch | null {
  const key = catalogMatchKey(name, brand);
  if (!key) return null;
  return index.byCatalogKey.get(key) ?? null;
}

/** Match raw CSV row text against already-saved rows in the same import. */
export function findDuplicateRawRow(
  values: Record<string, string>,
  seenFingerprints: Map<string, DuplicateMatch>,
): DuplicateMatch | null {
  const fingerprint = csvRowFingerprint(values);
  if (!fingerprint) return null;
  return seenFingerprints.get(fingerprint) ?? null;
}
