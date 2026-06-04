/**
 * GET    — import with all rows
 * PATCH  — update row selection
 * DELETE — remove import
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  requireBicycleStore,
  type BicycleStoreSupabase,
} from '@/lib/store/online-products-store-auth';

export const dynamic = 'force-dynamic';

function serialiseImport(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    fileName: row.file_name as string,
    headers: row.headers as string[],
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

async function loadImport(
  supabase: BicycleStoreSupabase,
  userId: string,
  importId: string,
) {
  const { data: importRow, error } = await supabase
    .from('online_product_csv_imports')
    .select('id, file_name, headers, row_count, created_at, updated_at')
    .eq('id', importId)
    .eq('user_id', userId)
    .single();

  if (error || !importRow) return null;
  return importRow;
}

export async function GET(
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

    const importRow = await loadImport(supabase, user.id, importId);
    if (!importRow) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    const { data: rows, error: rowsError } = await supabase
      .from('online_product_csv_rows')
      .select('*')
      .eq('import_id', importId)
      .order('row_index', { ascending: true });

    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      import: serialiseImport(importRow as Record<string, unknown>),
      rows: (rows ?? []).map(serialiseCsvRow),
    });
  } catch (err) {
    console.error('[csv-imports GET id]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load import' },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const auth = await requireBicycleStore();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { importId } = await params;
    const { supabase, user } = auth;

    const importRow = await loadImport(supabase, user.id, importId);
    if (!importRow) {
      return NextResponse.json({ error: 'Import not found' }, { status: 404 });
    }

    const body = await request.json();
    const selections: Array<{ rowId: string; selected: boolean }> = body.selections ?? [];
    const selectAll: boolean | undefined = body.selectAll;
    const selectAllValue: boolean = body.selected ?? true;
    const onlyPending: boolean = body.onlyPending !== false;

    if (selectAll === true) {
      let query = supabase
        .from('online_product_csv_rows')
        .update({ is_selected: selectAllValue })
        .eq('import_id', importId);

      if (onlyPending) {
        query = query.in('status', ['pending', 'enriched', 'selected']);
      }

      const { error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else if (selections.length > 0) {
      await Promise.all(
        selections.map(({ rowId, selected }) =>
          supabase
            .from('online_product_csv_rows')
            .update({ is_selected: selected })
            .eq('id', rowId)
            .eq('import_id', importId),
        ),
      );
    }

    await supabase
      .from('online_product_csv_imports')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', importId);

    const { data: rows } = await supabase
      .from('online_product_csv_rows')
      .select('*')
      .eq('import_id', importId)
      .order('row_index', { ascending: true });

    return NextResponse.json({
      success: true,
      rows: (rows ?? []).map(serialiseCsvRow),
    });
  } catch (err) {
    console.error('[csv-imports PATCH]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update selection' },
      { status: 500 },
    );
  }
}

export async function DELETE(
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

    const { error } = await supabase
      .from('online_product_csv_imports')
      .delete()
      .eq('id', importId)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[csv-imports DELETE]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete import' },
      { status: 500 },
    );
  }
}
