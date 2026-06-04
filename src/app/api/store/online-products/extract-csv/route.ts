/**
 * Online Products CSV Extraction API
 * POST /api/store/online-products/extract-csv
 *
 * Accepts a product CSV, infers columns from headers and values, then uses
 * OpenAI web search to enrich every product row into marketplace-ready data.
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_CSV_IMPORT_MODEL || 'gpt-5.4-mini';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 80;
const BATCH_SIZE = 6;
const BATCH_CONCURRENCY = 2;

const CATEGORIES = ['Bicycles', 'Parts', 'Apparel', 'Nutrition'] as const;
const SUBCATEGORIES: Record<string, string[]> = {
  Bicycles: ['Road', 'Mountain', 'Hybrid', 'Electric', 'Kids', 'BMX', 'Cruiser', 'Other'],
  Parts: ['Frames', 'Wheels', 'Drivetrain', 'Brakes', 'Handlebars', 'Saddles', 'Pedals', 'Other'],
  Apparel: ['Jerseys', 'Shorts', 'Jackets', 'Gloves', 'Shoes', 'Helmets', 'Other'],
  Nutrition: ['Energy Bars', 'Gels', 'Drinks', 'Supplements', 'Other'],
};

interface CsvRowForAI {
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

interface EnrichmentResponse {
  products?: EnrichedProduct[];
  skippedRows?: Array<{ rowIndex?: number; reason?: string }>;
}

const CSV_ENRICHMENT_PROMPT = `You are a cycling ecommerce catalog specialist.

You will receive product rows parsed from a CSV. The CSV headers may be arbitrary: infer what each column means from the header text and row values. Treat every input row independently.

For EVERY row that describes a saleable cycling product, use web search to verify and enrich the product:
- Search likely official manufacturer pages, reputable cycling retailers, or trusted product data sources.
- Clean the title into a precise ecommerce product title with brand/model/variant/size/colour where relevant.
- Preserve important row-specific variant details such as size, colour, flavour, volume, wheel size, speed count, side, front/rear, pair/single, and model year.
- Use the CSV price when present. Convert prices to an AUD number and return null only if no price can be inferred from the row.
- Categorise into exactly one category: Bicycles, Parts, Apparel, Nutrition.
- Choose the most specific subcategory from the supplied category map.
- Write a concise product description and a short bullet-list spec sheet grounded in the row and web research.

Do not invent products for blank rows, section headings, category-only rows, totals, notes, shipping rows, or accessories that are not saleable products.

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

function isCsvFile(file: File) {
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

function parseCsv(text: string) {
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
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function csvRowsToObjects(parsedRows: string[][]) {
  const headers = makeUniqueHeaders(parsedRows[0] ?? []);
  const rows = parsedRows.slice(1, MAX_ROWS + 1).map((cells, index) => {
    const values: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      const value = truncateCell(cells[columnIndex] ?? '');
      if (value) values[header] = value;
    });
    return { rowIndex: index + 2, values };
  });

  return {
    headers,
    rows: rows.filter((row) => Object.keys(row.values).length > 0),
    truncated: parsedRows.length - 1 > MAX_ROWS,
  };
}

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
  return match ?? 'Parts';
}

function normaliseSubcategory(category: string, value: string | null | undefined) {
  const allowed = SUBCATEGORIES[category] ?? SUBCATEGORIES.Parts;
  const match = allowed.find((subcategory) => subcategory.toLowerCase() === String(value || '').toLowerCase());
  return match ?? 'Other';
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

async function enrichBatch(headers: string[], rows: CsvRowForAI[]) {
  const response = await openai.responses.create({
    model: MODEL,
    instructions: CSV_ENRICHMENT_PROMPT,
    tools: [
      {
        type: 'web_search',
        search_context_size: 'medium',
      },
    ],
    tool_choice: 'required',
    input: [
      `Category map: ${JSON.stringify(SUBCATEGORIES)}`,
      `CSV headers: ${JSON.stringify(headers)}`,
      `Rows to process: ${JSON.stringify(rows)}`,
      'Return one products[] object for every saleable product row. Preserve rowIndex exactly.',
    ].join('\n\n'),
  });

  const parsed = parseJsonObject<EnrichmentResponse>(extractOutputText(response));
  const byRow = new Map(rows.map((row) => [row.rowIndex, row]));

  return (parsed.products ?? [])
    .map((product) => sanitiseProduct(product, byRow.get(product.rowIndex ?? -1) ?? rows[0]))
    .filter((product): product is NonNullable<typeof product> => Boolean(product));
}

async function enrichRows(headers: string[], rows: CsvRowForAI[]) {
  const batches: CsvRowForAI[][] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    batches.push(rows.slice(i, i + BATCH_SIZE));
  }

  const products: NonNullable<ReturnType<typeof sanitiseProduct>>[] = [];
  let next = 0;

  async function worker() {
    while (next < batches.length) {
      const index = next;
      next += 1;
      const batchProducts = await enrichBatch(headers, batches[index]);
      products.push(...batchProducts);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(BATCH_CONCURRENCY, batches.length) }, () => worker()),
  );

  return products.sort((a, b) => a.rowIndex - b.rowIndex);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('account_type, bicycle_store')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.account_type !== 'bicycle_store' || !profile.bicycle_store) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const csvFile = formData.get('csv') as File | null;

    if (!csvFile) {
      return NextResponse.json({ error: 'No CSV provided' }, { status: 400 });
    }

    if (!isCsvFile(csvFile)) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 });
    }

    if (csvFile.size > MAX_BYTES) {
      return NextResponse.json({ error: 'CSV must be under 5MB' }, { status: 400 });
    }

    const csvText = await csvFile.text();
    const parsedRows = parseCsv(csvText);

    if (parsedRows.length < 2) {
      return NextResponse.json({ error: 'CSV must include a header row and at least one product row' }, { status: 400 });
    }

    const { headers, rows, truncated } = csvRowsToObjects(parsedRows);

    if (rows.length === 0) {
      return NextResponse.json({ success: true, products: [], truncated });
    }

    const products = await enrichRows(headers, rows);

    return NextResponse.json({
      success: true,
      products,
      truncated,
      rowCount: rows.length,
    });
  } catch (err) {
    console.error('[online-products/extract-csv]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'CSV extraction failed' },
      { status: 500 },
    );
  }
}
