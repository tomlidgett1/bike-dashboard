"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import ReactGridLayout from "react-grid-layout/legacy";
import type { Layout, LayoutItem } from "react-grid-layout";
import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  Clock3,
  Database,
  FileText,
  GripVertical,
  LayoutGrid,
  Pencil,
  RefreshCw,
  Rows3,
  Sparkles,
  Table2,
  Trash2,
  Wand2,
} from "@/components/layout/app-sidebar/dashboard-icons";
import type { LucideIcon } from "@/components/layout/app-sidebar/dashboard-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DashboardWidgetRenderer } from "@/components/dashboard/dashboard-widget-renderer";
import {
  DashboardWidgetEditPanel,
  DASHBOARD_EDIT_PANEL_TOP,
  DASHBOARD_EDIT_PANEL_WIDTH,
} from "@/components/dashboard/dashboard-widget-edit-panel";
import {
  readStoreDashboard,
  removeDashboardWidget,
  updateDashboardLayout,
  updateDashboardWidget,
  type DashboardGridItem,
  type DashboardWidget,
  type DashboardWidgetType,
  type StoreDashboardState,
} from "@/lib/dashboard/store-dashboard";
import { queueHomeV2Prompt } from "@/lib/genie/homev2-navigation";
import { cn } from "@/lib/utils";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./store-dashboard-grid.css";

const GRID_COLS = 12;
const ROW_HEIGHT = 72;
const SIDEBAR_COLLAPSE_MS = 220;

const STARTER_PROMPTS = [
  {
    label: "Sales pulse",
    prompt: "Build a sales dashboard for this week with revenue, order count, and average order value.",
  },
  {
    label: "Slow stock",
    prompt: "Find slow-moving inventory and show it as a table I can pin to my dashboard.",
  },
  {
    label: "Workshop load",
    prompt: "Show current workshop workload by status and due date as a dashboard chart.",
  },
];

const WIDGET_META: Record<
  DashboardWidgetType,
  {
    label: string;
    icon: LucideIcon;
    accentClassName: string;
  }
> = {
  chart: {
    label: "Chart",
    icon: BarChart3,
    accentClassName: "bg-[var(--notion-blue)]",
  },
  table: {
    label: "Table",
    icon: Table2,
    accentClassName: "bg-[var(--notion-green)]",
  },
  pivot: {
    label: "Pivot",
    icon: Rows3,
    accentClassName: "bg-[var(--notion-purple)]",
  },
};

function formatRelativeTime(value: string | undefined) {
  if (!value) return "Not pinned";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Not pinned";

  const diffMs = Date.now() - time;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
  }).format(new Date(time));
}

function widgetDataFootprint(widget: DashboardWidget) {
  switch (widget.payload.type) {
    case "chart":
      return `${widget.payload.data.data.length} points`;
    case "table":
      return `${widget.payload.data.rows.length} rows`;
    case "pivot":
      return `${widget.payload.data.rows.length} x ${widget.payload.data.columns.length}`;
  }
}

function dashboardStats(state: StoreDashboardState) {
  const liveWidgets = state.widgets.filter((widget) => widget.querySource?.sql?.trim()).length;
  const latestWidget = state.widgets.reduce<DashboardWidget | undefined>((latest, widget) => {
    if (!latest) return widget;
    return new Date(widget.addedAt).getTime() > new Date(latest.addedAt).getTime()
      ? widget
      : latest;
  }, undefined);

  return {
    liveWidgets,
    snapshots: state.widgets.length - liveWidgets,
    charts: state.widgets.filter((widget) => widget.payload.type === "chart").length,
    tables: state.widgets.filter((widget) => widget.payload.type === "table").length,
    pivots: state.widgets.filter((widget) => widget.payload.type === "pivot").length,
    lastPinned: formatRelativeTime(latestWidget?.addedAt),
  };
}

function arrangeLayout(layout: DashboardGridItem[], widgets: DashboardWidget[]) {
  const widgetIds = new Set(widgets.map((widget) => widget.id));
  const ordered = [...layout]
    .filter((item) => widgetIds.has(item.i))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  let x = 0;
  let y = 0;
  let rowHeight = 0;

  return ordered.map((item) => {
    const width = Math.min(Math.max(item.w, item.minW ?? 4), GRID_COLS);
    if (x > 0 && x + width > GRID_COLS) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }

    const next = {
      ...item,
      x,
      y,
      w: width,
    };

    x += width;
    rowHeight = Math.max(rowHeight, item.h);
    return next;
  });
}

