/**
 * GET  — list saved CSV imports
 * POST — upload CSV, parse all rows, persist import + rows
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildExistingCatalogIndex,
  catalogMatchKey,
  csvRowFingerprint,
  findDuplicateForProduct,
  type ExistingCatalogProduct,
} from '@/lib/store/online-products-csv';
import {
  CSV_MAX_BYTES,
  inferNameBrand,
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
    .select('id, display_name, description, brand')
    .eq('user_id', userId)
    .eq('listing_source', 'online_catalog')
    .eq('listing_type', 'store_inventory');

  return (data ?? []) as ExistingCatalogProduct[];
}

function serialiseImport(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    fileName: row.file_name as string,
    headers: row.headers as string[],
    sohColumn: (row.soh_column as string | null) ?? null,
    searchColumn: (row.search_column as string | null) ?? null,
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
      .select('id, file_name, headers, soh_column, search_column, image_search_bicycle_context, row_count, created_at, updated_at')
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

    const { headers, rows, totalDataRows } = parseCsvText(
      await csvFile.text(),
      headerRowIndex,
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No product rows found in CSV' }, { status: 400 });
    }

    const existingCatalog = await fetchExistingCatalog(supabase, user.id);
    const catalogIndex = buildExistingCatalogIndex(existingCatalog);
    const seenRawFingerprints = new Map<string, { rowIndex: number; label: string }>();

    const { data: importRow, error: importError } = await supabase
      .from('online_product_csv_imports')
      .insert({
        user_id: user.id,
        file_name: csvFile.name,
        headers,
        soh_column: sohColumn,
        search_column: searchColumn,
        image_search_bicycle_context: imageSearchBicycleContext,
        row_count: rows.length,
      })
      .select('id, file_name, headers, soh_column, search_column, image_search_bicycle_context, row_count, created_at, updated_at')
      .single();

    if (importError || !importRow) {
      return NextResponse.json({ error: importError?.message ?? 'Failed to save import' }, { status: 500 });
    }

    const rowPayloads = rows.map((row) => {
      const label = inferRowLabel(row.values, headers);
      const { name, brand } = inferNameBrand(row.values, headers);
      const catalogDup = name ? findDuplicateForProduct(name, brand, catalogIndex) : null;
      const fingerprint = csvRowFingerprint(row.values);
      const fileDup = fingerprint ? seenRawFingerprints.get(fingerprint) : undefined;

      let status: 'pending' | 'duplicate' = 'pending';
      let duplicateOfId: string | null = null;
      let duplicateOfName: string | null = null;

      if (catalogDup) {
        status = 'duplicate';
        duplicateOfId = catalogDup.existingProductId;
        duplicateOfName = catalogDup.existingProductName;
      } else if (fileDup) {
        status = 'duplicate';
        duplicateOfName = `Duplicate of row ${fileDup.rowIndex} (${fileDup.label})`;
      } else if (fingerprint) {
        seenRawFingerprints.set(fingerprint, { rowIndex: row.rowIndex, label });
      }

      const catalogKey = catalogMatchKey(name, brand);
      if (status === 'pending' && catalogKey) {
        const priorCatalog = seenRawFingerprints.get(`catalog:${catalogKey}`);
        if (priorCatalog) {
          status = 'duplicate';
          duplicateOfName = `Duplicate of row ${priorCatalog.rowIndex} (${priorCatalog.label})`;
        } else {
          seenRawFingerprints.set(`catalog:${catalogKey}`, { rowIndex: row.rowIndex, label: name || label });
        }
      }

      return {
        import_id: importRow.id,
        row_index: row.rowIndex,
        display_label: label,
        raw_values: row.values,
        is_selected: status === 'pending',
        status,
        duplicate_of_id: duplicateOfId,
        duplicate_of_name: duplicateOfName,
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
