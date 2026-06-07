import type { GenieChartPayload } from "@/components/genie/genie-chart";
import type { GenieTablePayload } from "@/components/genie/genie-data-table";
import type { GeniePivotTablePayload } from "@/lib/genie/pivot-table";
import type { DashboardWidgetQuerySource } from "@/lib/dashboard/dashboard-query-visual";
import type { VisualDateFormat, VisualValueFormat } from "@/lib/genie/visual-format";

export interface DashboardFieldFormat {
  valueFormat?: VisualValueFormat | "";
  dateFormat?: VisualDateFormat;
}

export interface DashboardWidgetFieldFormats {
  tableColumns?: Record<string, DashboardFieldFormat>;
  pivotRowFields?: Record<string, VisualDateFormat>;
  pivotColumnFields?: Record<string, VisualDateFormat>;
  pivotValueFormat?: VisualValueFormat;
}

export type DashboardWidgetType = "chart" | "table" | "pivot";

export type DashboardWidgetPayload =
  | { type: "chart"; data: GenieChartPayload }
  | { type: "table"; data: GenieTablePayload }
  | { type: "pivot"; data: GeniePivotTablePayload };

export interface DashboardWidget {
  id: string;
  title: string;
  addedAt: string;
  payload: DashboardWidgetPayload;
  dateFormat?: VisualDateFormat;
  fieldFormats?: DashboardWidgetFieldFormats;
  querySource?: DashboardWidgetQuerySource;
}

export interface DashboardGridItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export interface StoreDashboardState {
  widgets: DashboardWidget[];
  layout: DashboardGridItem[];
}

const STORAGE_KEY = "store-dashboard-widgets";

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function defaultSize(type: DashboardWidgetType): Pick<DashboardGridItem, "w" | "h" | "minW" | "minH"> {
  switch (type) {
    case "chart":
      return { w: 6, h: 5, minW: 4, minH: 3 };
    case "table":
      return { w: 6, h: 4, minW: 4, minH: 3 };
    case "pivot":
      return { w: 8, h: 5, minW: 5, minH: 3 };
  }
}

function nextGridPosition(layout: DashboardGridItem[], type: DashboardWidgetType): DashboardGridItem {
  const id = createId();
  const size = defaultSize(type);
  const nextY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);

  return {
    i: id,
    x: 0,
    y: nextY,
    ...size,
  };
}

export function readStoreDashboard(): StoreDashboardState {
  if (typeof window === "undefined") {
    return { widgets: [], layout: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { widgets: [], layout: [] };
    const parsed = JSON.parse(raw) as StoreDashboardState;
    if (!Array.isArray(parsed.widgets) || !Array.isArray(parsed.layout)) {
      return { widgets: [], layout: [] };
    }
    return parsed;
  } catch {
    return { widgets: [], layout: [] };
  }
}

export function writeStoreDashboard(state: StoreDashboardState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function addDashboardWidget(
  payload: DashboardWidgetPayload,
  title: string,
  querySource?: DashboardWidgetQuerySource,
): StoreDashboardState {
  const current = readStoreDashboard();
  const gridItem = nextGridPosition(current.layout, payload.type);
  const widget: DashboardWidget = {
    id: gridItem.i,
    title: title.trim() || payload.data.title,
    addedAt: new Date().toISOString(),
    payload,
    querySource,
  };
  const next: StoreDashboardState = {
    widgets: [widget, ...current.widgets],
    layout: [...current.layout, gridItem],
  };
  writeStoreDashboard(next);
  return next;
}

export function removeDashboardWidget(widgetId: string): StoreDashboardState {
  const current = readStoreDashboard();
  const next: StoreDashboardState = {
    widgets: current.widgets.filter((widget) => widget.id !== widgetId),
    layout: current.layout.filter((item) => item.i !== widgetId),
  };
  writeStoreDashboard(next);
  return next;
}

export function updateDashboardLayout(layout: DashboardGridItem[]): StoreDashboardState {
  const current = readStoreDashboard();
  const next: StoreDashboardState = { ...current, layout };
  writeStoreDashboard(next);
  return next;
}

export function updateDashboardWidget(
  widgetId: string,
  updates: {
    title?: string;
    dateFormat?: VisualDateFormat;
    fieldFormats?: DashboardWidgetFieldFormats;
    payload?: DashboardWidgetPayload;
    querySource?: DashboardWidgetQuerySource;
  },
): StoreDashboardState {
  const current = readStoreDashboard();
  const next: StoreDashboardState = {
    ...current,
    widgets: current.widgets.map((widget) => {
      if (widget.id !== widgetId) return widget;

      const title = updates.title?.trim() || widget.title;
      const payload = updates.payload ?? widget.payload;
      const syncedPayload =
        payload.type === "chart"
          ? { ...payload, data: { ...payload.data, title } }
          : payload.type === "table"
            ? { ...payload, data: { ...payload.data, title } }
            : { ...payload, data: { ...payload.data, title } };

      return {
        ...widget,
        title,
        dateFormat: updates.dateFormat ?? widget.dateFormat,
        fieldFormats: updates.fieldFormats ?? widget.fieldFormats,
        querySource: updates.querySource ?? widget.querySource,
        payload: syncedPayload,
      };
    }),
  };
  writeStoreDashboard(next);
  return next;
}

export function isWidgetOnDashboard(
  type: DashboardWidgetType,
  title: string,
): boolean {
  const { widgets } = readStoreDashboard();
  return widgets.some(
    (widget) => widget.payload.type === type && widget.title === title.trim(),
  );
}
