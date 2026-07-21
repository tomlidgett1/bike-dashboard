import OpenAI from 'openai';
import {
  buildExistingCatalogIndex,
  catalogMatchKey,
  findDuplicateForProduct,
  type ExistingCatalogProduct,
} from '@/lib/store/online-products-csv';
import {
  listCanonicalLevel1,
  listCanonicalLevel2,
  resolveCanonicalPath,
} from '@/lib/marketplace/canonical-taxonomy';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_CSV_IMPORT_MODEL || 'gpt-5.4-mini';
export const ENRICH_BATCH_SIZE = 6;
export const ENRICH_BATCH_CONCURRENCY = 2;
export const ENRICH_MAX_ROWS_PER_REQUEST = 36;
const BATCH_RETRY_DELAY_MS = 800;

const CATEGORIES = listCanonicalLevel1();
const SUBCATEGORIES: Record<string, string[]> = Object.fromEntries(
  CATEGORIES.map((level1) => [level1, listCanonicalLevel2(level1)]),
);

export interface CsvRowForAI {
  rowIndex: number;
  values: Record<string, string>;
}

interface EnrichedProduct {
  rowIndex?: number;
  name?: string;
  brand?: string | null;
  price?: number | string | null;
  category?: string | null;
  subcategory?: string | null;
  description?: string | null;
  specs?: string | null;
}

interface SkippedRow {
  rowIndex: number;
  reason: string;
}

interface EnrichmentResponse {
  products?: EnrichedProduct[];
  skippedRows?: Array<{ rowIndex?: number; reason?: string }>;
}

export interface EnrichedCatalogProduct {
  rowIndex: number;
  name: string;
  brand: string;
  price: number | null;
  category: string;
  subcategory: string;
  description: string;
  specs: string;
  isDuplicate: boolean;
  duplicateOfId: string | null;
  duplicateOfName: string | null;
}

const CSV_ENRICHMENT_PROMPT = `You are a cycling ecommerce catalog specialist.

You will receive product rows parsed from a CSV. The CSV headers may be arbitrary: infer what each column means from the header text and row values. Treat every input row independently.

For EVERY row that describes a saleable cycling product, use web search to verify and enrich the product:
- Search likely official manufacturer pages, reputable cycling retailers, or trusted product data sources.
- Clean the title into a precise ecommerce product title with brand/model/variant/size/colour where relevant.
- Preserve important row-specific variant details such as size, colour, flavour, volume, wheel size, speed count, side, front/rear, pair/single, and model year.
- Use the CSV price when present. Convert prices to an AUD number and return null only if no price can be inferred from the row.
- Categorise into exactly one Yellow Jersey L1 category from the supplied category map.
- Choose the most specific L2 subcategory from that map (and prefer precise part/apparel/bike disciplines over broad leftovers).
- Write a concise product description and a short bullet-list spec sheet grounded in the row and web research.

Do not invent products for blank rows, section headings, category-only rows, totals, notes, shipping rows, or accessories that are not saleable products.

You MUST account for every input row: either include it in products[] or in skippedRows[] with rowIndex and a short reason.

Return ONLY valid JSON with this shape:
{
  "products": [
    {
      "rowIndex": 2,
      "name": "Full clean ecommerce title",
      "brand": "Brand",
      "price": 129.99,
      "category": "Parts",
      "subcategory": "Drivetrain",
      "description": "Two or three concise sentences.",
      "specs": "- Spec one\\n- Spec two\\n- Spec three"
    }
  ],
  "skippedRows": [
    { "rowIndex": 5, "reason": "Blank/category row" }
  ]
}`;

function extractOutputText(response: { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }) {
  let text = '';
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && content.text) text += content.text;
    }
  }
  return text.trim();
}

function parseJsonObject<T>(text: string): T {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) throw new Error('AI returned invalid JSON');
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  }
}

function normaliseCategory(value: string | null | undefined) {
  const match = CATEGORIES.find((category) => category.toLowerCase() === String(value || '').toLowerCase());
  return match ?? 'Accessories';
}

function normaliseSubcategory(category: string, value: string | null | undefined) {
  const resolved = resolveCanonicalPath(category, value, null);
  if (resolved) return resolved.level2;
  const allowed = SUBCATEGORIES[category] ?? SUBCATEGORIES.Accessories ?? [];
  const match = allowed.find((subcategory) => subcategory.toLowerCase() === String(value || '').toLowerCase());
  return match ?? allowed[0] ?? 'Locks';
}

