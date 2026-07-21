"use client";

import * as React from "react";
import ReactGridLayout from "react-grid-layout/legacy";
import type { Layout, LayoutItem } from "react-grid-layout";
import type { SplitDropIntent } from "./split-drop";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileSpreadsheet,
  GripVertical,
  LayoutGrid,
  LineChart,
  Loader2,
  Filter,
  MoreHorizontal,
  Plus,
  Pencil,
  Table2,
  Trash2,
  TrendingUp,
  Type,
} from "@/components/layout/app-sidebar/dashboard-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  analyticsSourceFromApiTable,
  isCustomAnalyticsSource,
  type AnalyticsSource,
} from "@/lib/analytics-studio/catalog";
import { measureToFormula, parseMeasureFormula } from "@/lib/analytics-studio/formula";
import {
  measureAlias,
  type AnalyticsPage,
  type AnalyticsVizType,
  type AnalyticsWorkbookElement,
  type AnalyticsWorkbookRecord,
} from "@/lib/analytics-studio/types";
import { measureFormat, measureLabel } from "@/lib/analytics-studio/payload";
import type { VisualValueFormat } from "@/lib/genie/visual-format";
import type { SavedApiTable } from "@/lib/table-builder/types";
import {
  ANALYTICS_GRID_ROW_PX,
  createElement,
  createElementFromSource,
  createPage,
  duplicateElement,
  normalizeElementLayout,
  VIZ_LABELS,
} from "./constants";
import { ElementEditor, VIZ_ICONS } from "./element-editor";
import { ElementRenderer } from "./element-renderer";
import { ElementFiltersControlsMenu } from "./element-filters-controls";
import { analyticsFontClassName } from "./analytics-fonts";
import { FormulaBar } from "./formula-bar";
import { MeasureFormatButtons } from "./measure-value-type";
import {
  applyHorizontalSplit,
  clientPointToGrid,
  findSplitDropIntent,
  gridRectToPixels,
  snapshotLayouts,
  type LayoutSnapshot,
} from "./split-drop";
import { useElementData } from "./use-element-data";

import "react-grid-layout/css/styles.css";
import "./analytics-studio-grid.css";

const RESIZE_HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;

const GRID_COLS = 12;
const ROW_HEIGHT = ANALYTICS_GRID_ROW_PX;
const GRID_MARGIN: [number, number] = [10, 6];
const GRID_PADDING: [number, number] = [2, 2];
const PANEL_WIDTH = 340;

function eventClientPoint(event: Event | null | undefined): { x: number; y: number } | null {
  if (!event) return null;
  if (typeof MouseEvent !== "undefined" && event instanceof MouseEvent) {
    return { x: event.clientX, y: event.clientY };
  }
  if (typeof TouchEvent !== "undefined" && event instanceof TouchEvent) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    if (touch) return { x: touch.clientX, y: touch.clientY };
  }
  const maybe = event as { clientX?: number; clientY?: number };
  if (typeof maybe.clientX === "number" && typeof maybe.clientY === "number") {
    return { x: maybe.clientX, y: maybe.clientY };
  }
  return null;
}

const ADD_BUTTONS: Array<{
  viz: AnalyticsVizType;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { viz: "table", icon: Table2 },
  { viz: "pivot", icon: LayoutGrid },
  { viz: "bar", icon: BarChart3 },
  { viz: "line", icon: LineChart },
  { viz: "metric", icon: TrendingUp },
  { viz: "text", icon: Type },
];

type SaveState = "loading" | "saved" | "saving" | "dirty" | "error";

function nextRowY(elements: AnalyticsWorkbookElement[]): number {
  return elements.reduce((max, element) => Math.max(max, element.layout.y + element.layout.h), 0);
}

function coerceElements(value: unknown): AnalyticsWorkbookElement[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (element): element is AnalyticsWorkbookElement =>
        Boolean(element) && typeof element === "object" && "id" in element && "query" in element,
    )
    .map((element) => ({
      ...element,
      layout: normalizeElementLayout(element.layout ?? { x: 0, y: 0, w: 6, h: 4 }),
    }));
}

/** Reads pages from a workbook row, upgrading legacy single-canvas workbooks. */
function coercePages(pagesValue: unknown, legacyElements: unknown): AnalyticsPage[] {
  if (Array.isArray(pagesValue) && pagesValue.length > 0) {
    return pagesValue
      .filter(
        (page): page is Record<string, unknown> =>
          Boolean(page) && typeof page === "object" && "id" in page,
      )
      .map((page) => ({
        id: String(page.id),
        name: typeof page.name === "string" && page.name.trim() ? page.name : "Page",
        elements: coerceElements(page.elements),
      }));
  }
  return [createPage("Page 1", coerceElements(legacyElements))];
}

