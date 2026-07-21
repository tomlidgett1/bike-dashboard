/**
 * Stable schema signature for a saved API table. When the signature changes
 * (grain, selected columns, or formula definitions) the stored rows no longer
 * match the table definition, so the next sync must be a full rebuild instead
 * of an incremental pull.
 */

import {
  isCalculatedColumnKey,
  normaliseCalculatedColumns,
} from "./calculated-columns";
import { RELATIONSHIP_COLUMN_KEYS } from "./flatten-sales";
import { getSalesField } from "./sales-fields";
import type {
  CalculatedColumn,
  SavedApiTable,
  TableBuilderGrain,
} from "./types";

/**
 * Effective column set written to api_builder_table_rows for a table:
 * valid saved columns for the grain, all formula columns, and the
 * relationship keys the sync always includes.
 */
export function columnsForSync(
  savedColumns: string[],
  grain: TableBuilderGrain,
  calculatedColumns: CalculatedColumn[],
): string[] {
  const calcKeys = new Set(calculatedColumns.map((col) => col.key));
  const allowed = new Set(
    savedColumns.filter((key) => {
      if (isCalculatedColumnKey(key) && calcKeys.has(key)) return true;
      const field = getSalesField(key);
      return field && field.grains.includes(grain);
    }),
  );
  for (const calc of calculatedColumns) {
    allowed.add(calc.key);
  }
  for (const key of RELATIONSHIP_COLUMN_KEYS) {
    const field = getSalesField(key);
    if (field && field.grains.includes(grain)) allowed.add(key);
  }
  if (grain === "sale") {
    allowed.delete("line.saleLineID");
  }
  return Array.from(allowed);
}

/**
 * Order-insensitive signature of everything that affects stored row data.
 * Column reorders and header renames do not change it; adding/removing a
 * column, changing grain, or editing a formula expression does.
 */
export function computeApiTableSchemaSignature(
  table: Pick<SavedApiTable, "grain" | "columns" | "calculated_columns">,
): string {
  const grain: TableBuilderGrain = table.grain === "sale" ? "sale" : "sale_line";
  const calcs = normaliseCalculatedColumns(table.calculated_columns);
  const columns = columnsForSync(
    Array.isArray(table.columns) ? table.columns.map(String) : [],
    grain,
    calcs,
  )
    .slice()
    .sort();
  const formulas = calcs
    .map((calc) => `${calc.key}:${calc.expression.trim()}`)
    .sort();
  return JSON.stringify({ grain, columns, formulas });
}
