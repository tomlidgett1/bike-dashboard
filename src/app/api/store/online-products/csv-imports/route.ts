/**
 * GET  — list saved CSV imports
 * POST — upload CSV, parse all rows, persist import + rows
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  computeImportRowDuplicates,
  valueForHeader,
  type DuplicateReferenceValue,
  type ExistingCatalogProduct,
} from '@/lib/store/online-products-csv';
import {
  CSV_MAX_BYTES,
  inferRowLabel,
  isCsvFile,
  parseCsvText,
} from '@/lib/store/online-products-csv-parse';
import {
  requireBicycleStore,
  type BicycleStoreSupabase,
} from '@/lib/store/online-products-store-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const INSERT_CHUNK = 150;

async function fetchExistingCatalog(
  supabase: BicycleStoreSupabase,
  userId: string,
): Promise<ExistingCatalogProduct[]> {
  const { data } = await supabase
    .from('products')
    .select('id, display_name, description, brand, system_sku, custom_sku')
    .eq('user_id', userId)
    .eq('listing_type', 'store_inventory');

  return (data ?? []) as ExistingCatalogProduct[];
}

async function fetchPriorCsvDuplicateReferences(
  supabase: BicycleStoreSupabase,
  userId: string,
  duplicateColumn: string | null,
): Promise<DuplicateReferenceValue[]> {
  if (!duplicateColumn?.trim()) return [];

  const { data: imports } = await supabase
    .from('online_product_csv_imports')
    .select('id, file_name, duplicate_column')
    .eq('user_id', userId)
    .not('duplicate_column', 'is', null);

  const importRows = imports ?? [];
  if (importRows.length === 0) return [];

  const columnByImportId = new Map(
    importRows.map((row) => [row.id as string, row.duplicate_column as string | null]),
  );

  const { data: csvRows } = await supabase
    .from('online_product_csv_rows')
    .select('import_id, row_index, display_label, raw_values, status, created_product_id')
    .in('import_id', importRows.map((row) => row.id as string))
    .in('status', ['pending', 'selected', 'enriched', 'created']);

  return (csvRows ?? [])
    .map((row) => {
      const priorColumn = columnByImportId.get(row.import_id as string);
      const value = valueForHeader(row.raw_values as Record<string, string>, priorColumn);
      if (!value) return null;

      return {
        value,
        duplicateOfId: (row.created_product_id as string | null) ?? null,
        duplicateOfName:
          (row.display_label as string | null) ||
          `Previous CSV row ${row.row_index as number}`,
      } satisfies DuplicateReferenceValue;
    })
    .filter((row): row is DuplicateReferenceValue => row !== null);
}

function serialiseImport(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    fileName: row.file_name as string,
    headers: row.headers as string[],
    sohColumn: (row.soh_column as string | null) ?? null,
    searchColumn: (row.search_column as string | null) ?? null,
    duplicateColumn: (row.duplicate_column as string | null) ?? null,
    imageSearchBicycleContext: Boolean(row.image_search_bicycle_context),
    rowCount: row.row_count as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function serialiseCsvRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    rowIndex: row.row_index as number,
    displayLabel: row.display_label as string,
    rawValues: row.raw_values as Record<string, string>,
    isSelected: row.is_selected as boolean,
    status: row.status as string,
    enriched: row.enriched,
    duplicateOfId: row.duplicate_of_id as string | null,
    duplicateOfName: row.duplicate_of_name as string | null,
    skipReason: row.skip_reason as string | null,
    createdProductId: row.created_product_id as string | null,
  };
}

export async function GET() {
  try {
    const auth = await requireBicycleStore();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, user } = auth;

    const { data: imports, error } = await supabase
      .from('online_product_csv_imports')
      .select('id, file_name, headers, soh_column, search_column, duplicate_column, image_search_bicycle_context, row_count, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(30);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      imports: (imports ?? []).map(serialiseImport),
    });
  } catch (err) {
    console.error('[csv-imports GET]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to list imports' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireBicycleStore();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { supabase, user } = auth;
    const formData = await request.formData();
    const csvFile = formData.get('csv') as File | null;

    if (!csvFile) {
      return NextResponse.json({ error: 'No CSV provided' }, { status: 400 });
    }

    if (!isCsvFile(csvFile)) {
      return NextResponse.json({ error: 'File must be a CSV' }, { status: 400 });
    }

    if (csvFile.size > CSV_MAX_BYTES) {
      return NextResponse.json({ error: 'CSV must be under 5MB' }, { status: 400 });
    }

    const headerRowRaw = formData.get('headerRowIndex');
    const headerRowIndex =
      headerRowRaw != null
        ? Math.max(0, Number.parseInt(String(headerRowRaw), 10) || 0)
        : 0;

    const sohColumnRaw = formData.get('sohColumn');
    const sohColumn =
      sohColumnRaw != null && String(sohColumnRaw).trim()
        ? String(sohColumnRaw).trim()
        : null;

    const searchColumnRaw = formData.get('searchColumn');
    const searchColumn =
      searchColumnRaw != null && String(searchColumnRaw).trim()
        ? String(searchColumnRaw).trim()
        : null;

    const bicycleContextRaw = formData.get('imageSearchBicycleContext');
    const imageSearchBicycleContext =
      bicycleContextRaw != null && String(bicycleContextRaw) === 'true';

    const duplicateColumnRaw = formData.get('duplicateColumn');
    const duplicateColumn =
      duplicateColumnRaw != null && String(duplicateColumnRaw).trim()
        ? String(duplicateColumnRaw).trim()
        : null;

    const { headers, rows, totalDataRows } = parseCsvText(
      await csvFile.text(),
      headerRowIndex,
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No product rows found in CSV' }, { status: 400 });
    }

    const [existingCatalog, priorReferences] = await Promise.all([
      fetchExistingCatalog(supabase, user.id),
      fetchPriorCsvDuplicateReferences(supabase, user.id, duplicateColumn),
    ]);

    const duplicateResults = computeImportRowDuplicates({
      headers,
      duplicateColumn,
      rows: rows.map((row) => ({ rowIndex: row.rowIndex, values: row.values })),
      existingCatalog,
      priorReferences,
    });
    const duplicateByRowIndex = new Map(
      duplicateResults.map((result) => [result.rowIndex, result]),
    );

    const { data: importRow, error: importError } = await supabase
      .from('online_product_csv_imports')
      .insert({
        user_id: user.id,
        file_name: csvFile.name,
        headers,
        soh_column: sohColumn,
        search_column: searchColumn,
        duplicate_column: duplicateColumn,
        image_search_bicycle_context: imageSearchBicycleContext,
        row_count: rows.length,
      })
      .select('id, file_name, headers, soh_column, search_column, duplicate_column, image_search_bicycle_context, row_count, created_at, updated_at')
      .single();

    if (importError || !importRow) {
      return NextResponse.json({ error: importError?.message ?? 'Failed to save import' }, { status: 500 });
    }

    const rowPayloads = rows.map((row) => {
      const label = inferRowLabel(row.values, headers);
      const duplicate = duplicateByRowIndex.get(row.rowIndex);

      return {
        import_id: importRow.id,
        row_index: row.rowIndex,
        display_label: label,
        raw_values: row.values,
        is_selected: duplicate?.isSelected ?? true,
        status: duplicate?.status ?? 'pending',
        duplicate_of_id: duplicate?.duplicateOfId ?? null,
        duplicate_of_name: duplicate?.duplicateOfName ?? null,
      };
    });

    const insertedRows: Record<string, unknown>[] = [];
    for (let i = 0; i < rowPayloads.length; i += INSERT_CHUNK) {
      const chunk = rowPayloads.slice(i, i + INSERT_CHUNK);
      const { data: chunkRows, error: chunkError } = await supabase
        .from('online_product_csv_rows')
        .insert(chunk)
        .select('*');

      if (chunkError) {
        await supabase.from('online_product_csv_imports').delete().eq('id', importRow.id);
        return NextResponse.json({ error: chunkError.message }, { status: 500 });
      }
      insertedRows.push(...(chunkRows ?? []));
    }

    insertedRows.sort((a, b) => (a.row_index as number) - (b.row_index as number));

    return NextResponse.json({
      success: true,
      import: serialiseImport(importRow as Record<string, unknown>),
      rows: insertedRows.map(serialiseCsvRow),
      stats: {
        totalDataRows,
        storedRows: insertedRows.length,
        duplicateRows: insertedRows.filter((r) => r.status === 'duplicate').length,
      },
    });
  } catch (err) {
    console.error('[csv-imports POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to upload CSV' },
      { status: 500 },
    );
  }
}
