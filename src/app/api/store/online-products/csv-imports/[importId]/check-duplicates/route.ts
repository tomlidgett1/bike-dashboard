/**
 * POST — re-run duplicate detection for all rows in a saved CSV import
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  computeImportRowDuplicates,
  valueForHeader,
  type DuplicateReferenceValue,
  type ExistingCatalogProduct,
} from '@/lib/store/online-products-csv';
import {
  requireBicycleStore,
  type BicycleStoreSupabase,
} from '@/lib/store/online-products-store-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function fetchStoreCatalog(
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
  currentImportId: string,
  duplicateColumn: string | null,
): Promise<DuplicateReferenceValue[]> {
  if (!duplicateColumn?.trim()) return [];

  const { data: imports } = await supabase
    .from('online_product_csv_imports')
    .select('id, file_name, duplicate_column')
    .eq('user_id', userId)
    .neq('id', currentImportId)
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

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const auth = await requireBicycleStore();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { importId } = await params;
    const { supabase, user } = auth;

    const { data: importRow, error: importError } = await supabase
      .from('online_product_csv_imports')
      .select('id, headers, duplicate_column')
      .eq('id', importId)
      .eq('user_id', user.id)
      .single();

    if (importError || !importRow) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    const { data: dbRows, error: rowsError } = await supabase
      .from('online_product_csv_rows')
      .select('id, row_index, raw_values, status, created_product_id')
      .eq('import_id', importId)
      .order('row_index', { ascending: true });

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    const rows = (dbRows ?? []).filter((row) =>
      ['pending', 'duplicate', 'selected'].includes(row.status as string),
    );
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        rows: [],
        stats: { duplicateRows: 0, pendingRows: 0 },
      });
    }

    const headers = importRow.headers as string[];
    const duplicateColumn = (importRow.duplicate_column as string | null) ?? null;
    const [existingCatalog, priorReferences] = await Promise.all([
      fetchStoreCatalog(supabase, user.id),
      fetchPriorCsvDuplicateReferences(supabase, user.id, importId, duplicateColumn),
    ]);

    const duplicateResults = computeImportRowDuplicates({
      headers,
      duplicateColumn,
      rows: rows.map((row) => ({
        rowIndex: row.row_index as number,
        values: row.raw_values as Record<string, string>,
      })),
      existingCatalog,
      priorReferences,
    });

    const resultByRowIndex = new Map(
      duplicateResults.map((result) => [result.rowIndex, result]),
    );

    await Promise.all(
      rows.map((row) => {
        const result = resultByRowIndex.get(row.row_index as number);
        if (!result) return Promise.resolve();

        return supabase
          .from('online_product_csv_rows')
          .update({
            status: result.status,
            duplicate_of_id: result.duplicateOfId,
            duplicate_of_name: result.duplicateOfName,
            is_selected: result.isSelected,
          })
          .eq('id', row.id as string)
          .eq('import_id', importId);
      }),
    );

    await supabase
      .from('online_product_csv_imports')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', importId);

    const { data: updatedRows } = await supabase
      .from('online_product_csv_rows')
      .select('*')
      .eq('import_id', importId)
      .order('row_index', { ascending: true });

    const serialised = (updatedRows ?? []).map(serialiseCsvRow);
    const duplicateRows = serialised.filter((row) => row.status === 'duplicate').length;

    return NextResponse.json({
      success: true,
      rows: serialised,
      stats: {
        duplicateRows,
        pendingRows: serialised.filter((row) => row.status === 'pending').length,
      },
    });
  } catch (err) {
    console.error('[csv-imports check-duplicates]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Duplicate check failed' },
      { status: 500 },
    );
  }
}
