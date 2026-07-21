"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  GripVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_SALES_COLUMNS,
  DEFAULT_SALES_LINE_COLUMNS,
  formulaColumnRefs,
  formulaPresets,
  getCalculatedColumn,
  getSalesField,
  getSalesFieldsForGrain,
  groupSalesFields,
  hasCalculatedColumnCycle,
  isCalculatedColumnKey,
  normaliseCalculatedColumns,
  parseCalculatedFormula,
  slugifyCalculatedKey,
  runApiBuilderSyncLoop,
  type CalculatedColumn,
  type SavedApiTable,
  type TableBuilderField,
  type TableBuilderFieldFormat,
  type TableBuilderFieldType,
  type TableBuilderGrain,
  type TableBuilderPreviewRow,
} from "@/lib/table-builder";

type SaveState = "idle" | "saving" | "saved" | "error";

const TABLE_SELECT =
  "id, user_id, name, source, grain, columns, column_labels, calculated_columns, created_at, updated_at, last_synced_at, sync_row_count, sync_status, sync_error, sync_cursor, sync_sales_fetched, sync_kind";

const SYNC_CHUNK_PAGES = 2;

function formatSyncProgress(table: Pick<
  SavedApiTable,
  | "sync_row_count"
  | "sync_sales_fetched"
  | "sync_status"
  | "sync_error"
  | "last_synced_at"
  | "sync_kind"
>): string {
  const rows = table.sync_row_count ?? 0;
  const sales = table.sync_sales_fetched ?? 0;
  const incremental = table.sync_kind === "incremental";
  if (table.sync_status === "syncing") {
    if (incremental) {
      return sales > 0
        ? `Refreshing… ${sales.toLocaleString()} recent sale${sales === 1 ? "" : "s"} pulled`
        : "Checking Lightspeed for new sales…";
    }
    if (rows > 0 || sales > 0) {
      return `Syncing… ${rows.toLocaleString()} rows from ${sales.toLocaleString()} sales`;
    }
    return "Syncing from Lightspeed…";
  }
  if (table.sync_status === "error") {
    return table.sync_error?.trim() || "Sync failed";
  }
  if (table.last_synced_at) {
    if (incremental) {
      return `${rows.toLocaleString()} rows · up to date · ready in Analytics`;
    }
    if (sales > 0) {
      return `${rows.toLocaleString()} rows synced from ${sales.toLocaleString()} sales · ready in Analytics`;
    }
    return `${rows.toLocaleString()} rows synced · ready in Analytics`;
  }
  return "Not synced to Analytics yet";
}

function normaliseColumnLabels(
  value: SavedApiTable["column_labels"],
): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, label] of Object.entries(value)) {
    if (typeof label === "string" && label.trim()) {
      next[key] = label.trim();
    }
  }
  return next;
}

function resolveColumnLabel(
  key: string,
  labels: Record<string, string>,
  calculatedColumns: CalculatedColumn[],
): string {
  if (labels[key]) return labels[key];
  const calc = getCalculatedColumn(key, calculatedColumns);
  if (calc) return calc.label;
  return getSalesField(key)?.label || key;
}

function resolveColumnFormat(
  key: string,
  calculatedColumns: CalculatedColumn[],
): TableBuilderFieldFormat | undefined {
  const calc = getCalculatedColumn(key, calculatedColumns);
  if (calc) return calc.format;
  return getSalesField(key)?.format;
}

function ColumnTypeIcon({ type }: { type: TableBuilderFieldType }) {
  if (type === "date") {
    return <span className="w-6 shrink-0 text-center font-mono text-[9px] text-gray-400">DATE</span>;
  }
  return (
    <span className="w-6 shrink-0 text-center font-mono text-[9px] font-medium leading-none text-gray-400">
      {type === "number" ? "123" : type === "boolean" ? "Y/N" : "ABC"}
    </span>
  );
}

function formatCell(
  value: string | number | boolean | null,
  field?: TableBuilderField,
  formatOverride?: TableBuilderFieldFormat,
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const format = formatOverride ?? field?.format;
  if (format === "currency" && typeof value === "number") {
    return value.toLocaleString("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
    });
  }
  if (format === "percent" && typeof value === "number") {
    const pct = value <= 1 && value >= -1 ? value * 100 : value;
    return `${pct.toFixed(1)}%`;
  }
  if (field?.type === "date") {
    const d = new Date(String(value));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
  }
  return String(value);
}