function queuePromptForHomeV2(prompt: string) {
  queueHomeV2Prompt(prompt);
}

function DashboardStatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-gray-600">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function StoreDashboardManager() {
  const { state: sidebarState, setOpen: setSidebarOpen } = useSidebar();
  const [state, setState] = React.useState<StoreDashboardState>({ widgets: [], layout: [] });
  const [editingWidgetId, setEditingWidgetId] = React.useState<string | null>(null);
  const [compressLayout, setCompressLayout] = React.useState(false);
  const [gridWidth, setGridWidth] = React.useState(1200);
  const [portalReady, setPortalReady] = React.useState(false);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const openTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setState(readStoreDashboard());
    setPortalReady(true);
  }, []);

  React.useEffect(() => {
    const node = gridRef.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setGridWidth(Math.max(entry.contentRect.width, 320));
    });

    observer.observe(node);
    setGridWidth(Math.max(node.clientWidth, 320));
    return () => observer.disconnect();
  }, [compressLayout]);

  React.useEffect(() => {
    return () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
    };
  }, []);

  const closeEditPanel = React.useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    setEditingWidgetId(null);
  }, []);

  React.useEffect(() => {
    if (!editingWidgetId) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEditPanel();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeEditPanel, editingWidgetId]);

  const openEditPanel = React.useCallback(
    (widgetId: string) => {
      if (openTimeoutRef.current) {
        clearTimeout(openTimeoutRef.current);
        openTimeoutRef.current = null;
      }

      if (editingWidgetId === widgetId) {
        closeEditPanel();
        return;
      }

      const revealPanel = () => {
        setCompressLayout(true);
        setEditingWidgetId(widgetId);
      };

      if (editingWidgetId) {
        revealPanel();
        return;
      }

      if (sidebarState === "expanded") {
        setSidebarOpen(false);
        openTimeoutRef.current = setTimeout(revealPanel, SIDEBAR_COLLAPSE_MS);
        return;
      }

      revealPanel();
    },
    [closeEditPanel, editingWidgetId, setSidebarOpen, sidebarState],
  );

  const handleLayoutChange = React.useCallback((layout: Layout) => {
    const nextLayout: DashboardGridItem[] = [...layout].map((item: LayoutItem) => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW ?? 4,
      minH: item.minH ?? 3,
    }));
    setState(updateDashboardLayout(nextLayout));
  }, []);

  const handleRemove = (widgetId: string) => {
    if (editingWidgetId === widgetId) closeEditPanel();
    setState(removeDashboardWidget(widgetId));
  };

  const handleWidgetSave = (
    widgetId: string,
    updates: Parameters<typeof updateDashboardWidget>[1],
  ) => {
    setState(updateDashboardWidget(widgetId, updates));
  };

  const handleQueryApplied = (
    widgetId: string,
    result: {
      payload: StoreDashboardState["widgets"][number]["payload"];
      querySource: NonNullable<StoreDashboardState["widgets"][number]["querySource"]>;
    },
  ) => {
    setState(
      updateDashboardWidget(widgetId, {
        payload: result.payload,
        querySource: result.querySource,
      }),
    );
  };

  const handleRefresh = React.useCallback(() => {
    setState(readStoreDashboard());
  }, []);

  const handleAutoArrange = React.useCallback(() => {
    const nextLayout = arrangeLayout(state.layout, state.widgets);
    setState(updateDashboardLayout(nextLayout));
  }, [state.layout, state.widgets]);

  const handlePanelExitComplete = React.useCallback(() => {
    setCompressLayout(false);
  }, []);

  const stats = React.useMemo(() => dashboardStats(state), [state]);
  const widgetMap = React.useMemo(
    () => new Map(state.widgets.map((widget) => [widget.id, widget])),
    [state.widgets],
  );
  const dashboardLayout = React.useMemo(
    () => state.layout.filter((item) => widgetMap.has(item.i)),
    [state.layout, widgetMap],
  );

  if (state.widgets.length === 0) {
    return (
      <div className="overflow-hidden rounded-md border border-gray-200 bg-white shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <Badge variant="outline" className="mb-4 rounded-md border-gray-200 bg-gray-50 text-gray-700">
              <Sparkles className="h-3 w-3" />
              Genie dashboard
            </Badge>
            <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-foreground">
              Start with the store questions worth checking every morning.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Ask Genie for a chart, table, or pivot, then pin the result here as your store command center.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button asChild className="rounded-md">
                <Link
                  href="/settings/store/home"
                  onClick={() => queuePromptForHomeV2(STARTER_PROMPTS[0].prompt)}
                >
                  <Sparkles className="h-4 w-4" />
                  Build sales pulse
                </Link>
              </Button>
              <Button asChild variant="outline" className="rounded-md">
                <Link href="/settings/store/home">
                  <LayoutGrid className="h-4 w-4" />
                  Open Homev2
                </Link>
              </Button>
            </div>

            <div className="mt-7 grid gap-2 sm:grid-cols-3">
              {STARTER_PROMPTS.map((item) => (
                <Link
                  key={item.label}
                  href="/settings/store/home"
                  onClick={() => queuePromptForHomeV2(item.prompt)}
                  className="rounded-md border border-gray-200 bg-gray-50 px-3 py-3 text-left text-sm font-medium text-foreground transition-colors hover:border-gray-300 hover:bg-white"
                >
                  <span className="block">{item.label}</span>
                  <span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">
                    Send to Genie
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-200 bg-[linear-gradient(180deg,#fafafa_0%,#f3f4f6_100%)] p-4 lg:border-l lg:border-t-0">
            <div className="grid h-full min-h-[280px] grid-rows-[1fr_0.8fr] gap-3">
              <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[var(--notion-blue)]" />
                    <span className="text-xs font-medium text-foreground">Revenue trend</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">Live</span>
                </div>
                <div className="flex h-36 items-end gap-2">
                  {[42, 68, 53, 86, 74, 96, 88].map((height, index) => (
                    <div
                      key={index}
                      className="min-w-0 flex-1 rounded-t-sm bg-[var(--primary)]"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[var(--notion-green)]" />
                    <span className="text-xs font-medium text-foreground">Stock watch</span>
                  </div>
                  <div className="space-y-2">
                    {[72, 56, 84].map((width, index) => (
                      <div key={index} className="h-2 rounded-sm bg-gray-100">
                        <div className="h-full rounded-sm bg-gray-700" style={{ width: `${width}%` }} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[var(--notion-purple)]" />
                    <span className="text-xs font-medium text-foreground">Workshop</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Array.from({ length: 9 }).map((_, index) => (
                      <div
                        key={index}
                        className={cn(
                          "h-8 rounded-sm",
                          index % 4 === 0 ? "bg-gray-800" : index % 3 === 0 ? "bg-gray-300" : "bg-gray-100",
                        )}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const editingWidget = editingWidgetId ? widgetMap.get(editingWidgetId) : undefined;

  const panelLayer =
    portalReady && typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence onExitComplete={handlePanelExitComplete}>
            {editingWidget ? (
              <React.Fragment key="dashboard-edit-layer">
                <motion.button
                  type="button"
                  key="dashboard-edit-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-30 cursor-default bg-black/10"
                  style={{ top: DASHBOARD_EDIT_PANEL_TOP }}
                  aria-label="Close edit panel"
                  onClick={closeEditPanel}
                />
                <DashboardWidgetEditPanel
                  key={editingWidget.id}
                  widget={editingWidget}
                  onClose={closeEditPanel}
                  onSave={(updates) => handleWidgetSave(editingWidget.id, updates)}
                  onQueryApplied={(result) => handleQueryApplied(editingWidget.id, result)}
                />
              </React.Fragment>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardStatTile
            label="Widgets"
            value={state.widgets.length}
            detail={`${stats.charts} charts, ${stats.tables} tables, ${stats.pivots} pivots`}
            icon={LayoutGrid}
          />
          <DashboardStatTile
            label="Live queries"
            value={stats.liveWidgets}
            detail={`${stats.snapshots} pinned snapshots`}
            icon={Database}
          />
          <DashboardStatTile
            label="Last pinned"
            value={stats.lastPinned}
            detail="Most recent dashboard addition"
            icon={Clock3}
          />
          <DashboardStatTile
            label="Grid"
            value={dashboardLayout.length}
            detail="Active widgets on the canvas"
            icon={Rows3}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-md border border-gray-200 bg-white px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-md border-gray-200 bg-gray-50 text-gray-700">
              <Database className="h-3 w-3" />
              {stats.liveWidgets} live
            </Badge>
            <Badge variant="outline" className="rounded-md border-gray-200 bg-gray-50 text-gray-700">
              <FileText className="h-3 w-3" />
              {stats.snapshots} snapshots
            </Badge>
            <span className="text-xs text-muted-foreground">
              Layout saved in this browser.
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={handleRefresh}
                  aria-label="Refresh dashboard"
                  className="rounded-md"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh dashboard</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={handleAutoArrange}
                  disabled={dashboardLayout.length < 2}
                  aria-label="Auto-arrange widgets"
                  className="rounded-md"
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Auto-arrange widgets</TooltipContent>
            </Tooltip>

            <Button asChild className="rounded-md">
              <Link href="/settings/store/home">
                <Sparkles className="h-4 w-4" />
                Ask Genie
              </Link>
            </Button>
          </div>
        </div>

        <div
          className="relative"
          style={{ marginRight: compressLayout ? DASHBOARD_EDIT_PANEL_WIDTH : 0 }}
        >
          <div ref={gridRef} className="store-dashboard-grid -mx-1 min-w-0">
            <ReactGridLayout
              className="layout"
              width={gridWidth}
              cols={GRID_COLS}
              rowHeight={ROW_HEIGHT}
              margin={[12, 12]}
              containerPadding={[4, 0]}
              layout={dashboardLayout}
              onLayoutChange={handleLayoutChange}
              draggableHandle=".dashboard-drag-handle"
              compactType="vertical"
              resizeHandles={["se"]}
            >
              {dashboardLayout.map((item) => {
                const widget = widgetMap.get(item.i);
                if (!widget) return null;
                const isEditing = editingWidgetId === item.i;
                const hasQuery = Boolean(widget.querySource?.sql?.trim());
                const meta = WIDGET_META[widget.payload.type];
                const WidgetIcon = meta.icon;

                return (
                  <div
                    key={item.i}
                    className={cn(
                      "group relative flex h-full min-h-0 flex-col overflow-hidden rounded-md border bg-white shadow-sm transition-all duration-200",
                      isEditing
                        ? "border-gray-300 ring-2 ring-gray-200"
                        : "border-gray-200 hover:border-gray-300 hover:shadow-md",
                    )}
                  >
                    <div className={cn("absolute inset-x-0 top-0 h-1", meta.accentClassName)} />
                    <div className="dashboard-drag-handle flex shrink-0 cursor-grab items-start justify-between gap-3 border-b border-gray-200 bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] px-3 pb-3 pt-4 active:cursor-grabbing">
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500">
                          <GripVertical className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="rounded-md border-gray-200 bg-gray-50 text-[10px] text-gray-700">
                              <WidgetIcon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "rounded-md border-gray-200 text-[10px]",
                                hasQuery
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-gray-50 text-gray-600",
                              )}
                            >
                              {hasQuery ? <Database className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                              {hasQuery ? "Live" : "Snapshot"}
                            </Badge>
                          </div>
                          <h3 title={widget.title} className="mt-2 truncate text-sm font-semibold text-foreground">
                            {widget.title}
                          </h3>
                          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Clock3 className="h-3 w-3" />
                              {formatRelativeTime(widget.addedAt)}
                            </span>
                            <span>{widgetDataFootprint(widget)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              className={cn(
                                "rounded-md text-muted-foreground hover:text-foreground",
                                isEditing && "bg-gray-100 text-foreground",
                              )}
                              onMouseDown={(event) => event.stopPropagation()}
                              onTouchStart={(event) => event.stopPropagation()}
                              onClick={() => openEditPanel(widget.id)}
                              aria-label={`Edit ${widget.title}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit widget</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleRemove(widget.id)}
                              className="rounded-md text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${widget.title}`}
                              onMouseDown={(event) => event.stopPropagation()}
                              onTouchStart={(event) => event.stopPropagation()}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove widget</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto bg-white p-3">
                      <DashboardWidgetRenderer widget={widget} />
                    </div>
                  </div>
                );
              })}
            </ReactGridLayout>
          </div>
        </div>
        {panelLayer}
      </div>
    </TooltipProvider>
  );
}
