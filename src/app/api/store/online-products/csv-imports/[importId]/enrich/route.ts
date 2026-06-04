/**
 * POST — AI-enrich selected rows from a saved CSV import
 */

import { NextRequest, NextResponse } from 'next/server';
import type { ExistingCatalogProduct } from '@/lib/store/online-products-csv';
import {
  ENRICH_MAX_ROWS_PER_REQUEST,
  enrichCsvRows,
  markEnrichedDuplicates,
} from '@/lib/store/online-products-csv-enrich';
import { parseSohFromValues } from '@/lib/store/online-products-csv-parse';
import { requireBicycleStore } from '@/lib/store/online-products-store-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const auth = await requireBicycleStore();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const { importId } = await params;
    const { supabase, user } = auth;
    const body = await request.json().catch(() => ({}));
    const rowIds: string[] | undefined = Array.isArray(body.rowIds) ? body.rowIds : undefined;

    const { data: importRow, error: importError } = await supabase
      .from('online_product_csv_imports')
      .select('id, headers')
      .eq('id', importId)
      .eq('user_id', user.id)
      .single();

    if (importError || !importRow) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    let rowsQuery = supabase
      .from('online_product_csv_rows')
      .select('*')
      .eq('import_id', importId)
      .eq('is_selected', true)
      .in('status', ['pending', 'selected']);

    if (rowIds?.length) {
      rowsQuery = rowsQuery.in('id', rowIds);
    }

    const { data: dbRows, error: rowsError } = await rowsQuery.order('row_index', { ascending: true });

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    const toEnrich = (dbRows ?? []).slice(0, ENRICH_MAX_ROWS_PER_REQUEST);

    if (toEnrich.length === 0) {
      return NextResponse.json({
        success: true,
        products: [],
        message: 'No selected rows ready for enrichment',
        remainingToEnrich: 0,
      });
    }

    const headers = importRow.headers as string[];
    const aiRows = toEnrich.map((row) => ({
      rowIndex: row.row_index as number,
      values: row.raw_values as Record<string, string>,
      dbId: row.id as string,
    }));

    const { products, skippedRows, processedCount, remainingCount } = await enrichCsvRows(
      headers,
      aiRows.map(({ rowIndex, values }) => ({ rowIndex, values })),
    );

    const { data: existingRows } = await supabase
      .from('products')
      .select('id, display_name, description, brand')
      .eq('user_id', user.id)
      .eq('listing_source', 'online_catalog')
      .eq('listing_type', 'store_inventory');

    const enrichedProducts = markEnrichedDuplicates(products, (existingRows ?? []) as ExistingCatalogProduct[]);
    const byRowIndex = new Map(enrichedProducts.map((p) => [p.rowIndex, p]));
    const idByRowIndex = new Map(aiRows.map((r) => [r.rowIndex, r.dbId]));
    const rawByRowIndex = new Map(
      toEnrich.map((row) => [row.row_index as number, row.raw_values as Record<string, string>]),
    );

    for (const skipped of skippedRows) {
      const dbId = idByRowIndex.get(skipped.rowIndex);
      if (!dbId) continue;
      await supabase
        .from('online_product_csv_rows')
        .update({
          status: 'skipped',
          skip_reason: skipped.reason,
          is_selected: false,
        })
        .eq('id', dbId);
    }

    const responseProducts = [];

    for (const product of enrichedProducts) {
      const dbId = idByRowIndex.get(product.rowIndex);
      if (!dbId) continue;

      const rawValues = rawByRowIndex.get(product.rowIndex) ?? {};
      const soh = parseSohFromValues(rawValues, headers);

      const enrichedPayload = {
        name: product.name,
        brand: product.brand,
        price: product.price,
        soh,
        category: product.category,
        subcategory: product.subcategory,
        description: product.description,
        specs: product.specs,
        isDuplicate: product.isDuplicate,
        duplicateOfId: product.duplicateOfId,
        duplicateOfName: product.duplicateOfName,
      };

      const status = product.isDuplicate ? 'duplicate' : 'enriched';

      await supabase
        .from('online_product_csv_rows')
        .update({
          status,
          enriched: enrichedPayload,
          duplicate_of_id: product.duplicateOfId,
          duplicate_of_name: product.duplicateOfName,
          is_selected: !product.isDuplicate,
        })
        .eq('id', dbId);

      responseProducts.push({
        csvRowId: dbId,
        rowIndex: product.rowIndex,
        ...enrichedPayload,
      });
    }

    await supabase
      .from('online_product_csv_imports')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', importId);

    const totalSelected = (dbRows ?? []).length;
    const stillPending = Math.max(0, totalSelected - processedCount) + remainingCount;

    return NextResponse.json({
      success: true,
      products: responseProducts,
      skippedRows,
      processedCount,
      remainingToEnrich: stillPending,
    });
  } catch (err) {
    console.error('[csv-imports enrich]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enrichment failed' },
      { status: 500 },
    );
  }
}