export function AnalyticsStudio() {
  const supabase = React.useMemo(() => createClient(), []);

  const [workbooks, setWorkbooks] = React.useState<AnalyticsWorkbookRecord[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [pages, setPages] = React.useState<AnalyticsPage[]>([]);
  const [activePageId, setActivePageId] = React.useState<string | null>(null);
  const [renamingPageId, setRenamingPageId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const [name, setName] = React.useState("");
  const [renamingWorkbook, setRenamingWorkbook] = React.useState(false);
  const [workbookRenameDraft, setWorkbookRenameDraft] = React.useState("");
  const workbookRenameRef = React.useRef<HTMLInputElement>(null);
  const [selectedElementId, setSelectedElementId] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [saveState, setSaveState] = React.useState<SaveState>("loading");
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [gridWidth, setGridWidth] = React.useState(1200);
  const [customSources, setCustomSources] = React.useState<AnalyticsSource[]>([]);
  const [addSourceHint, setAddSourceHint] = React.useState<string | null>(null);
  const [selectedMeasureIndex, setSelectedMeasureIndex] = React.useState<number | null>(null);
  const [formulaDraft, setFormulaDraft] = React.useState("");
  const [formulaError, setFormulaError] = React.useState<string | null>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const gridShellRef = React.useRef<HTMLDivElement>(null);
  const skipNextAutosave = React.useRef(true);
  const dragStartSnapshotRef = React.useRef<LayoutSnapshot | null>(null);
  const splitDropRef = React.useRef<SplitDropIntent | null>(null);
  const suppressLayoutUntilRef = React.useRef(0);
  const [dragSnapshot, setDragSnapshot] = React.useState<LayoutSnapshot | null>(null);
  const [splitPreview, setSplitPreview] = React.useState<SplitDropIntent | null>(null);

  /** Undo/redo stacks for canvas edits (format, query, layout commits). */
  const pagesRef = React.useRef(pages);
  pagesRef.current = pages;
  const historyPastRef = React.useRef<AnalyticsPage[][]>([]);
  const historyFutureRef = React.useRef<AnalyticsPage[][]>([]);
  const applyingHistoryRef = React.useRef(false);
  const [historyEpoch, setHistoryEpoch] = React.useState(0);
  const canUndo = historyPastRef.current.length > 0;
  const canRedo = historyFutureRef.current.length > 0;
  void historyEpoch;

  const clearHistory = React.useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    setHistoryEpoch((value) => value + 1);
  }, []);

  const recordHistory = React.useCallback(() => {
    if (applyingHistoryRef.current) return;
    historyPastRef.current = [
      ...historyPastRef.current.slice(-39),
      structuredClone(pagesRef.current),
    ];
    historyFutureRef.current = [];
    setHistoryEpoch((value) => value + 1);
  }, []);

  const handleUndo = React.useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;
    historyFutureRef.current.push(structuredClone(pagesRef.current));
    applyingHistoryRef.current = true;
    setPages(previous);
    setHistoryEpoch((value) => value + 1);
    queueMicrotask(() => {
      applyingHistoryRef.current = false;
    });
  }, []);

  const handleRedo = React.useCallback(() => {
    const next = historyFutureRef.current.pop();
    if (!next) return;
    historyPastRef.current.push(structuredClone(pagesRef.current));
    applyingHistoryRef.current = true;
    setPages(next);
    setHistoryEpoch((value) => value + 1);
    queueMicrotask(() => {
      applyingHistoryRef.current = false;
    });
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typingInField = Boolean(
        target?.closest("input, textarea, select, [contenteditable='true']"),
      );
      // Allow undo/redo even from the formula bar input; skip other fields' native undo.
      const inFormulaBar = Boolean(target?.closest("[data-analytics-formula-bar]"));
      if (typingInField && !inFormulaBar) return;

      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (key === "z" && !event.shiftKey) {
        if (!historyPastRef.current.length) return;
        event.preventDefault();
        handleUndo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        if (!historyFutureRef.current.length) return;
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRedo, handleUndo]);

  const activePage = pages.find((page) => page.id === activePageId) ?? pages[0] ?? null;
  const elements = React.useMemo(() => activePage?.elements ?? [], [activePage]);
  const selectedElement = elements.find((element) => element.id === selectedElementId) ?? null;

  const formulaSource = React.useMemo(() => {
    if (!selectedElement || selectedElement.viz === "text") return undefined;
    if (!isCustomAnalyticsSource(selectedElement.query.source)) return undefined;
    return customSources.find((source) => source.key === selectedElement.query.source);
  }, [selectedElement, customSources]);

  const formulaEnabled = Boolean(
    selectedElement
    && selectedElement.viz !== "text"
    && !(selectedElement.viz === "table" && selectedElement.query.mode === "raw"),
  );

  const selectedMeasureSignature = React.useMemo(() => {
    if (!selectedElement || selectedMeasureIndex == null) return "";
    const measure = selectedElement.query.measures[selectedMeasureIndex];
    if (!measure) return "";
    return JSON.stringify({
      agg: measure.agg,
      column: measure.column,
      formula: measure.formula ?? "",
      label: measure.label ?? "",
    });
  }, [selectedElement, selectedMeasureIndex]);

  /** Applies an update to the active page's elements inside the pages state. */
  const setActiveElements = React.useCallback(
    (
      updater: (elements: AnalyticsWorkbookElement[]) => AnalyticsWorkbookElement[],
      options?: { history?: boolean },
    ) => {
      if (options?.history !== false) recordHistory();
      setPages((previous) => {
        const targetId = activePage?.id;
        if (!targetId) return previous;
        return previous.map((page) =>
          page.id === targetId ? { ...page, elements: updater(page.elements) } : page,
        );
      });
    },
    [activePage?.id, recordHistory],
  );

  // ----- load workbooks (create a starter one if none exist) -----
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from("analytics_workbooks")
        .select("id, name, elements, pages, created_at, updated_at")
        .order("updated_at", { ascending: false });

      let records: AnalyticsWorkbookRecord[] = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        updated_at: row.updated_at,
        pages: coercePages(row.pages, row.elements),
      }));

      if (records.length === 0) {
        // Empty starter: charts must pick a Build a Table source first.
        const starterElements: AnalyticsWorkbookElement[] = [];
        const starterPages = [createPage("Page 1", starterElements)];
        const { data: created } = await supabase
          .from("analytics_workbooks")
          .insert({
            user_id: user.id,
            name: "My workbook",
            elements: starterElements,
            pages: starterPages,
          })
          .select("id, name, elements, pages, created_at, updated_at")
          .single();
        if (created) {
          records = [
            {
              id: created.id,
              name: created.name,
              created_at: created.created_at,
              updated_at: created.updated_at,
              pages: coercePages(created.pages, created.elements),
            },
          ];
        }
      }

      if (cancelled) return;
      setWorkbooks(records);
      const first = records[0] ?? null;
      setActiveId(first?.id ?? null);
      setPages(first?.pages ?? []);
      setActivePageId(first?.pages[0]?.id ?? null);
      setName(first?.name ?? "");
      skipNextAutosave.current = true;
      setSaveState("saved");
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ----- grid width tracking (canvas column, not the layout contents) -----
  // Measure the constrained canvas so the grid compresses when the workbook
  // sidebar opens and expands when it collapses.
  const measureCanvasWidth = React.useCallback(() => {
    const node = canvasRef.current;
    if (!node) return;
    // Match the p-2 (8px) horizontal padding on the grid wrapper.
    const next = Math.max(Math.floor(node.clientWidth - 16), 320);
    setGridWidth((previous) => (previous === next ? previous : next));
  }, []);

  React.useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    measureCanvasWidth();
    const observer = new ResizeObserver(() => measureCanvasWidth());
    observer.observe(node);
    return () => observer.disconnect();
  }, [measureCanvasWidth, activeId, panelOpen]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(measureCanvasWidth);
    return () => window.cancelAnimationFrame(frame);
  }, [panelOpen, measureCanvasWidth]);

  // ----- autosave (debounced) -----
  React.useEffect(() => {
    if (!activeId) return;
    // Never write an empty pages array — a client that hasn't fully hydrated
    // (stale tab, interrupted load) must not wipe a saved workbook.
    if (pages.length === 0) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    setSaveState("dirty");
    const timeout = window.setTimeout(async () => {
      setSaveState("saving");
      const { error } = await supabase
        .from("analytics_workbooks")
        .update({
          name: name.trim() || "Untitled workbook",
          pages,
          // Legacy mirror of the first page so older readers keep working.
          elements: pages[0]?.elements ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeId);
      setSaveState(error ? "error" : "saved");
      if (!error) {
        setWorkbooks((previous) =>
          previous.map((workbook) =>
            workbook.id === activeId
              ? { ...workbook, name: name.trim() || "Untitled workbook", pages }
              : workbook,
          ),
        );
      }
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [supabase, activeId, pages, name]);

  const switchWorkbook = (workbook: AnalyticsWorkbookRecord) => {
    setActiveId(workbook.id);
    setPages(workbook.pages);
    setActivePageId(workbook.pages[0]?.id ?? null);
    setName(workbook.name);
    setRenamingWorkbook(false);
    setSelectedElementId(null);
    setRenamingPageId(null);
    skipNextAutosave.current = true;
    setSaveState("saved");
    clearHistory();
  };

  const handleNewWorkbook = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const starterPages = [createPage("Page 1")];
    const { data: created } = await supabase
      .from("analytics_workbooks")
      .insert({ user_id: user.id, name: "Untitled workbook", elements: [], pages: starterPages })
      .select("id, name, elements, pages, created_at, updated_at")
      .single();
    if (!created) return;
    const record: AnalyticsWorkbookRecord = {
      id: created.id,
      name: created.name,
      created_at: created.created_at,
      updated_at: created.updated_at,
      pages: coercePages(created.pages, created.elements),
    };
    setWorkbooks((previous) => [record, ...previous]);
    switchWorkbook(record);
  };

  const handleDeleteWorkbook = async () => {
    if (!activeId) return;
    await supabase.from("analytics_workbooks").delete().eq("id", activeId);
    const remaining = workbooks.filter((workbook) => workbook.id !== activeId);
    setWorkbooks(remaining);
    setDeleteOpen(false);
    if (remaining[0]) {
      switchWorkbook(remaining[0]);
    } else {
      setActiveId(null);
      setPages([]);
      setActivePageId(null);
      setName("");
      setSelectedElementId(null);
    }
  };

  /* ----- page (bottom tab) operations ----- */
  const handleAddPage = () => {
    const page = createPage(`Page ${pages.length + 1}`);
    setPages((previous) => [...previous, page]);
    setActivePageId(page.id);
    setSelectedElementId(null);
  };

  const handleSelectPage = (id: string) => {
    if (id === activePageId) return;
    setActivePageId(id);
    setSelectedElementId(null);
    setRenamingPageId(null);
  };

  const startRenamePage = (page: AnalyticsPage) => {
    setRenamingPageId(page.id);
    setRenameValue(page.name);
  };

  const commitRenamePage = () => {
    if (!renamingPageId) return;
    const trimmed = renameValue.trim();
    setPages((previous) =>
      previous.map((page) =>
        page.id === renamingPageId ? { ...page, name: trimmed || page.name } : page,
      ),
    );
    setRenamingPageId(null);
  };

  const handleDeletePage = (id: string) => {
    if (pages.length <= 1) return;
    setPages((previous) => {
      const remaining = previous.filter((page) => page.id !== id);
      if (id === activePageId) {
        setActivePageId(remaining[0]?.id ?? null);
        setSelectedElementId(null);
      }
      return remaining;
    });
  };

  // Build a Table definitions are the only analytics data sources; they
  // project over the shared raw store, so availability follows its sync state.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data }, { data: sourceState }] = await Promise.all([
        supabase
          .from("api_builder_tables")
          .select(
            "id, user_id, name, source, grain, columns, column_labels, calculated_columns, created_at, updated_at, last_synced_at, sync_row_count, sync_status, sync_error",
          )
          .eq("source", "sales")
          .order("updated_at", { ascending: false }),
        supabase
          .from("api_builder_source_state")
          .select("sync_status, sync_row_count, last_synced_at, sync_error")
          .eq("source", "sales")
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const storeHasData =
        (sourceState?.sync_row_count ?? 0) > 0 || sourceState?.sync_status === "ready";
      const syncInfo = sourceState
        ? {
            lastSyncedAt: sourceState.last_synced_at,
            syncStatus: sourceState.sync_status,
            syncRowCount: sourceState.sync_row_count,
            syncError: sourceState.sync_error,
          }
        : undefined;
      const sources = storeHasData
        ? ((data ?? []) as SavedApiTable[])
            .map((table) => analyticsSourceFromApiTable(table, syncInfo))
            .filter((source) => source.columns.length > 0)
        : [];
      setCustomSources(sources);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const resolvePreferredSource = (): AnalyticsSource | null => {
    if (
      selectedElement?.query.source
      && isCustomAnalyticsSource(selectedElement.query.source)
    ) {
      const match = customSources.find(
        (source) => source.key === selectedElement.query.source,
      );
      if (match) return match;
    }
    return customSources[0] ?? null;
  };

  const handleInsertSource = (viz: AnalyticsVizType, source: AnalyticsSource) => {
    setAddSourceHint(null);
    const element = createElementFromSource(viz, source, nextRowY(elements));
    setActiveElements((previous) => [...previous, element]);
    setSelectedElementId(element.id);
  };

  const handleAddElement = (viz: AnalyticsVizType) => {
    setAddSourceHint(null);
    if (viz === "text") {
      const textSource =
        resolvePreferredSource()?.key
        || customSources[0]?.key
        || "custom_pending";
      const element = createElement(viz, textSource, nextRowY(elements));
      setActiveElements((previous) => [...previous, element]);
      setSelectedElementId(element.id);
      return;
    }

    const preferred = resolvePreferredSource();
    if (!preferred) {
      setAddSourceHint(
        "Build and sync a table in Build a Table before adding charts.",
      );
      return;
    }

    handleInsertSource(viz, preferred);
  };

  const handleUpdateElement = (id: string, patch: Partial<AnalyticsWorkbookElement>) => {
    setActiveElements((previous) =>
      previous.map((element) => (element.id === id ? { ...element, ...patch } : element)),
    );
  };

  const measureCapForElement = (element: AnalyticsWorkbookElement) => {
    if (element.viz === "metric") return 1;
    if (element.viz === "pivot") return 6;
    return 5;
  };

  // Reset measure selection when switching elements.
  React.useEffect(() => {
    setSelectedMeasureIndex(null);
    setFormulaError(null);
  }, [selectedElementId]);

  const measuresLength = selectedElement?.query.measures.length ?? 0;

  // Keep the formula bar in sync with the selected measure (not while typing).
  React.useEffect(() => {
    if (!selectedElement || !formulaEnabled) {
      setFormulaDraft("");
      return;
    }
    const measures = selectedElement.query.measures;
    if (measures.length === 0) {
      if (selectedMeasureIndex != null) setSelectedMeasureIndex(null);
      setFormulaDraft("");
      return;
    }
    if (selectedMeasureIndex == null || selectedMeasureIndex >= measures.length) {
      setSelectedMeasureIndex(0);
      return;
    }
    const measure = measures[selectedMeasureIndex];
    if (!measure) {
      setFormulaDraft("");
      return;
    }
    setFormulaDraft(measureToFormula(measure, formulaSource));
    // selectedElement is read for measures; signature/length cover content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid resetting draft on unrelated element identity churn
  }, [
    selectedElementId,
    selectedMeasureIndex,
    selectedMeasureSignature,
    measuresLength,
    formulaEnabled,
    formulaSource,
  ]);

  const handleSelectMeasure = (index: number | null) => {
    setSelectedMeasureIndex(index);
    setFormulaError(null);
    if (index == null || !selectedElement) {
      setFormulaDraft("");
      return;
    }
    const measure = selectedElement.query.measures[index];
    setFormulaDraft(measure ? measureToFormula(measure, formulaSource) : "");
  };

  const handleFormulaCancel = () => {
    setFormulaError(null);
    if (!selectedElement || selectedMeasureIndex == null) {
      setFormulaDraft("");
      return;
    }
    const measure = selectedElement.query.measures[selectedMeasureIndex];
    setFormulaDraft(measure ? measureToFormula(measure, formulaSource) : "");
  };

  const updateSelectedMeasureFormat = (format: VisualValueFormat) => {
    if (!selectedElement || selectedMeasureIndex == null) return;
    const measures = [...selectedElement.query.measures];
    const current = measures[selectedMeasureIndex];
    if (!current) return;
    measures[selectedMeasureIndex] = { ...current, format };
    handleUpdateElement(selectedElement.id, {
      query: { ...selectedElement.query, measures },
    });
  };

  const handleFormulaCommit = () => {
    if (!selectedElement || !formulaEnabled) return;
    const parsed = parseMeasureFormula(formulaDraft, formulaSource);
    if (!parsed.ok) {
      setFormulaError(parsed.error);
      return;
    }
    setFormulaError(null);
    const nextMeasure = { ...parsed.measure };
    if (selectedMeasureIndex != null) {
      const previous = selectedElement.query.measures[selectedMeasureIndex];
      if (previous?.label?.trim()) {
        nextMeasure.label = previous.label;
      }
      if (previous?.format) {
        nextMeasure.format = previous.format;
      }
    }

    const cap = measureCapForElement(selectedElement);
    const measures = [...selectedElement.query.measures];
    if (selectedMeasureIndex != null && selectedMeasureIndex < measures.length) {
      measures[selectedMeasureIndex] = nextMeasure;
      handleUpdateElement(selectedElement.id, {
        query: { ...selectedElement.query, measures, sort: null },
      });
      setFormulaDraft(measureToFormula(nextMeasure, formulaSource));
      return;
    }

    if (measures.length >= cap) {
      setFormulaError(`This element already has the maximum of ${cap} values.`);
      return;
    }
    measures.push(nextMeasure);
    handleUpdateElement(selectedElement.id, {
      query: { ...selectedElement.query, measures, sort: null },
    });
    setSelectedMeasureIndex(measures.length - 1);
    setFormulaDraft(measureToFormula(nextMeasure, formulaSource));
  };

  const handleDuplicateElement = (element: AnalyticsWorkbookElement) => {
    const copy = duplicateElement(element, nextRowY(elements));
    setActiveElements((previous) => [...previous, copy]);
    setSelectedElementId(copy.id);
  };

  const handleRemoveElement = (id: string) => {
    setActiveElements((previous) => previous.filter((element) => element.id !== id));
    setSelectedElementId((current) => (current === id ? null : current));
  };

  const handleLayoutChange = (layout: Layout) => {
    // After a horizontal split-drop, ignore RGL's colliding layout briefly.
    if (Date.now() < suppressLayoutUntilRef.current) return;
    // Layout drags fire continuously; history is recorded once on drag start.
    setActiveElements((previous) =>
      previous.map((element) => {
        const item = layout.find((entry) => entry.i === element.id);
        if (!item) return element;
        const { x, y, w, h } = item;
        if (
          x === element.layout.x
          && y === element.layout.y
          && w === element.layout.w
          && h === element.layout.h
        ) {
          return element;
        }
        return {
          ...element,
          layout: { x, y, w, h, rowPx: ANALYTICS_GRID_ROW_PX },
        };
      }),
      { history: false },
    );
  };

  const gridMetrics = React.useMemo(
    () => ({
      cols: GRID_COLS,
      rowHeight: ROW_HEIGHT,
      margin: GRID_MARGIN,
      containerPadding: GRID_PADDING,
      width: gridWidth,
    }),
    [gridWidth],
  );

  const resolveSplitIntent = React.useCallback(
    (draggedId: string | null | undefined, event: Event | null | undefined) => {
      const snapshot = dragStartSnapshotRef.current;
      if (!draggedId || !snapshot) return null;

      const point = eventClientPoint(event);
      const layoutEl = gridShellRef.current?.querySelector(
        ".react-grid-layout",
      ) as HTMLElement | null;
      if (!point || !layoutEl) return null;

      const width = layoutEl.offsetWidth || gridWidth;
      const gridPoint = clientPointToGrid(point.x, point.y, layoutEl, {
        ...gridMetrics,
        width,
      });
      if (!gridPoint) return null;

      return findSplitDropIntent(draggedId, gridPoint.x, gridPoint.y, snapshot);
    },
    [gridMetrics, gridWidth],
  );

  const handleDragStart = React.useCallback(
    (_layout: Layout, _oldItem: LayoutItem | null, _newItem: LayoutItem | null) => {
      recordHistory();
      const snapshot = snapshotLayouts(elements);
      dragStartSnapshotRef.current = snapshot;
      setDragSnapshot(snapshot);
      splitDropRef.current = null;
      setSplitPreview(null);
    },
    [elements, recordHistory],
  );

  const splitPreviewStyle = React.useMemo(() => {
    if (!splitPreview || !dragSnapshot) return null;
    const slot = dragSnapshot[splitPreview.targetId];
    if (!slot) return null;
    return gridRectToPixels(slot, gridMetrics);
  }, [splitPreview, dragSnapshot, gridMetrics]);

  const handleDrag = React.useCallback(
    (
      _layout: Layout,
      _oldItem: LayoutItem | null,
      newItem: LayoutItem | null,
      _placeholder: LayoutItem | null,
      event: Event,
    ) => {
      const intent = resolveSplitIntent(newItem?.i, event);
      splitDropRef.current = intent;
      setSplitPreview(intent);
    },
    [resolveSplitIntent],
  );

  const handleDragStop = React.useCallback(
    (
      _layout: Layout,
      oldItem: LayoutItem | null,
      newItem: LayoutItem | null,
      _placeholder: LayoutItem | null,
      event: Event,
    ) => {
      const snapshot = dragStartSnapshotRef.current;
      const draggedId = newItem?.i ?? oldItem?.i;
      const intent = splitDropRef.current ?? resolveSplitIntent(draggedId, event);

      dragStartSnapshotRef.current = null;
      splitDropRef.current = null;
      setDragSnapshot(null);
      setSplitPreview(null);

      if (!intent || !snapshot) return;

      // Ignore RGL's post-drag layout long enough for our split to stick.
      suppressLayoutUntilRef.current = Date.now() + 400;
      // History already recorded on drag start.
      setActiveElements(
        (previous) => applyHorizontalSplit(previous, intent, snapshot),
        { history: false },
      );
    },
    [resolveSplitIntent],
  );

  const gridLayout: Layout = elements.map((element) => ({
    i: element.id,
    x: element.layout.x,
    y: element.layout.y,
    w: element.layout.w,
    h: element.layout.h,
    minW: 2,
    // Text can shrink to a single fine row (~24px); other viz keep ~144px floor.
    minH: element.viz === "text" ? 1 : 6,
  }));

  if (saveState === "loading") {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", analyticsFontClassName())}>
      {/* ---- workbook bar ---- */}
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-1">
        {renamingWorkbook && activeId ? (
          <Input
            ref={workbookRenameRef}
            value={workbookRenameDraft}
            onChange={(event) => setWorkbookRenameDraft(event.target.value)}
            onBlur={() => {
              const next = workbookRenameDraft.trim() || name || "Untitled workbook";
              setName(next);
              setRenamingWorkbook(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
              } else if (event.key === "Escape") {
                event.preventDefault();
                setRenamingWorkbook(false);
              }
            }}
            className="h-7 w-56 border-gray-200 text-sm shadow-none"
            placeholder="Workbook name"
          />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-sm font-medium">
                <FileSpreadsheet className="h-4 w-4 text-gray-500" />
                <span className="max-w-[220px] truncate">{name || "Untitled workbook"}</span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {workbooks.map((workbook) => (
                <DropdownMenuItem
                  key={workbook.id}
                  onClick={() => switchWorkbook(workbook)}
                  className="gap-2 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">{workbook.name}</span>
                  {workbook.id === activeId ? <Check className="h-3.5 w-3.5 text-gray-500" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleNewWorkbook} className="gap-2 text-sm">
                <Plus className="h-3.5 w-3.5" />
                New workbook
              </DropdownMenuItem>
              {activeId ? (
                <DropdownMenuItem
                  onClick={() => {
                    setWorkbookRenameDraft(name);
                    setRenamingWorkbook(true);
                    window.requestAnimationFrame(() => {
                      workbookRenameRef.current?.focus();
                      workbookRenameRef.current?.select();
                    });
                  }}
                  className="gap-2 text-sm"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename workbook
                </DropdownMenuItem>
              ) : null}
              {activeId ? (
                <DropdownMenuItem
                  onClick={() => setDeleteOpen(true)}
                  className="gap-2 text-sm text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete workbook
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          {saveState === "saving" ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          ) : saveState === "dirty" ? (
            <span>Unsaved changes</span>
          ) : saveState === "error" ? (
            <span className="text-red-600">Save failed — will retry on next change</span>
          ) : activeId ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="h-3 w-3" />
              Saved
            </span>
          ) : null}
        </div>
      </div>

      <FormulaBar
        value={formulaDraft}
        onChange={(next) => {
          setFormulaDraft(next);
          if (formulaError) setFormulaError(null);
        }}
        onCommit={handleFormulaCommit}
        onCancel={handleFormulaCancel}
        source={formulaSource}
        disabled={!formulaEnabled}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        leading={
          selectedElement
          && selectedMeasureIndex != null
          && selectedElement.query.measures[selectedMeasureIndex] ? (
            <MeasureFormatButtons
              size="md"
              format={
                measureFormat(
                  selectedElement,
                  selectedElement.query.measures[selectedMeasureIndex]!,
                ) ?? "number"
              }
              onFormatChange={updateSelectedMeasureFormat}
            />
          ) : null
        }
        placeholder={
          !selectedElement
            ? "Select a chart or pivot to edit a value formula"
            : selectedElement.viz === "text"
              ? "Formulas apply to chart and pivot values"
              : selectedElement.viz === "table" && selectedElement.query.mode === "raw"
                ? "Switch the table to aggregate mode to use formulas"
                : selectedMeasureIndex == null
                  && selectedElement.query.measures.length === 0
                  ? "Sum([Column]) — press Enter to add a value"
                  : "Sum([Column])"
        }
        error={formulaError}
      />

      {/* ---- canvas + editor panel ---- */}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
        <div
          ref={canvasRef}
          className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-gray-100"
        >
          {!activeId ? (
            <EmptyState onCreate={handleNewWorkbook} />
          ) : elements.length === 0 ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium text-gray-700">This page is empty</p>
              <p className="max-w-sm text-xs text-gray-500">
                Add a table, pivot table, chart or text from the toolbar below.
              </p>
            </div>
          ) : (
            <div
              ref={gridShellRef}
              className="analytics-studio-grid box-border w-full max-w-full min-w-0 p-2 pb-20"
            >
              <div className="relative">
                <ReactGridLayout
                  className="layout"
                  width={gridWidth}
                  cols={GRID_COLS}
                  rowHeight={ROW_HEIGHT}
                  margin={GRID_MARGIN}
                  containerPadding={GRID_PADDING}
                  layout={gridLayout}
                  onLayoutChange={handleLayoutChange}
                  onDragStart={handleDragStart}
                  onDrag={handleDrag}
                  onDragStop={handleDragStop}
                  draggableHandle=".analytics-drag-handle"
                  compactType="vertical"
                  resizeHandles={[...RESIZE_HANDLES]}
                >
                  {elements.map((element) => (
                    <div key={element.id} className="h-full">
                      <ElementCard
                        element={element}
                        selected={element.id === selectedElementId}
                        onSelect={() => {
                          setSelectedElementId(element.id);
                          setPanelOpen(true);
                        }}
                        onDuplicate={() => handleDuplicateElement(element)}
                        onRemove={() => handleRemoveElement(element.id)}
                        onUpdate={(patch) => handleUpdateElement(element.id, patch)}
                      />
                    </div>
                  ))}
                </ReactGridLayout>
                {splitPreview && splitPreviewStyle ? (
                  <div
                    className="pointer-events-none absolute z-40 flex overflow-hidden rounded-md"
                    style={splitPreviewStyle}
                  >
                    <div
                      className={
                        splitPreview.side === "left"
                          ? "h-full flex-1 bg-gray-900/[0.08] shadow-[inset_0_0_0_2px_rgba(75,85,99,0.5)]"
                          : "h-full flex-1 bg-gray-900/[0.02]"
                      }
                    />
                    <div
                      className={
                        splitPreview.side === "right"
                          ? "h-full flex-1 bg-gray-900/[0.08] shadow-[inset_0_0_0_2px_rgba(75,85,99,0.5)]"
                          : "h-full flex-1 bg-gray-900/[0.02]"
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* ---- floating add-element toolbar (pinned to bottom of canvas) ---- */}
        {activeId ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex flex-col items-center gap-2 px-3 pb-2">
            {addSourceHint ? (
              <div className="pointer-events-auto rounded-xl bg-white px-3 py-2 text-xs text-gray-700 shadow-md">
                {addSourceHint}
              </div>
            ) : null}
            <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-1.5 py-1 shadow-lg">
              {ADD_BUTTONS.map(({ viz, icon: Icon }) => {
                // Table: pick which Build a Table source to drop onto the canvas.
                if (viz === "table") {
                  return (
                    <DropdownMenu key={viz}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                        >
                          <Icon className="h-4 w-4" />
                          {VIZ_LABELS[viz]}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="center"
                        side="top"
                        className="w-56 animate-in fade-in slide-in-from-bottom-2 zoom-in-95 duration-200"
                      >
                        {customSources.length === 0 ? (
                          <div className="px-2 py-2 text-xs text-gray-500">
                            No synced tables yet. Build and sync a table first.
                          </div>
                        ) : (
                          customSources.map((source) => (
                            <DropdownMenuItem
                              key={source.key}
                              onClick={() => handleInsertSource("table", source)}
                              className="gap-2"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src="/yjsmall.png"
                                alt=""
                                width={14}
                                height={14}
                                className="h-3.5 w-3.5 shrink-0 rounded-full object-cover"
                              />
                              <span className="truncate">{source.label}</span>
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }

                return (
                  <button
                    key={viz}
                    type="button"
                    onClick={() => handleAddElement(viz)}
                    className="flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                  >
                    <Icon className="h-4 w-4" />
                    {VIZ_LABELS[viz]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* ---- page tabs (bottom bar) ---- */}
        {activeId ? (
          <div className="relative z-30 flex shrink-0 items-center gap-0.5 border-t border-gray-200 bg-white px-2 py-1">
            {pages.map((page) => {
              const isActive = page.id === (activePage?.id ?? null);
              if (renamingPageId === page.id) {
                return (
                  <Input
                    key={page.id}
                    autoFocus
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onBlur={commitRenamePage}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") commitRenamePage();
                      if (event.key === "Escape") setRenamingPageId(null);
                    }}
                    className="h-6 w-28 px-1.5 text-xs"
                  />
                );
              }
              return (
                <div
                  key={page.id}
                  className={cn(
                    "group flex items-center rounded-md",
                    isActive ? "bg-gray-100" : "hover:bg-gray-50",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectPage(page.id)}
                    onDoubleClick={() => startRenamePage(page)}
                    className={cn(
                      "px-2.5 py-1 text-xs transition-colors",
                      isActive ? "font-medium text-gray-900" : "text-gray-500 hover:text-gray-700",
                    )}
                  >
                    {page.name}
                  </button>
                  {isActive ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="mr-0.5 h-5 w-5 text-gray-400 hover:text-gray-700"
                          aria-label={`Page options for ${page.name}`}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => startRenamePage(page)} className="gap-2 text-xs">
                          <Pencil className="h-3 w-3" />
                          Rename
                        </DropdownMenuItem>
                        {pages.length > 1 ? (
                          <DropdownMenuItem
                            onClick={() => handleDeletePage(page.id)}
                            className="gap-2 text-xs text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete page
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handleAddPage}
              className="ml-0.5 text-gray-400 hover:text-gray-700"
              aria-label="Add page"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : null}
        </div>

        {/* ---- right settings panel ---- */}
        {panelOpen ? (
          <div
            className="hidden shrink-0 flex-col overflow-hidden border-l border-gray-200 bg-white lg:flex"
            style={{ width: PANEL_WIDTH }}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-2.5">
              {selectedElement ? (
                <ElementPanelIcon viz={selectedElement.viz} />
              ) : (
                <FileSpreadsheet className="h-4 w-4 text-gray-400" />
              )}
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                {selectedElement ? selectedElement.title || "Untitled element" : "Workbook"}
              </p>
              {selectedElement ? (
                <span className="shrink-0 text-[11px] text-gray-500">
                  {VIZ_LABELS[selectedElement.viz]}
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => setPanelOpen(false)}
                className="shrink-0 text-gray-400 hover:text-gray-700"
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {selectedElement ? (
              <ElementEditor
                key={selectedElement.id}
                element={selectedElement}
                onChange={(patch) => handleUpdateElement(selectedElement.id, patch)}
                selectedMeasureIndex={selectedMeasureIndex}
                onSelectMeasure={handleSelectMeasure}
              />
            ) : (
              <div className="overflow-y-auto p-4 text-xs leading-relaxed text-gray-500">
                <p className="font-medium text-gray-700">Build your workbook</p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4">
                  <li>
                    Use Table on the bottom toolbar to insert a synced Build a Table source onto the page.
                  </li>
                  <li>Click any element to edit its data source, groupings, measures and filters here.</li>
                  <li>Drag elements by their handle to rearrange; resize from the bottom-right corner.</li>
                  <li>Everything saves automatically to this workbook.</li>
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="hidden shrink-0 flex-col items-center border-l border-gray-200 bg-white py-2 lg:flex">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => setPanelOpen(true)}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="mt-3 max-h-40 truncate text-[11px] font-medium tracking-wide text-gray-500 hover:text-gray-800"
              style={{ writingMode: "vertical-rl" }}
              title="Expand sidebar"
            >
              {selectedElement ? selectedElement.title || "Element" : "Workbook"}
            </button>
          </div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workbook?</AlertDialogTitle>
            <AlertDialogDescription>
              “{name || "Untitled workbook"}” and all of its elements will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWorkbook}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ElementPanelIcon({ viz }: { viz: AnalyticsVizType }) {
  const Icon = VIZ_ICONS[viz];
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-500">
      <Icon className="h-3 w-3" />
    </span>
  );
}

function ElementCard({
  element,
  selected,
  onSelect,
  onDuplicate,
  onRemove,
  onUpdate,
}: {
  element: AnalyticsWorkbookElement;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onUpdate: (patch: Partial<AnalyticsWorkbookElement>) => void;
}) {
  const isText = element.viz === "text";
  const hasTableSource = isCustomAnalyticsSource(element.query.source);
  const fetched = useElementData(element.query, !isText && hasTableSource);
  const data =
    !isText && !hasTableSource
      ? {
          ...fetched,
          error: "Pick a table from Build a Table as the data source.",
          isLoading: false,
        }
      : fetched;

  const handleRenameMeasure = React.useCallback(
    (measureKey: string, label: string) => {
      const measures = element.query.measures.map((measure) => {
        if (measureAlias(measure) !== measureKey) return measure;
        const nextLabel = label.trim();
        if (!nextLabel) {
          return { agg: measure.agg, column: measure.column };
        }
        return { ...measure, label: nextLabel };
      });
      onUpdate({ query: { ...element.query, measures } });
    },
    [element.query, onUpdate],
  );

  const [editingTitle, setEditingTitle] = React.useState(false);
  const [titleValue, setTitleValue] = React.useState(element.title);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!editingTitle) setTitleValue(element.title);
  }, [element.title, editingTitle]);

  React.useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const commitTitle = () => {
    const next = titleValue.trim() || element.title;
    setEditingTitle(false);
    if (next !== element.title) onUpdate({ title: next });
    else setTitleValue(element.title);
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative flex h-full min-h-0 cursor-pointer flex-col overflow-hidden rounded-md border transition-all",
        isText
          ? selected
            ? "border-gray-300 bg-white ring-2 ring-gray-300/60"
            : "border-transparent bg-transparent hover:border-gray-200 hover:bg-white/60"
          : cn(
              "bg-white shadow-sm",
              selected
                ? "border-gray-400 ring-2 ring-gray-300/60"
                : "border-gray-200 hover:border-gray-300 hover:shadow-md",
            ),
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-1.5 px-2 py-1.5",
          isText
            ? "absolute right-0 top-0 z-10 opacity-0 transition-opacity group-hover:opacity-100"
            : "border-b border-gray-100",
        )}
      >
        <span
          className="analytics-drag-handle cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          onClick={(event) => event.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        {!isText ? (
          editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleValue}
              onChange={(event) => setTitleValue(event.target.value)}
              onBlur={commitTitle}
              onClick={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitTitle();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setEditingTitle(false);
                  setTitleValue(element.title);
                }
              }}
              className="h-6 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-1.5 text-xs font-semibold text-gray-800 outline-none focus:border-gray-400"
            />
          ) : (
            <button
              type="button"
              title="Double-click to rename"
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setEditingTitle(true);
              }}
              onClick={(event) => event.stopPropagation()}
              className="min-w-0 flex-1 truncate rounded-md px-0.5 text-left text-xs font-semibold text-gray-800 hover:bg-gray-50"
            >
              {element.title}
            </button>
          )
        ) : null}
        {!isText && data.isValidating && !data.isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin text-gray-300" />
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {!isText ? (
            <ElementFiltersControlsMenu
              element={element}
              onUpdate={onUpdate}
              open={filterOpen}
              onOpenChange={setFilterOpen}
            />
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className={cn(
                  "text-gray-500 hover:text-gray-800",
                  selected || filterOpen
                    ? "opacity-100"
                    : "opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100",
                )}
                onClick={(event) => event.stopPropagation()}
                aria-label="Element menu"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="min-w-56 rounded-md"
              onClick={(event) => event.stopPropagation()}
            >
              {!isText ? (
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => setFilterOpen(true)}
                >
                  <Filter className="h-3.5 w-3.5 text-gray-400" />
                  <span className="min-w-0 flex-1">Filter</span>
                  {(element.query.filters?.length ?? 0) > 0 ? (
                    <span className="shrink-0 text-[10px] text-gray-400">
                      {element.query.filters.length}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem className="text-xs" onSelect={() => onDuplicate()}>
                <Copy className="h-3.5 w-3.5 text-gray-400" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs" onSelect={() => onRemove()}>
                <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className={cn(
          "min-h-0 flex-1",
          // Tables / pivots / charts / text: clip to the card (no nested scroll).
          // Charts must not trap vertical wheel scrolling.
          element.viz === "table" ||
            element.viz === "pivot" ||
            element.viz === "bar" ||
            element.viz === "line" ||
            element.viz === "text"
            ? "overflow-hidden"
            : "overflow-auto p-1.5",
          (element.viz === "bar" || element.viz === "line") && "p-1.5",
        )}
      >
        <ElementRenderer
          element={element}
          data={data}
          onRenameMeasure={element.viz === "pivot" ? handleRenameMeasure : undefined}
        />
      </div>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-center">
      <FileSpreadsheet className="h-8 w-8 text-gray-300" />
      <div>
        <p className="text-sm font-medium text-gray-700">No workbooks yet</p>
        <p className="mt-1 max-w-sm text-xs text-gray-500">
          Workbooks hold saved tables and charts built from your Build a Table sources.
        </p>
      </div>
      <Button size="sm" onClick={onCreate} className="gap-1.5">
        <Plus className="h-4 w-4" />
        New workbook
      </Button>
    </div>
  );
}
