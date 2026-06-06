/**
 * Shared helpers for online product CSV import and duplicate detection.
 */

import { inferNameBrand, inferRowLabel } from '@/lib/store/online-products-csv-parse';

export interface ExistingCatalogProduct {
  id: string;
  display_name: string | null;
  description: string | null;
  brand: string | null;
  system_sku?: string | null;
  custom_sku?: string | null;
}

export interface DuplicateMatch {
  existingProductId: string;
  existingProductName: string;
}

export interface DuplicateReferenceValue {
  value: string;
  duplicateOfId: string | null;
  duplicateOfName: string;
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

/** Resolve a CSV cell by header name (exact match, then case-insensitive). */
export function valueForHeader(
  values: Record<string, string>,
  columnName: string | null | undefined,
): string {
  if (!columnName?.trim()) return '';
  const direct = values[columnName]?.trim();
  if (direct) return direct;

  const target = columnName.trim().toLowerCase();
  for (const [key, raw] of Object.entries(values)) {
    if (key.trim().toLowerCase() === target) {
      return raw?.trim() ?? '';
    }
  }
  return '';
}

/** Normalised key for a single CSV column value (duplicate reference). */
export function csvColumnValueKey(
  values: Record<string, string>,
  columnName: string | null | undefined,
): string {
  const cell = valueForHeader(values, columnName);
  if (!cell) return '';
  return tokenize(cell);
}

/** Duplicate key for a row — selected column when set, otherwise full-row fingerprint. */
export function duplicateKeyForRow(
  values: Record<string, string>,
  duplicateColumn: string | null | undefined,
): string {
  if (duplicateColumn?.trim()) {
    return csvColumnValueKey(values, duplicateColumn);
  }
  return csvRowFingerprint(values);
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

/** Index catalogue products and prior CSV reference values for column-based matching. */
export function buildCatalogValueIndex(
  existing: ExistingCatalogProduct[],
  priorReferences: DuplicateReferenceValue[] = [],
) {
  const byValueKey = new Map<string, DuplicateMatch>();

  for (const product of existing) {
    const name = (product.display_name || product.description || '').trim();
    const match: DuplicateMatch = {
      existingProductId: product.id,
      existingProductName: name || 'Existing product',
    };

    const candidates = [
      product.system_sku,
      product.custom_sku,
      product.display_name,
      product.description,
      name,
      catalogMatchKey(name, product.brand),
    ];

    for (const raw of candidates) {
      const key = tokenize((raw ?? '').trim());
      if (key && !byValueKey.has(key)) {
        byValueKey.set(key, match);
      }
    }
  }

  for (const reference of priorReferences) {
    const key = tokenize(reference.value);
    if (key && !byValueKey.has(key)) {
      byValueKey.set(key, {
        existingProductId: reference.duplicateOfId ?? '',
        existingProductName: reference.duplicateOfName,
      });
    }
  }

  return { byValueKey };
}

export function findDuplicateForColumnValue(
  value: string,
  index: ReturnType<typeof buildCatalogValueIndex>,
): DuplicateMatch | null {
  const key = tokenize(value.trim());
  if (!key) return null;
  return index.byValueKey.get(key) ?? null;
}

export interface CsvRowDuplicateInput {
  values: Record<string, string>;
  headers: string[];
  rowIndex: number;
  label: string;
  name: string;
  brand: string;
  duplicateColumn: string | null;
  catalogIndex: ReturnType<typeof buildExistingCatalogIndex>;
  catalogValueIndex: ReturnType<typeof buildCatalogValueIndex>;
  seenKeys: Map<string, { rowIndex: number; label: string }>;
}

export function detectCsvRowDuplicate(input: CsvRowDuplicateInput): {
  status: 'pending' | 'duplicate';
  duplicateOfId: string | null;
  duplicateOfName: string | null;
} {
  const {
    values,
    name,
    brand,
    rowIndex,
    label,
    duplicateColumn,
    catalogIndex,
    catalogValueIndex,
    seenKeys,
  } = input;

  const usesColumn = Boolean(duplicateColumn?.trim());
  const columnValue = usesColumn ? valueForHeader(values, duplicateColumn) : '';

  let catalogDup: DuplicateMatch | null = null;
  if (usesColumn && columnValue) {
    catalogDup = findDuplicateForColumnValue(columnValue, catalogValueIndex);
  } else if (!usesColumn && name) {
    catalogDup = findDuplicateForProduct(name, brand, catalogIndex);
  }

  const rowKey = duplicateKeyForRow(values, duplicateColumn);
  const fileDup = rowKey ? seenKeys.get(rowKey) : undefined;

  if (catalogDup) {
    return {
      status: 'duplicate',
      duplicateOfId: catalogDup.existingProductId || null,
      duplicateOfName: catalogDup.existingProductName,
    };
  }

  if (fileDup) {
    return {
      status: 'duplicate',
      duplicateOfId: null,
      duplicateOfName: `Duplicate of row ${fileDup.rowIndex} (${fileDup.label})`,
    };
  }

  if (rowKey) {
    seenKeys.set(rowKey, { rowIndex, label });
  }

  if (!usesColumn) {
    const catalogKey = catalogMatchKey(name, brand);
    if (catalogKey) {
      const priorCatalog = seenKeys.get(`catalog:${catalogKey}`);
      if (priorCatalog) {
        return {
          status: 'duplicate',
          duplicateOfId: null,
          duplicateOfName: `Duplicate of row ${priorCatalog.rowIndex} (${priorCatalog.label})`,
        };
      }
      seenKeys.set(`catalog:${catalogKey}`, { rowIndex, label: name || label });
    }
  }

  return { status: 'pending', duplicateOfId: null, duplicateOfName: null };
}

export interface ImportRowForDuplicateCheck {
  rowIndex: number;
  values: Record<string, string>;
}

export interface ImportRowDuplicateResult {
  rowIndex: number;
  status: 'pending' | 'duplicate';
  duplicateOfId: string | null;
  duplicateOfName: string | null;
  isSelected: boolean;
}

/** Scan all import rows in order and assign pending vs duplicate status. */
export function computeImportRowDuplicates(options: {
  headers: string[];
  duplicateColumn: string | null;
  rows: ImportRowForDuplicateCheck[];
  existingCatalog: ExistingCatalogProduct[];
  priorReferences?: DuplicateReferenceValue[];
}): ImportRowDuplicateResult[] {
  const { headers, duplicateColumn, rows, existingCatalog, priorReferences = [] } = options;
  const catalogIndex = buildExistingCatalogIndex(existingCatalog);
  const catalogValueIndex = buildCatalogValueIndex(existingCatalog, priorReferences);
  const seenKeys = new Map<string, { rowIndex: number; label: string }>();

  return rows.map((row) => {
    const label = inferRowLabel(row.values, headers);
    const { name, brand } = inferNameBrand(row.values, headers);
    const { status, duplicateOfId, duplicateOfName } = detectCsvRowDuplicate({
      values: row.values,
      headers,
      rowIndex: row.rowIndex,
      label,
      name,
      brand,
      duplicateColumn,
      catalogIndex,
      catalogValueIndex,
      seenKeys,
    });

    return {
      rowIndex: row.rowIndex,
      status,
      duplicateOfId,
      duplicateOfName,
      isSelected: status === 'pending',
    };
  });
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
