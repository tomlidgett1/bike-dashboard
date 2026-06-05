/**
 * CSV parsing for online product imports (no row cap).
 */

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_DATA_ROWS = 2000;

export interface ParsedCsvRow {
  rowIndex: number;
  values: Record<string, string>;
}

export function isCsvFile(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.csv') ||
    file.type === 'text/csv' ||
    file.type === 'application/csv' ||
    file.type === 'application/vnd.ms-excel'
  );
}

function detectDelimiter(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiters = [',', ';', '\t'];
  return delimiters
    .map((delimiter) => ({
      delimiter,
      count: [...firstLine].filter((char) => char === delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

export function parseCsv(text: string) {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows
    .map((cells) => cells.map((value) => value.trim()))
    .filter((cells) => cells.some((value) => value.length > 0));
}

function makeUniqueHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((raw, index) => {
    const base = (raw || `Column ${index + 1}`).replace(/^\uFEFF/, '').trim() || `Column ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base} ${count + 1}`;
  });
}

function truncateCell(value: string) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > 500 ? `${normalized.slice(0, 497)}...` : normalized;
}

/** Column names that would be used if this row were the header. */
export function headersAtRow(parsedRows: string[][], headerRowIndex: number) {
  if (headerRowIndex < 0 || headerRowIndex >= parsedRows.length) {
    throw new Error('Header row is out of range');
  }
  return makeUniqueHeaders(parsedRows[headerRowIndex] ?? []);
}

export function csvRowsToObjects(parsedRows: string[][], headerRowIndex = 0) {
  if (headerRowIndex < 0 || headerRowIndex >= parsedRows.length) {
    throw new Error('Header row is out of range');
  }

  const dataRows = parsedRows.slice(headerRowIndex + 1);
  const dataRowCount = dataRows.length;

  if (dataRowCount === 0) {
    throw new Error('CSV must include at least one product row below the header row');
  }

  if (dataRowCount > CSV_MAX_DATA_ROWS) {
    throw new Error(`CSV has ${dataRowCount} data rows. Maximum is ${CSV_MAX_DATA_ROWS} per file.`);
  }

  const headers = makeUniqueHeaders(parsedRows[headerRowIndex] ?? []);
  const rows: ParsedCsvRow[] = dataRows.map((cells, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      values[header] = truncateCell(cells[columnIndex] ?? '');
    });
    return { rowIndex: headerRowIndex + index + 2, values };
  });

  return {
    headers,
    rows: rows.filter((row) => Object.values(row.values).some((value) => value.length > 0)),
    totalDataRows: dataRowCount,
    headerRowIndex,
  };
}

const NAME_HEADER = /^(name|title|product|item|sku|model|description)/i;
const BRAND_HEADER = /brand|manufacturer|make/i;
const PRICE_HEADER = /price|rrp|cost|amount/i;
const SOH_HEADER =
  /^(soh|stock|qoh|qty|quantity|on hand|on-hand|stock on hand|stock_on_hand|available|avail)$/i;
const SOH_HEADER_LOOSE = /soh|stock on hand|on hand|quantity on hand|qty on hand/i;

const SOH_EXACT_NORMALISED = new Set([
  'soh',
  'stock',
  'qoh',
  'qty',
  'quantity',
  'on hand',
  'onhand',
  'stock on hand',
  'available',
  'avail',
  'inventory',
  'in stock',
  'stock qty',
  'stock level',
  'stock count',
  'units',
  'unit',
  'count',
  'oh',
  'qty on hand',
  'quantity on hand',
  'quantity available',
  'avail qty',
  'available qty',
  'on hand qty',
  'current stock',
  'qty in stock',
  'quantity in stock',
  'items in stock',
  'units available',
  'available stock',
  'stock available',
  'qty available',
  'quantity available',
  'stock on hand qty',
  'inventory qty',
  'inventory quantity',
]);

function normaliseSohHeader(header: string) {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[#]+/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseStockNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Whole numbers with optional thousands separators (e.g. 1,234)
  const integerish = trimmed.replace(/[^0-9,.\-]/g, '');
  if (/^-?\d{1,3}(,\d{3})+$/.test(integerish)) {
    const parsed = Number.parseInt(integerish.replace(/,/g, ''), 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }

  const cleaned = trimmed.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

/** True when a header name likely refers to stock on hand (not price, SKU, etc.). */
export function headerLooksLikeSohColumn(header: string) {
  const trimmed = header.trim();
  if (!trimmed) return false;

  if (SOH_HEADER.test(trimmed) || SOH_HEADER_LOOSE.test(trimmed)) {
    return true;
  }

  const normalised = normaliseSohHeader(trimmed);
  if (SOH_EXACT_NORMALISED.has(normalised)) {
    return true;
  }

  if (/price|cost|rrp|amount|margin|value|sell|retail|wholesale|msrp|tax/.test(normalised)) {
    return false;
  }

  if (
    /sku|barcode|item code|product code|stock code|stock number|stock keeping/.test(normalised) &&
    !/\b(soh|qoh|stock qty|stock level|inventory)\b/.test(normalised)
  ) {
    return false;
  }

  if (/\b(soh|qoh)\b/.test(normalised)) return true;
  if (/\b(inventory|in stock)\b/.test(normalised)) return true;
  if (/\b(stock|inventory)\b/.test(normalised)) return true;
  if (/\bon hand\b/.test(normalised)) return true;
  if (/^(qty|quantity)(\b|$)/.test(normalised) || /(\b|^)(qty|quantity)$/.test(normalised)) {
    return true;
  }

  return false;
}

/** Pick the best default SOH column from parsed headers (for the import dialog). */
export function suggestSohColumn(headers: string[]): string | null {
  for (const header of headers) {
    if (headerLooksLikeSohColumn(header)) return header;
  }
  return null;
}

const SEARCH_HEADER_EXACT =
  /^(sku|mpn|upc|ean|gtin|barcode|oem|part|item code|product code|stock code|catalogue no|catalog no|model no|article no|article)$/i;
const SEARCH_HEADER_LOOSE =
  /sku|mpn|upc|ean|gtin|barcode|oem|part\s*#|part\s*no|item\s*code|product\s*code|stock\s*code|catalog(?:ue)?\s*no|model\s*no|article\s*no|article\s*number|manufacturer\s*part/i;

function normaliseSearchHeader(header: string) {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[#]+/g, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a header likely holds a SKU / MPN / part number for image search. */
export function headerLooksLikeSearchColumn(header: string) {
  const trimmed = header.trim();
  if (!trimmed) return false;
  if (headerLooksLikeSohColumn(header)) return false;

  if (SEARCH_HEADER_EXACT.test(trimmed) || SEARCH_HEADER_LOOSE.test(trimmed)) {
    return true;
  }

  const normalised = normaliseSearchHeader(trimmed);
  if (/price|cost|rrp|amount|margin|description|title|name|brand|category/.test(normalised)) {
    return false;
  }
  if (/\b(sku|mpn|upc|ean|gtin|barcode|oem)\b/.test(normalised)) return true;
  if (/\bpart\s*(number|no|#|code)\b/.test(normalised)) return true;
  if (/\b(item|product|stock|catalog(?:ue)?)\s*(code|number|no)\b/.test(normalised)) {
    return true;
  }

  return false;
}

/** Pick the best default part-number / search column from parsed headers. */
export function suggestSearchColumn(headers: string[]): string | null {
  for (const header of headers) {
    if (headerLooksLikeSearchColumn(header)) return header;
  }
  return null;
}

export function valueFromColumn(
  values: Record<string, string>,
  columnName: string | null | undefined,
) {
  if (!columnName?.trim()) return null;
  const cell = values[columnName]?.trim();
  return cell || null;
}

/** Sample value from the first data row beneath the header (for import dialog previews). */
export function sampleValueFromColumn(
  parsedRows: string[][],
  headerRowIndex: number,
  columnName: string | null | undefined,
) {
  if (!columnName?.trim() || headerRowIndex < 0 || headerRowIndex >= parsedRows.length) {
    return null;
  }
  const headers = headersAtRow(parsedRows, headerRowIndex);
  const colIndex = headers.indexOf(columnName);
  if (colIndex < 0) return null;
  const dataRow = parsedRows[headerRowIndex + 1];
  if (!dataRow) return null;
  const cell = (dataRow[colIndex] ?? '').trim();
  return cell || null;
}

/** Build a Serper query for CSV-sourced products (no forced cycling context by default). */
export function buildCsvSerperSearchQuery(options: {
  searchColumnValue: string | null;
  brand?: string;
  name?: string;
  subcategory?: string;
  bicycleContext?: boolean;
}) {
  const { searchColumnValue, brand, name, subcategory, bicycleContext = false } = options;

  if (searchColumnValue) {
    return [searchColumnValue, brand, name].filter(Boolean).join(' ');
  }

  const parts = [brand, name, subcategory].filter(Boolean);
  if (bicycleContext) {
    parts.push('cycling product image');
  } else if (parts.length > 0) {
    parts.push('product image');
  }
  return parts.join(' ');
}

/** Read SOH from an explicitly chosen column name. */
export function parseSohFromColumn(
  values: Record<string, string>,
  columnName: string | null | undefined,
) {
  if (!columnName?.trim()) return null;
  const cell = values[columnName]?.trim();
  if (!cell) return null;
  return parseStockNumber(cell);
}

/** Read stock on hand from a CSV row when a matching column exists. */
export function parseSohFromValues(
  values: Record<string, string>,
  headers: string[],
  preferredColumn?: string | null,
) {
  const fromPreferred = parseSohFromColumn(values, preferredColumn);
  if (fromPreferred != null) return fromPreferred;
  const orderedHeaders = headers.length > 0 ? headers : Object.keys(values);

  for (const header of orderedHeaders) {
    const cell = values[header]?.trim();
    if (cell === undefined || cell === '') continue;
    if (!headerLooksLikeSohColumn(header)) continue;
    const parsed = parseStockNumber(cell);
    if (parsed != null) return parsed;
  }

  for (const [header, raw] of Object.entries(values)) {
    if (!headerLooksLikeSohColumn(header)) continue;
    const parsed = parseStockNumber(raw);
    if (parsed != null) return parsed;
  }

  return null;
}

export function inferRowLabel(values: Record<string, string>, headers: string[]) {
  for (const header of headers) {
    if (NAME_HEADER.test(header) && values[header]) {
      return values[header];
    }
  }
  const parts = Object.values(values).filter(Boolean).slice(0, 3);
  return parts.join(' · ') || 'Row';
}

export function inferNameBrand(values: Record<string, string>, headers: string[]) {
  let name = '';
  let brand = '';

  for (const header of headers) {
    if (!name && NAME_HEADER.test(header) && values[header]) name = values[header];
    if (!brand && BRAND_HEADER.test(header) && values[header]) brand = values[header];
  }

  if (!name) {
    const fallback = Object.entries(values).find(([h]) => !PRICE_HEADER.test(h));
    if (fallback) name = fallback[1];
  }

  return { name, brand };
}

export function parseCsvText(csvText: string, headerRowIndex = 0) {
  const parsedRows = parseCsv(csvText);
  if (parsedRows.length < 2) {
    throw new Error('CSV must include a header row and at least one product row');
  }
  return csvRowsToObjects(parsedRows, headerRowIndex);
}