function normalisePrice(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitiseText(value: string | null | undefined) {
  return String(value || '').trim();
}

function sanitiseProduct(product: EnrichedProduct, fallbackRow: CsvRowForAI) {
  const category = normaliseCategory(product.category);
  const name = sanitiseText(product.name);

  if (!name) return null;

  return {
    rowIndex: product.rowIndex ?? fallbackRow.rowIndex,
    name,
    brand: sanitiseText(product.brand),
    price: normalisePrice(product.price),
    category,
    subcategory: normaliseSubcategory(category, product.subcategory),
    description: sanitiseText(product.description),
    specs: sanitiseText(product.specs),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function enrichBatch(headers: string[], rows: CsvRowForAI[]) {
  const response = await openai.responses.create({
    model: MODEL,
    instructions: CSV_ENRICHMENT_PROMPT,
    tools: [{ type: 'web_search', search_context_size: 'medium' }],
    tool_choice: 'required',
    input: [
      `Category map: ${JSON.stringify(SUBCATEGORIES)}`,
      `CSV headers: ${JSON.stringify(headers)}`,
      `Rows to process (${rows.length} rows, rowIndex values must be preserved exactly): ${JSON.stringify(rows)}`,
      'Return one products[] entry or skippedRows[] entry for every input rowIndex.',
    ].join('\n\n'),
  });

  const parsed = parseJsonObject<EnrichmentResponse>(extractOutputText(response));
  const byRow = new Map(rows.map((row) => [row.rowIndex, row]));

  const products = (parsed.products ?? [])
    .map((product) => sanitiseProduct(product, byRow.get(product.rowIndex ?? -1) ?? rows[0]))
    .filter((product): product is NonNullable<ReturnType<typeof sanitiseProduct>> => Boolean(product));

  const skippedRows: SkippedRow[] = (parsed.skippedRows ?? [])
    .map((row) => ({
      rowIndex: row.rowIndex ?? -1,
      reason: sanitiseText(row.reason) || 'Skipped by AI',
    }))
    .filter((row) => row.rowIndex > 0);

  return { products, skippedRows };
}

async function enrichBatchWithRetry(headers: string[], rows: CsvRowForAI[]) {
  try {
    return await enrichBatch(headers, rows);
  } catch (firstError) {
    console.warn('[online-products-csv-enrich] batch failed, retrying:', firstError);
    await sleep(BATCH_RETRY_DELAY_MS);
    return await enrichBatch(headers, rows);
  }
}

export async function enrichCsvRows(headers: string[], rows: CsvRowForAI[]) {
  const capped = rows.slice(0, ENRICH_MAX_ROWS_PER_REQUEST);
  const batches: CsvRowForAI[][] = [];
  for (let i = 0; i < capped.length; i += ENRICH_BATCH_SIZE) {
    batches.push(capped.slice(i, i + ENRICH_BATCH_SIZE));
  }

  const products: NonNullable<ReturnType<typeof sanitiseProduct>>[] = [];
  const skippedRows: SkippedRow[] = [];
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const index = next;
      next += 1;
      const batch = batches[index];
      try {
        const result = await enrichBatchWithRetry(headers, batch);
        products.push(...result.products);
        skippedRows.push(...result.skippedRows);
      } catch (err) {
        console.error('[online-products-csv-enrich] batch permanently failed:', err);
        for (const row of batch) {
          skippedRows.push({
            rowIndex: row.rowIndex,
            reason: 'Enrichment failed after retry',
          });
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ENRICH_BATCH_CONCURRENCY, batches.length) }, () => worker()),
  );

  const accounted = new Set<number>([
    ...products.map((p) => p.rowIndex),
    ...skippedRows.map((s) => s.rowIndex),
  ]);

  for (const row of capped) {
    if (!accounted.has(row.rowIndex)) {
      skippedRows.push({
        rowIndex: row.rowIndex,
        reason: 'No product returned for this row',
      });
    }
  }

  const dedupedSkipped = [...new Map(skippedRows.map((s) => [s.rowIndex, s])).values()].sort(
    (a, b) => a.rowIndex - b.rowIndex,
  );

  return {
    products: products.sort((a, b) => a.rowIndex - b.rowIndex),
    skippedRows: dedupedSkipped,
    processedCount: capped.length,
    remainingCount: Math.max(0, rows.length - capped.length),
  };
}

export function markEnrichedDuplicates(
  products: NonNullable<ReturnType<typeof sanitiseProduct>>[],
  existing: ExistingCatalogProduct[],
): EnrichedCatalogProduct[] {
  const index = buildExistingCatalogIndex(existing);
  const seenInImport = new Set<string>();

  return products.map((product) => {
    const catalogKey = catalogMatchKey(product.name, product.brand);
    const existingMatch = findDuplicateForProduct(product.name, product.brand, index);
    const duplicateInImport = catalogKey.length > 0 && seenInImport.has(catalogKey);

    if (catalogKey.length > 0) seenInImport.add(catalogKey);

    const isDuplicate = Boolean(existingMatch) || duplicateInImport;

    return {
      ...product,
      isDuplicate,
      duplicateOfId: existingMatch?.existingProductId ?? null,
      duplicateOfName: existingMatch
        ? existingMatch.existingProductName
        : duplicateInImport
          ? 'Another row in this import'
          : null,
    };
  });
}
