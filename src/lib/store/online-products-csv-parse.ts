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

function parseStockNumber(value: string) {
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

/** Read stock on hand from a CSV row when a matching column exists. */
export function parseSohFromValues(values: Record<string, string>, headers: string[]) {
  for (const header of headers) {
    const trimmed = header.trim();
    const cell = values[header]?.trim();
    if (!cell) continue;
    if (SOH_HEADER.test(trimmed) || SOH_HEADER_LOOSE.test(trimmed)) {
      const parsed = parseStockNumber(cell);
      if (parsed != null) return parsed;
    }
  }

  for (const [header, raw] of Object.entries(values)) {
    if (!SOH_HEADER_LOOSE.test(header)) continue;
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
