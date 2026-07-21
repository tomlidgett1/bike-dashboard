import { NextRequest, NextResponse } from "next/server";
import { requireStoreUser } from "@/lib/customer-inquiries/auth";
import { createLightspeedClient } from "@/lib/services/lightspeed";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  flattenSalesForTable,
  getSalesField,
  getSalesFieldsForGrain,
  isCalculatedColumnKey,
  normaliseCalculatedColumns,
  parseCalculatedFormula,
  projectTableRows,
  SALES_TABLE_LOAD_RELATIONS,
  type CalculatedColumn,
  type TableBuilderGrain,
} from "@/lib/table-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_COLUMNS = 80;
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

function parseGrain(value: unknown): TableBuilderGrain {
  return value === "sale" ? "sale" : "sale_line";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStoreUser();
    if ("error" in auth) return auth.error;

    const body = await request.json().catch(() => ({}));
    const grain = parseGrain(body.grain);
    const limit = Math.min(
      Math.max(Number(body.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    const allCalculated = normaliseCalculatedColumns(
      body.calculatedColumns as CalculatedColumn[] | undefined,
    );
    const calculatedColumns = allCalculated.filter((col) =>
      parseCalculatedFormula(col.expression, grain, {
        calculatedColumns: allCalculated,
        selfKey: col.key,
      }).ok,
    );

    const calcKeys = new Set(calculatedColumns.map((col) => col.key));
    const allowedKeys = new Set(getSalesFieldsForGrain(grain).map((f) => f.key));
    const rawColumns = Array.isArray(body.columns) ? body.columns : [];
    const columns = rawColumns
      .map((key: unknown) => String(key))
      .filter(
        (key: string) =>
          (allowedKeys.has(key) && !!getSalesField(key))
          || (isCalculatedColumnKey(key) && calcKeys.has(key)),
      )
      .slice(0, MAX_COLUMNS);

    if (columns.length === 0) {
      return NextResponse.json(
        { success: false, error: "Select at least one valid column." },
        { status: 400 },
      );
    }

    // Prefer the shared raw store (instant, no Lightspeed quota). Fall back
    // to a live pull only before the store's first sync.
    const admin = createServiceRoleClient();
    const fetchCap = grain === "sale" ? limit * 4 : limit;
    const { data: storedRows } = await admin
      .from("api_builder_source_rows")
      .select("sale_id, data")
      .eq("user_id", auth.user.id)
      .eq("source", "sales")
      .order("complete_time", { ascending: false, nullsFirst: false })
      .range(0, fetchCap - 1);

    if (storedRows && storedRows.length > 0) {
      const flat: Record<string, unknown>[] = [];
      const seenSales = new Set<string>();
      for (const record of storedRows) {
        if (grain === "sale" && seenSales.has(record.sale_id)) continue;
        seenSales.add(record.sale_id);
        if (record.data && typeof record.data === "object") {
          flat.push(record.data as Record<string, unknown>);
        }
        if (flat.length >= limit) break;
      }
      const rows = projectTableRows(flat, columns, calculatedColumns, grain);
      return NextResponse.json({
        success: true,
        grain,
        columns,
        rows,
        fetchedSales: seenSales.size,
        fetchedRows: rows.length,
        fromStore: true,
      });
    }

    const client = createLightspeedClient(auth.user.id);
    const sales = await client.getSales({
      completed: "true",
      archived: "false",
      sort: "-completeTime",
      limit,
      load_relations: SALES_TABLE_LOAD_RELATIONS,
    });

    const flat = flattenSalesForTable(sales, grain);
    const rows = projectTableRows(flat, columns, calculatedColumns, grain);

    return NextResponse.json({
      success: true,
      grain,
      columns,
      rows,
      fetchedSales: sales.length,
      fetchedRows: rows.length,
    });
  } catch (error) {
    console.error("[table-builder/preview] failed:", error);
    const message =
      error instanceof Error ? error.message : "Failed to preview sales table";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