export function TableBuilder() {
  const supabase = React.useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const requestedTableId = searchParams.get("table");
  const [tables, setTables] = React.useState<SavedApiTable[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("Sales table");
  const [grain, setGrain] = React.useState<TableBuilderGrain>("sale_line");
  const [columns, setColumns] = React.useState<string[]>([...DEFAULT_SALES_LINE_COLUMNS]);
  const [columnLabels, setColumnLabels] = React.useState<Record<string, string>>({});
  const [calculatedColumns, setCalculatedColumns] = React.useState<CalculatedColumn[]>([]);
  /** Key of the formula column currently edited in the top fx bar. */
  const [activeFormulaKey, setActiveFormulaKey] = React.useState<string | null>(null);
  const [formulaDraft, setFormulaDraft] = React.useState("");
  const [formulaError, setFormulaError] = React.useState<string | null>(null);
  const [editingHeaderKey, setEditingHeaderKey] = React.useState<string | null>(null);
  const [editingHeaderValue, setEditingHeaderValue] = React.useState("");
  const headerInputRef = React.useRef<HTMLInputElement>(null);
  const formulaInputRef = React.useRef<HTMLInputElement>(null);
  const formulaCaretRef = React.useRef(0);
  const headerClickTimerRef = React.useRef<number | null>(null);
  const [search, setSearch] = React.useState("");
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [loadingList, setLoadingList] = React.useState(true);
  const [previewRows, setPreviewRows] = React.useState<TableBuilderPreviewRow[]>([]);
  const [previewMeta, setPreviewMeta] = React.useState<{ sales: number; rows: number } | null>(
    null,
  );
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [syncMessage, setSyncMessage] = React.useState<string | null>(null);
  const [chipHover, setChipHover] = React.useState<{
    tableId: string;
    top: number;
    left: number;
  } | null>(null);
  const [portalReady, setPortalReady] = React.useState(false);
  const skipAutosave = React.useRef(true);
  const dragIndex = React.useRef<number | null>(null);
  const syncLoopId = React.useRef(0);
  const activeIdRef = React.useRef<string | null>(null);
  activeIdRef.current = activeId;

  React.useEffect(() => {
    setPortalReady(true);
  }, []);

  const syncingTable =
    tables.find((table) => table.sync_status === "syncing")
    ?? tables.find((table) => table.id === activeId)
    ?? null;
  const chipHoverTable = chipHover
    ? tables.find((table) => table.id === chipHover.tableId)
    : null;

  const availableFields = React.useMemo(() => getSalesFieldsForGrain(grain), [grain]);
  const selectedSet = React.useMemo(() => new Set(columns), [columns]);

  const filteredGroups = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const fields = q
      ? availableFields.filter(
          (f) =>
            f.label.toLowerCase().includes(q) ||
            f.key.toLowerCase().includes(q) ||
            f.description?.toLowerCase().includes(q) ||
            f.group.toLowerCase().includes(q),
        )
      : availableFields;
    return groupSalesFields(fields);
  }, [availableFields, search]);

  // Load saved tables
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        setLoadingList(false);
        return;
      }

      const { data } = await supabase
        .from("api_builder_tables")
        .select(TABLE_SELECT)
        .eq("source", "sales")
        .order("updated_at", { ascending: false });

      if (cancelled) return;

      const records = (data ?? []) as SavedApiTable[];
      setTables(records);

      const fromQuery = requestedTableId
        ? records.find((table) => table.id === requestedTableId)
        : null;
      if (fromQuery) {
        applyTable(fromQuery);
      } else if (records[0]) {
        applyTable(records[0]);
      } else {
        skipAutosave.current = true;
      }
      setLoadingList(false);

      // Sync state lives on the shared raw store, not on tables.
      const { data: sourceState } = await supabase
        .from("api_builder_source_state")
        .select(
          "sync_status, sync_kind, sync_cursor, sync_sales_fetched, sync_row_count, last_synced_at, sync_error",
        )
        .eq("source", "sales")
        .maybeSingle();
      if (cancelled) return;

      if (sourceState) {
        const statePatch: Partial<SavedApiTable> = {
          sync_status: sourceState.sync_status as SavedApiTable["sync_status"],
          sync_kind: sourceState.sync_kind as SavedApiTable["sync_kind"],
          sync_cursor: sourceState.sync_cursor,
          sync_sales_fetched: sourceState.sync_sales_fetched,
          sync_row_count: sourceState.sync_row_count,
          last_synced_at: sourceState.last_synced_at,
          sync_error: sourceState.sync_error,
        };
        setTables((prev) => prev.map((table) => ({ ...table, ...statePatch })));
        const active =
          records.find((table) => table.id === activeIdRef.current) ?? records[0];
        if (active) setSyncMessage(formatSyncProgress({ ...active, ...statePatch }));

        // Resume any in-progress background sync left mid-cursor.
        if (
          sourceState.sync_status === "syncing"
          && sourceState.sync_cursor?.trim()
          && records[0]
        ) {
          void runSyncLoop(records[0].id, { resume: true });
        }
      }
    })();
    return () => {
      cancelled = true;
      syncLoopId.current += 1;
    };
    // runSyncLoop is stable enough for mount resume; intentional once-per-load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, requestedTableId]);

  function applyTable(table: SavedApiTable) {
    skipAutosave.current = true;
    setActiveId(table.id);
    setName(table.name);
    setGrain(table.grain);
    const calcs = normaliseCalculatedColumns(table.calculated_columns);
    const calcKeys = new Set(calcs.map((col) => col.key));
    const cols = Array.isArray(table.columns)
      ? table.columns
          .map(String)
          .filter((k) => !!getSalesField(k) || calcKeys.has(k))
      : [];
    setColumns(
      cols.length > 0
        ? cols
        : table.grain === "sale"
          ? [...DEFAULT_SALES_COLUMNS]
          : [...DEFAULT_SALES_LINE_COLUMNS],
    );
    setColumnLabels(normaliseColumnLabels(table.column_labels));
    setCalculatedColumns(calcs);
    setActiveFormulaKey(null);
    setFormulaDraft("");
    setFormulaError(null);
    setEditingHeaderKey(null);
    setEditingHeaderValue("");
    setSaveState("saved");
    setSyncMessage(formatSyncProgress(table));
  }

  // Sync state describes the SHARED raw store, so every table shows it.
  function patchTableSync(
    tableId: string,
    patch: Partial<SavedApiTable>,
  ) {
    setTables((prev) => {
      const next = prev.map((table) => ({ ...table, ...patch }));
      const updated =
        next.find((table) => table.id === activeIdRef.current) ?? next[0];
      if (updated) {
        setSyncMessage(formatSyncProgress(updated));
      }
      return next;
    });
  }

  async function runSyncLoop(
    tableId: string,
    options?: { resume?: boolean; full?: boolean },
  ) {
    const loopId = ++syncLoopId.current;
    setSyncing(true);
    setSyncMessage(
      options?.resume
        ? "Resuming sync from Lightspeed…"
        : options?.full
          ? "Rebuilding table from Lightspeed…"
          : "Refreshing from Lightspeed…",
    );
    patchTableSync(tableId, {
      sync_status: "syncing",
      sync_error: null,
      // Only a forced rebuild is known to start from zero; auto mode may
      // resolve to an incremental refresh that keeps the stored rows.
      ...(options?.full
        ? { sync_row_count: 0, sync_sales_fetched: 0, sync_cursor: null }
        : {}),
    });

    const result = await runApiBuilderSyncLoop({
      tableId,
      maxPages: SYNC_CHUNK_PAGES,
      mode: options?.full ? "full" : "auto",
      shouldContinue: () => syncLoopId.current === loopId,
      onProgress: (message, chunk) => {
        if (syncLoopId.current !== loopId) return;
        if (chunk.throttled) {
          if (tableId === activeIdRef.current) setSyncMessage(message);
          patchTableSync(tableId, {
            sync_status: "syncing",
            sync_error: null,
          });
          return;
        }
        patchTableSync(tableId, {
          sync_status: chunk.complete ? "ready" : "syncing",
          ...(chunk.syncKind ? { sync_kind: chunk.syncKind } : {}),
          sync_row_count: chunk.rowsUpserted,
          sync_sales_fetched: chunk.salesFetched,
          sync_cursor: chunk.complete ? null : chunk.nextCursor ?? null,
          last_synced_at: new Date().toISOString(),
          sync_error: null,
        });
        if (tableId === activeIdRef.current) {
          setSyncMessage(chunk.complete ? "Sync complete" : message);
        }
      },
    });

    if (syncLoopId.current !== loopId) return;

    if (!result.ok) {
      patchTableSync(tableId, {
        sync_status: "error",
        sync_error: result.error,
      });
      if (tableId === activeIdRef.current) {
        setSyncMessage(result.error);
      }
    }

    setSyncing(false);
  }

  React.useEffect(() => {
    if (editingHeaderKey) headerInputRef.current?.focus();
  }, [editingHeaderKey]);

  React.useEffect(() => {
    return () => {
      if (headerClickTimerRef.current != null) {
        window.clearTimeout(headerClickTimerRef.current);
      }
    };
  }, []);

  function startHeaderRename(key: string, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (headerClickTimerRef.current != null) {
      window.clearTimeout(headerClickTimerRef.current);
      headerClickTimerRef.current = null;
    }
    setEditingHeaderKey(key);
    setEditingHeaderValue(resolveColumnLabel(key, columnLabels, calculatedColumns));
  }

  function handleHeaderClick(key: string, isCalc: boolean) {
    if (!isCalc || editingHeaderKey === key) return;
    // Delay formula open so a double-click can win and start rename instead.
    if (headerClickTimerRef.current != null) {
      window.clearTimeout(headerClickTimerRef.current);
    }
    headerClickTimerRef.current = window.setTimeout(() => {
      headerClickTimerRef.current = null;
      openEditFormula(key);
    }, 280);
  }

  function commitHeaderRename() {
    if (!editingHeaderKey) return;
    const key = editingHeaderKey;
    const nextLabel = editingHeaderValue.trim();
    if (isCalculatedColumnKey(key)) {
      if (nextLabel) {
        setCalculatedColumns((prev) =>
          prev.map((col) => (col.key === key ? { ...col, label: nextLabel } : col)),
        );
      }
      setColumnLabels((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      const defaultLabel = getSalesField(key)?.label ?? key;
      setColumnLabels((prev) => {
        const next = { ...prev };
        if (!nextLabel || nextLabel === defaultLabel) {
          delete next[key];
        } else {
          next[key] = nextLabel;
        }
        return next;
      });
    }
    setEditingHeaderKey(null);
    setEditingHeaderValue("");
  }

  function cancelHeaderRename() {
    setEditingHeaderKey(null);
    setEditingHeaderValue("");
  }

  async function syncToAnalytics() {
    if (!activeId) {
      setSyncMessage("Save the table first, then sync.");
      return;
    }
    await runSyncLoop(activeId, {});
  }

  // When grain changes, drop incompatible columns and invalid formulas
  React.useEffect(() => {
    const allowed = new Set(getSalesFieldsForGrain(grain).map((f) => f.key));
    // Keep empty draft formulas; drop only authored formulas that no longer parse.
    const nextCalcs = calculatedColumns.filter(
      (col) =>
        !col.expression.trim()
        || parseCalculatedFormula(col.expression, grain, {
          calculatedColumns,
          selfKey: col.key,
        }).ok,
    );
    const calcKeys = new Set(nextCalcs.map((col) => col.key));
    setCalculatedColumns((prev) =>
      nextCalcs.length === prev.length
      && nextCalcs.every((col, index) => col.key === prev[index]?.key)
        ? prev
        : nextCalcs,
    );
    setColumns((prev) => {
      const next = prev.filter((k) => allowed.has(k) || calcKeys.has(k));
      if (next.length === prev.length) return prev;
      if (next.length > 0) return next;
      return grain === "sale"
        ? [...DEFAULT_SALES_COLUMNS]
        : [...DEFAULT_SALES_LINE_COLUMNS];
    });
    setActiveFormulaKey((current) =>
      current && !calcKeys.has(current) ? null : current,
    );
    // Only re-filter when grain changes; calculatedColumns is read from the latest render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grain]);

  // Autosave
  React.useEffect(() => {
    if (!activeId) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    setSaveState("saving");
    const timer = window.setTimeout(async () => {
      const labelsForColumns = Object.fromEntries(
        Object.entries(columnLabels).filter(([key]) => columns.includes(key)),
      );
      const calcsToSave = normaliseCalculatedColumns(calculatedColumns);
      const { error } = await supabase
        .from("api_builder_tables")
        .update({
          name: name.trim() || "Untitled table",
          grain,
          columns,
          column_labels: labelsForColumns,
          calculated_columns: calcsToSave,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeId);

      if (error) {
        console.error("[table-builder] save failed", error);
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      setTables((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? {
                ...t,
                name: name.trim() || "Untitled table",
                grain,
                columns,
                column_labels: labelsForColumns,
                calculated_columns: calcsToSave,
                updated_at: new Date().toISOString(),
              }
            : t,
        ),
      );
    }, 800);
    return () => window.clearTimeout(timer);
  }, [activeId, name, grain, columns, columnLabels, calculatedColumns, supabase]);

  async function createTable(options?: { asBlank?: boolean }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const starterColumns =
      grain === "sale" ? [...DEFAULT_SALES_COLUMNS] : [...DEFAULT_SALES_LINE_COLUMNS];
    const nextColumns =
      options?.asBlank || columns.length === 0 ? starterColumns : columns;
    const nextLabels = options?.asBlank
      ? {}
      : Object.fromEntries(
          Object.entries(columnLabels).filter(([key]) => nextColumns.includes(key)),
        );
    const nextCalcs = options?.asBlank
      ? []
      : normaliseCalculatedColumns(calculatedColumns).filter((col) =>
          nextColumns.includes(col.key),
        );
    const nextName = options?.asBlank ? "Sales table" : name.trim() || "Sales table";

    const { data, error } = await supabase
      .from("api_builder_tables")
      .insert({
        user_id: user.id,
        name: nextName,
        source: "sales",
        grain,
        columns: nextColumns,
        column_labels: nextLabels,
        calculated_columns: nextCalcs,
      })
      .select(TABLE_SELECT)
      .single();

    if (error || !data) {
      console.error("[table-builder] create failed", error);
      setSaveState("error");
      return;
    }

    const record = data as SavedApiTable;
    setTables((prev) => [record, ...prev]);
    applyTable(record);
    // Top up the shared raw store (full history only on the very first sync).
    void runSyncLoop(record.id, {});
  }

  async function deleteTable(id: string) {
    await supabase.from("api_builder_tables").delete().eq("id", id);
    setTables((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeId === id) {
        if (next[0]) applyTable(next[0]);
        else {
          setActiveId(null);
          setName("Sales table");
          setColumns([...DEFAULT_SALES_LINE_COLUMNS]);
          setColumnLabels({});
          setCalculatedColumns([]);
          setGrain("sale_line");
        }
      }
      return next;
    });
  }

  function toggleColumn(key: string) {
    setColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  const activeFormula = activeFormulaKey
    ? getCalculatedColumn(activeFormulaKey, calculatedColumns)
    : undefined;

  function focusFormulaInput(caret?: number) {
    requestAnimationFrame(() => {
      const el = formulaInputRef.current;
      if (!el) return;
      el.focus();
      const pos = caret ?? el.value.length;
      el.setSelectionRange(pos, pos);
      formulaCaretRef.current = pos;
    });
  }

  /** Create an empty formula column, then open the top fx bar. */
  function openCreateFormula() {
    const existing = new Set([
      ...columns,
      ...calculatedColumns.map((col) => col.key),
    ]);
    const key = slugifyCalculatedKey("Formula", existing);
    const next: CalculatedColumn = {
      key,
      label: "Formula",
      expression: "",
      type: "number",
      format: "currency",
    };
    setCalculatedColumns((prev) => [...prev, next]);
    setColumns((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setActiveFormulaKey(key);
    setFormulaDraft("");
    setFormulaError(null);
    focusFormulaInput(0);
  }

  function openEditFormula(key: string) {
    const calc = getCalculatedColumn(key, calculatedColumns);
    if (!calc) return;
    setActiveFormulaKey(calc.key);
    setFormulaDraft(calc.expression);
    setFormulaError(null);
    focusFormulaInput();
  }

  function insertFormulaColumnRef(label: string) {
    if (!activeFormulaKey) return;
    const insert = `[${label}]`;
    const caret = formulaCaretRef.current;
    const before = formulaDraft.slice(0, caret);
    const after = formulaDraft.slice(caret);
    const next = `${before}${insert}${after}`;
    const nextCaret = before.length + insert.length;
    setFormulaDraft(next);
    setFormulaError(null);
    formulaCaretRef.current = nextCaret;
    focusFormulaInput(nextCaret);
  }

  function applyFormulaPreset(preset: {
    label: string;
    expression: string;
    format: TableBuilderFieldFormat;
  }) {
    if (!activeFormulaKey) return;
    setFormulaDraft(preset.expression);
    setCalculatedColumns((prev) =>
      prev.map((col) =>
        col.key === activeFormulaKey
          ? {
              ...col,
              label: col.label === "Formula" || !col.label.trim() ? preset.label : col.label,
              format: preset.format,
            }
          : col,
      ),
    );
    setFormulaError(null);
    focusFormulaInput(preset.expression.length);
  }

  function commitFormulaDraft() {
    if (!activeFormulaKey) return;
    const calc = getCalculatedColumn(activeFormulaKey, calculatedColumns);
    if (!calc) return;

    const parsed = parseCalculatedFormula(formulaDraft, grain, {
      calculatedColumns,
      selfKey: activeFormulaKey,
    });
    if (!parsed.ok) {
      setFormulaError(parsed.error);
      return;
    }

    const nextCalcs = calculatedColumns.map((col) =>
      col.key === activeFormulaKey
        ? { ...col, expression: parsed.expression, type: "number" as const }
        : col,
    );
    if (hasCalculatedColumnCycle(nextCalcs, grain)) {
      setFormulaError(
        "Circular formula reference detected. A formula cannot depend on itself through other formulas.",
      );
      return;
    }

    setCalculatedColumns((prev) =>
      prev.map((col) =>
        col.key === activeFormulaKey
          ? { ...col, expression: parsed.expression, type: "number" }
          : col,
      ),
    );
    setFormulaDraft(parsed.expression);
    setFormulaError(null);
  }

  function cancelFormulaEditing() {
    if (!activeFormulaKey) return;
    const calc = getCalculatedColumn(activeFormulaKey, calculatedColumns);
    if (calc && !calc.expression.trim() && !formulaDraft.trim()) {
      // Discard empty draft column.
      removeCalculatedColumn(activeFormulaKey);
    } else if (calc) {
      setFormulaDraft(calc.expression);
    }
    setActiveFormulaKey(null);
    setFormulaError(null);
  }

  function setActiveFormulaFormat(format: TableBuilderFieldFormat) {
    if (!activeFormulaKey) return;
    setCalculatedColumns((prev) =>
      prev.map((col) => (col.key === activeFormulaKey ? { ...col, format } : col)),
    );
  }

  function removeCalculatedColumn(key: string) {
    if (activeFormulaKey === key) {
      setActiveFormulaKey(null);
      setFormulaDraft("");
      setFormulaError(null);
    }
    setCalculatedColumns((prev) => prev.filter((col) => col.key !== key));
    setColumns((prev) => prev.filter((k) => k !== key));
    setColumnLabels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function moveColumn(from: number, to: number) {
    if (to < 0 || to >= columns.length) return;
    setColumns((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function toggleGroup(group: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  }

  async function loadPreview() {
    if (columns.length === 0) {
      setPreviewError("Select at least one column.");
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/store/table-builder/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columns,
          grain,
          calculatedColumns,
          limit: 40,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Preview failed");
      }
      setPreviewRows(data.rows ?? []);
      setPreviewMeta({
        sales: data.fetchedSales ?? 0,
        rows: data.fetchedRows ?? 0,
      });
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
      setPreviewRows([]);
      setPreviewMeta(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  // Auto-preview when columns/grain settle
  React.useEffect(() => {
    if (columns.length === 0) return;
    const timer = window.setTimeout(() => {
      void loadPreview();
    }, 500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.join("|"), grain, JSON.stringify(calculatedColumns)]);

  if (loadingList) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        Loading tables…
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          {(
            [
              { key: "sale_line" as const, label: "Sale lines" },
              { key: "sale" as const, label: "Sales" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setGrain(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                grain === tab.key
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-8 max-w-xs text-sm"
          placeholder="Table name"
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "error"
                  ? "Save failed"
                  : activeId
                    ? ""
                    : "Not saved"}
          </span>
          {!activeId ? (
            <Button type="button" size="sm" onClick={() => void createTable()}>
              <Plus className="h-3.5 w-3.5" />
              Save table
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void createTable({ asBlank: true })}
            >
              <Plus className="h-3.5 w-3.5" />
              New table
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadPreview()}
            disabled={previewLoading || columns.length === 0}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", previewLoading && "animate-spin")} />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void syncToAnalytics()}
            disabled={syncing || !activeId || columns.length === 0}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            Sync to Analytics
          </Button>
        </div>
      </div>
      {syncMessage ? (
        <div className="relative shrink-0 overflow-hidden border-b border-gray-100 bg-white px-4 py-2 text-xs text-gray-600">
          {syncing ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-gray-100 to-transparent"
              initial={{ x: "-100%" }}
              animate={{ x: "400%" }}
              transition={{ duration: 1.4, ease: "linear", repeat: Infinity }}
            />
          ) : null}
          <div className="relative flex items-center gap-2">
            {syncing ? (
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-500" />
            ) : null}
            <span className={cn(syncing && "text-gray-700")}>{syncMessage}</span>
            {syncing ? (
              <span className="ml-auto hidden text-[11px] text-gray-400 sm:inline">
                Continuing in the background
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Formula bar — appears when a formula column is selected */}
      {activeFormulaKey ? (
        <div className="shrink-0 border-b border-gray-200 bg-white px-3 py-1.5">
          <div className="flex items-center gap-2">
            <span className="select-none px-1 font-serif text-sm italic text-gray-400">
              fx
            </span>
            <input
              ref={formulaInputRef}
              type="text"
              value={formulaDraft}
              spellCheck={false}
              placeholder="Click columns below, or type [Line subtotal] - [Line average cost]"
              onChange={(event) => {
                setFormulaDraft(event.target.value);
                formulaCaretRef.current =
                  event.target.selectionStart ?? event.target.value.length;
                setFormulaError(null);
              }}
              onClick={(event) => {
                formulaCaretRef.current =
                  event.currentTarget.selectionStart ?? formulaDraft.length;
              }}
              onKeyUp={(event) => {
                formulaCaretRef.current =
                  event.currentTarget.selectionStart ?? formulaDraft.length;
              }}
              onSelect={(event) => {
                formulaCaretRef.current =
                  event.currentTarget.selectionStart ?? formulaDraft.length;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitFormulaDraft();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelFormulaEditing();
                }
              }}
              className={cn(
                "h-8 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2.5 font-mono text-xs text-gray-800 outline-none",
                "placeholder:text-gray-400 focus:border-gray-300",
                formulaError && "border-red-300 focus:border-red-400",
              )}
            />
            <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
              {(
                [
                  { key: "currency" as const, label: "$" },
                  { key: "percent" as const, label: "%" },
                  { key: "number" as const, label: "123" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveFormulaFormat(tab.key)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                    (activeFormula?.format ?? "currency") === tab.key
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                  title={
                    tab.key === "currency"
                      ? "Currency"
                      : tab.key === "percent"
                        ? "Percent"
                        : "Number"
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 px-2.5 text-xs"
              onClick={commitFormulaDraft}
            >
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0 px-2 text-xs text-gray-500"
              onClick={cancelFormulaEditing}
            >
              Done
            </Button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {formulaPresets(grain).map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyFormulaPreset(preset)}
                className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
                title={preset.description}
              >
                {preset.label}
              </button>
            ))}
            <span className="mx-1 text-[11px] text-gray-300">|</span>
            <span className="text-[11px] text-gray-400">Click a field or formula to insert:</span>
            {formulaColumnRefs(grain, {
              calculatedColumns,
              selfKey: activeFormulaKey ?? undefined,
            })
              .slice(0, 16)
              .map((ref) => (
              <button
                key={ref.key}
                type="button"
                onClick={() => insertFormulaColumnRef(ref.label)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-100",
                  isCalculatedColumnKey(ref.key) ? "bg-gray-100" : "bg-gray-50",
                )}
              >
                {isCalculatedColumnKey(ref.key) ? (
                  <span className="mr-0.5 font-serif italic text-gray-400">fx</span>
                ) : null}
                [{ref.label}]
              </button>
            ))}
          </div>
          {formulaError ? (
            <div className="mt-1.5 rounded-xl bg-white px-2.5 py-1.5 text-[11px] text-red-600">
              {formulaError}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-gray-400">
              Enter to apply · Esc to finish · click number fields or other formulas to insert
            </p>
          )}
        </div>
      ) : null}

      {/* Saved tables strip */}
      {tables.length > 0 ? (
        <div className="relative z-40 flex shrink-0 gap-1.5 overflow-x-auto border-b border-gray-100 px-4 py-2">
          {tables.map((table) => {
            const tableSyncing = table.sync_status === "syncing";
            return (
              <button
                key={table.id}
                type="button"
                onClick={() => applyTable(table)}
                onMouseEnter={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setChipHover({
                    tableId: table.id,
                    top: rect.bottom + 8,
                    left: rect.left + rect.width / 2,
                  });
                }}
                onMouseLeave={() => setChipHover(null)}
                className={cn(
                  "group relative flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                  activeId === table.id
                    ? "border-gray-300 bg-white text-gray-900 shadow-sm"
                    : "border-transparent bg-gray-50 text-gray-600 hover:bg-gray-100",
                )}
              >
                {tableSyncing ? (
                  <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-gray-400" />
                ) : null}
                <span className="truncate">{table.name}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteTable(table.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      void deleteTable(table.id);
                    }
                  }}
                  className="rounded-md p-0.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Sync progress floats above the table (portaled so overflow cannot clip it). */}
      {portalReady
        ? createPortal(
            <>
              <AnimatePresence>
                {syncing ? (
                  <motion.div
                    key="sync-float"
                    initial={{ opacity: 0, y: 12, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="pointer-events-none fixed bottom-5 right-5 z-[200] w-[min(320px,calc(100vw-2rem))] rounded-xl bg-white px-3.5 py-3 shadow-lg ring-1 ring-gray-200"
                  >
                    <div className="flex items-start gap-2.5">
                      <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-gray-500" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800">
                          Syncing in the background
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-600">
                          {syncMessage
                            || formatSyncProgress(
                              syncingTable ?? {
                                sync_status: "syncing",
                                sync_row_count: 0,
                                sync_sales_fetched: 0,
                              },
                            )}
                        </p>
                        {syncingTable?.sync_status === "syncing" ? (
                          <p className="mt-1 text-[11px] text-gray-400">
                            {(syncingTable.sync_row_count ?? 0).toLocaleString()} rows done
                            {(syncingTable.sync_sales_fetched ?? 0) > 0
                              ? ` · ${(syncingTable.sync_sales_fetched ?? 0).toLocaleString()} sales`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <AnimatePresence>
                {chipHover && chipHoverTable ? (
                  <motion.div
                    key={`chip-hover-${chipHover.tableId}`}
                    initial={{ opacity: 0, y: 4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 2, scale: 0.95 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="pointer-events-none fixed z-[210] w-max max-w-[260px] -translate-x-1/2 rounded-xl bg-white px-2.5 py-1.5 text-left text-[11px] font-normal text-gray-600 shadow-lg ring-1 ring-gray-200"
                    style={{ top: chipHover.top, left: chipHover.left }}
                  >
                    {formatSyncProgress(chipHoverTable)}
                    {chipHoverTable.sync_status === "syncing" ? (
                      <span className="mt-0.5 block text-gray-400">
                        {(chipHoverTable.sync_row_count ?? 0).toLocaleString()} rows done
                      </span>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </>,
            document.body,
          )
        : null}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Field picker — pinned far right */}
        <div className="order-3 flex h-full w-[280px] shrink-0 flex-col border-l border-gray-100 bg-white">
          <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
            <p className="text-xs font-medium text-gray-800">Lightspeed sales fields</p>
            <p className="mt-0.5 text-[11px] text-gray-500">
              {activeFormulaKey
                ? "Click a number field or another formula column to insert it"
                : `${availableFields.length} fields from the Sale API`}
            </p>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search fields…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filteredGroups.map(({ group, fields }) => {
              const open = !collapsedGroups.has(group);
              return (
                <div key={group} className="border-b border-gray-50">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group)}
                    className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 text-gray-400 transition-transform duration-200",
                        open && "rotate-180",
                      )}
                    />
                    {group}
                    <span className="ml-auto text-[10px] text-gray-400">{fields.length}</span>
                  </button>
                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          duration: 0.4,
                          ease: [0.04, 0.62, 0.23, 0.98],
                        }}
                        className="overflow-hidden"
                      >
                        <ul className="pb-1">
                          {fields.map((field) => {
                            const checked = selectedSet.has(field.key);
                            const canInsert =
                              Boolean(activeFormulaKey) && field.type === "number";
                            return (
                              <li key={field.key}>
                                {canInsert ? (
                                  <button
                                    type="button"
                                    onClick={() => insertFormulaColumnRef(field.label)}
                                    className={cn(
                                      "flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-gray-50",
                                      "ring-0",
                                    )}
                                    title={`Insert [${field.label}] into formula`}
                                  >
                                    <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border border-dashed border-gray-300 text-[9px] text-gray-400">
                                      +
                                    </span>
                                    <ColumnTypeIcon type={field.type} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-xs font-medium text-gray-800">
                                        {field.label}
                                      </span>
                                      <span className="block truncate font-mono text-[10px] text-gray-400">
                                        Click to insert
                                      </span>
                                    </span>
                                  </button>
                                ) : (
                                  <label
                                    className={cn(
                                      "flex cursor-pointer items-start gap-2 px-3 py-1.5 hover:bg-gray-50",
                                      checked && "bg-gray-50/80",
                                      activeFormulaKey && field.type !== "number" && "opacity-50",
                                    )}
                                    title={field.description || field.key}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleColumn(field.key)}
                                      disabled={Boolean(activeFormulaKey)}
                                      className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300"
                                    />
                                    <ColumnTypeIcon type={field.type} />
                                    <span className="min-w-0 flex-1">
                                      <span className="block text-xs font-medium text-gray-800">
                                        {field.label}
                                      </span>
                                      <span className="block truncate font-mono text-[10px] text-gray-400">
                                        {field.key}
                                      </span>
                                    </span>
                                  </label>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected columns — pinned middle-right */}
        <div className="order-2 flex h-full w-[220px] shrink-0 flex-col border-l border-gray-100 bg-white">
          <div className="shrink-0 border-b border-gray-100 px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-gray-800">Columns</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {columns.length} selected · drag to reorder
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={openCreateFormula}
              >
                <Plus className="h-3 w-3" />
                Formula
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {columns.length === 0 ? (
              <div className="rounded-md bg-white px-3 py-4 text-center text-xs text-gray-500">
                Tick fields on the right to add columns, or add a formula metric.
              </div>
            ) : (
              <ul className="space-y-1">
                {columns.map((key, index) => {
                  const isCalc = isCalculatedColumnKey(key);
                  const calc = isCalc
                    ? getCalculatedColumn(key, calculatedColumns)
                    : undefined;
                  const isEmptyFormula = Boolean(isCalc && !calc?.expression?.trim());
                  const isActiveFormula = activeFormulaKey === key;
                  return (
                    <li
                      key={key}
                      draggable
                      onDragStart={() => {
                        dragIndex.current = index;
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex.current === null) return;
                        moveColumn(dragIndex.current, index);
                        dragIndex.current = null;
                      }}
                      onClick={() => {
                        if (
                          activeFormulaKey
                          && isCalc
                          && key !== activeFormulaKey
                          && calc?.expression?.trim()
                        ) {
                          insertFormulaColumnRef(
                            resolveColumnLabel(key, columnLabels, calculatedColumns),
                          );
                          return;
                        }
                        if (isCalc) {
                          openEditFormula(key);
                          return;
                        }
                        if (activeFormulaKey) {
                          const field = getSalesField(key);
                          if (field?.type === "number") {
                            insertFormulaColumnRef(
                              resolveColumnLabel(key, columnLabels, calculatedColumns),
                            );
                          }
                        }
                      }}
                      className={cn(
                        "flex items-center gap-1 rounded-md border px-1.5 py-1.5 text-xs shadow-sm",
                        isActiveFormula
                          ? "border-gray-300 bg-gray-50 ring-1 ring-gray-200"
                          : "border-gray-100 bg-white",
                        (
                          isCalc
                          || (activeFormulaKey && getSalesField(key)?.type === "number")
                          || (
                            activeFormulaKey
                            && isCalc
                            && key !== activeFormulaKey
                            && Boolean(calc?.expression?.trim())
                          )
                        )
                          && "cursor-pointer",
                        isEmptyFormula && !isActiveFormula && "border-dashed",
                      )}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-gray-300" />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate font-medium",
                          isEmptyFormula ? "text-gray-400" : "text-gray-800",
                        )}
                      >
                        {isCalc ? (
                          <span className="mr-1 font-serif italic text-gray-400">fx</span>
                        ) : null}
                        {resolveColumnLabel(key, columnLabels, calculatedColumns)}
                        {isEmptyFormula ? (
                          <span className="ml-1 font-normal text-gray-300">· empty</span>
                        ) : null}
                      </span>
                      {isCalc ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditFormula(key);
                          }}
                          className="rounded-md p-0.5 text-gray-300 hover:bg-gray-50 hover:text-gray-600"
                          title="Edit formula"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          isCalc ? removeCalculatedColumn(key) : toggleColumn(key);
                        }}
                        className="rounded-md p-0.5 text-gray-300 hover:bg-gray-50 hover:text-gray-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Live preview — fills remaining space; scrolls horizontally */}
        <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <div>
              <p className="text-xs font-medium text-gray-800">Live preview</p>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {previewMeta
                  ? `${previewMeta.rows} rows from ${previewMeta.sales} recent sales`
                  : "Pulls completed sales from Lightspeed in real time"}
              </p>
            </div>
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
            {previewError ? (
              <div className="m-4 rounded-md bg-white px-4 py-3 text-sm text-gray-700 shadow-sm ring-1 ring-gray-100">
                {previewError}
              </div>
            ) : null}

            {previewLoading && previewRows.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                Loading sales…
              </div>
            ) : columns.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-500">
                Select columns to preview data.
              </div>
            ) : (
              <table className="min-w-max border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    {columns.map((key) => {
                      const label = resolveColumnLabel(
                        key,
                        columnLabels,
                        calculatedColumns,
                      );
                      const isEditing = editingHeaderKey === key;
                      const isCalc = isCalculatedColumnKey(key);
                      const calc = isCalc
                        ? getCalculatedColumn(key, calculatedColumns)
                        : undefined;
                      const isEmptyFormula = Boolean(isCalc && !calc?.expression?.trim());
                      const isActiveFormula = activeFormulaKey === key;
                      return (
                        <th
                          key={key}
                          className={cn(
                            "whitespace-nowrap border-b border-gray-100 px-3 py-2 font-medium text-gray-600",
                            isCalc ? "cursor-pointer" : "cursor-text",
                            isActiveFormula && "bg-gray-100 text-gray-800",
                            isEmptyFormula && "italic text-gray-400",
                          )}
                          title={
                            isCalc
                              ? "Click to edit formula · double-click to rename"
                              : "Double-click to rename"
                          }
                          onClick={() => handleHeaderClick(key, isCalc)}
                          onDoubleClick={(event) => startHeaderRename(key, event)}
                        >
                          {isEditing ? (
                            <input
                              ref={headerInputRef}
                              value={editingHeaderValue}
                              onChange={(event) => setEditingHeaderValue(event.target.value)}
                              onBlur={commitHeaderRename}
                              onClick={(event) => event.stopPropagation()}
                              onMouseDown={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitHeaderRename();
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelHeaderRename();
                                }
                              }}
                              className="h-6 w-full min-w-[5rem] rounded-md border border-gray-300 bg-white px-1.5 text-xs font-medium text-gray-800 outline-none ring-0 focus:border-gray-400"
                            />
                          ) : (
                            <>
                              {isCalc ? (
                                <span className="mr-1 font-serif italic text-gray-400">
                                  fx
                                </span>
                              ) : null}
                              {label}
                            </>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="hover:bg-gray-50/80">
                      {columns.map((key) => {
                        const field = getSalesField(key);
                        const isCalc = isCalculatedColumnKey(key);
                        const calc = isCalc
                          ? getCalculatedColumn(key, calculatedColumns)
                          : undefined;
                        const isEmptyFormula = Boolean(
                          isCalc && !calc?.expression?.trim(),
                        );
                        const isActiveFormula = activeFormulaKey === key;
                        return (
                          <td
                            key={key}
                            onClick={() => {
                              if (isCalc) openEditFormula(key);
                            }}
                            className={cn(
                              "whitespace-nowrap border-b border-gray-50 px-3 py-1.5 text-gray-800",
                              isCalc && "cursor-pointer",
                              isActiveFormula && "bg-gray-50/80",
                              isEmptyFormula && "text-gray-300",
                            )}
                          >
                            {isEmptyFormula
                              ? ""
                              : formatCell(
                                  row[key] ?? null,
                                  field,
                                  resolveColumnFormat(key, calculatedColumns),
                                )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {previewRows.length === 0 && !previewLoading ? (
                    <tr>
                      <td
                        colSpan={Math.max(columns.length, 1)}
                        className="px-3 py-10 text-center text-gray-500"
                      >
                        No completed sales returned.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
