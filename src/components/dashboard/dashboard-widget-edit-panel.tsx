"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles, X } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { mergeVisualArgsWithWidget } from "@/lib/dashboard/dashboard-query-visual";
import type {
  DashboardFieldFormat,
  DashboardWidget,
  DashboardWidgetFieldFormats,
  DashboardWidgetPayload,
} from "@/lib/dashboard/store-dashboard";
import type { PivotValueFormat } from "@/lib/genie/pivot-table";
import {
  VISUAL_DATE_FORMAT_OPTIONS,
  VISUAL_VALUE_FORMAT_OPTIONS,
  type VisualDateFormat,
  type VisualValueFormat,
} from "@/lib/genie/visual-format";

export const DASHBOARD_EDIT_PANEL_WIDTH = 400;
export const DASHBOARD_EDIT_PANEL_TOP = "3rem";

const PANEL_TRANSITION = {
  type: "tween" as const,
  duration: 0.3,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
};

type EditPanelTab = "display" | "query" | "ai";

function clonePayload(payload: DashboardWidgetPayload): DashboardWidgetPayload {
  return JSON.parse(JSON.stringify(payload)) as DashboardWidgetPayload;
}

function fieldFormatFromWidget(
  widget: DashboardWidget,
  columnKey: string,
): DashboardFieldFormat {
  const stored = widget.fieldFormats?.tableColumns?.[columnKey];
  if (stored) return { ...stored };

  if (widget.payload.type === "table") {
    const column = widget.payload.data.columns.find((col) => col.key === columnKey);
    return {
      valueFormat: column?.format ?? "",
      dateFormat: "default",
    };
  }

  return { valueFormat: "", dateFormat: "default" };
}

interface DashboardWidgetEditPanelProps {
  widget: DashboardWidget;
  onClose: () => void;
  onSave: (updates: {
    title: string;
    dateFormat: VisualDateFormat;
    fieldFormats?: DashboardWidgetFieldFormats;
    payload?: DashboardWidgetPayload;
  }) => void;
  onQueryApplied: (result: {
    payload: DashboardWidget["payload"];
    querySource: NonNullable<DashboardWidget["querySource"]>;
  }) => void;
}

export function DashboardWidgetEditPanel({
  widget,
  onClose,
  onSave,
  onQueryApplied,
}: DashboardWidgetEditPanelProps) {
  const hasQuery = Boolean(widget.querySource?.sql?.trim());
  const [tab, setTab] = React.useState<EditPanelTab>("display");
  const [title, setTitle] = React.useState(widget.title);
  const [dateFormat, setDateFormat] = React.useState<VisualDateFormat>(widget.dateFormat ?? "default");
  const [tableColumnFormats, setTableColumnFormats] = React.useState<Record<string, DashboardFieldFormat>>({});
  const [pivotRowFormats, setPivotRowFormats] = React.useState<Record<string, VisualDateFormat>>({});
  const [pivotColumnFormats, setPivotColumnFormats] = React.useState<Record<string, VisualDateFormat>>({});
  const [pivotValueFormat, setPivotValueFormat] = React.useState<PivotValueFormat>("number");

  const [sql, setSql] = React.useState(widget.querySource?.sql ?? "");
  const [instruction, setInstruction] = React.useState("");
  const [queryError, setQueryError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    setTitle(widget.title);
    setDateFormat(widget.dateFormat ?? "default");
    setSql(widget.querySource?.sql ?? "");
    setInstruction("");
    setQueryError(null);
    setRunning(false);
    setTab("display");

    if (widget.payload.type === "table") {
      setTableColumnFormats(
        Object.fromEntries(
          widget.payload.data.columns.map((column) => [
            column.key,
            fieldFormatFromWidget(widget, column.key),
          ]),
        ),
      );
    }

    if (widget.payload.type === "pivot") {
      setPivotRowFormats(
        Object.fromEntries(
          widget.payload.data.row_fields.map((field) => [
            field.key,
            widget.fieldFormats?.pivotRowFields?.[field.key] ?? "default",
          ]),
        ),
      );
      setPivotColumnFormats(
        Object.fromEntries(
          widget.payload.data.column_fields.map((field) => [
            field.key,
            widget.fieldFormats?.pivotColumnFields?.[field.key] ?? "default",
          ]),
        ),
      );
      setPivotValueFormat(
        widget.fieldFormats?.pivotValueFormat
          ?? widget.payload.data.value.format
          ?? "number",
      );
    }
  }, [widget]);

  const supportsFieldFormats = widget.payload.type === "table" || widget.payload.type === "pivot";

  const handleSaveDisplay = () => {
    const trimmedTitle = title.trim() || widget.title;
    let payload = widget.payload;
    const fieldFormats: DashboardWidgetFieldFormats = { ...widget.fieldFormats };

    if (widget.payload.type === "table") {
      fieldFormats.tableColumns = tableColumnFormats;
      const nextPayload = clonePayload(widget.payload);
      if (nextPayload.type === "table") {
        nextPayload.data.columns = nextPayload.data.columns.map((column) => {
          const selected = tableColumnFormats[column.key]?.valueFormat ?? "";
          const nextColumn = { ...column };
          if (selected) {
            nextColumn.format = selected;
          } else {
            delete nextColumn.format;
          }
          return nextColumn;
        });
        payload = nextPayload;
      }
    }

    if (widget.payload.type === "pivot") {
      fieldFormats.pivotRowFields = pivotRowFormats;
      fieldFormats.pivotColumnFields = pivotColumnFormats;
      fieldFormats.pivotValueFormat = pivotValueFormat;
      const nextPayload = clonePayload(widget.payload);
      if (nextPayload.type === "pivot") {
        nextPayload.data.value = {
          ...nextPayload.data.value,
          format: pivotValueFormat,
        };
        payload = nextPayload;
      }
    }

    onSave({
      title: trimmedTitle,
      dateFormat,
      fieldFormats: supportsFieldFormats ? fieldFormats : undefined,
      payload: payload !== widget.payload ? payload : undefined,
    });
  };

  const runQuery = async (mode: "edit" | "ai_edit") => {
    const querySource = widget.querySource;
    if (!querySource) return;

    setRunning(true);
    setQueryError(null);

    try {
      const visual = mergeVisualArgsWithWidget(
        querySource.visual,
        widget.payload,
        widget.title,
      );

      const response = await fetch("/api/genie/dashboard/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          sql: mode === "edit" ? sql : querySource.sql,
          instruction: mode === "ai_edit" ? instruction : undefined,
          purpose: querySource.purpose,
          limit: querySource.limit,
          visual,
          visualType: querySource.visualType,
          widgetPayload: widget.payload,
          widgetTitle: widget.title,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setQueryError(typeof data.error === "string" ? data.error : "Query failed.");
        return;
      }

      onQueryApplied({
        payload: data.payload,
        querySource: data.querySource,
      });
    } catch {
      setQueryError("Query failed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const tabs: Array<{ id: EditPanelTab; label: string; icon?: React.ReactNode }> = [
    { id: "display", label: "Display" },
    ...(hasQuery
      ? [
          { id: "query" as const, label: "Query" },
          { id: "ai" as const, label: "AI", icon: <Sparkles className="h-3 w-3" /> },
        ]
      : []),
  ];

  return (
    <motion.aside
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={PANEL_TRANSITION}
      className="fixed bottom-0 z-40 flex flex-col overflow-hidden border-l border-gray-200 bg-white shadow-[-16px_0_40px_-12px_rgba(15,23,42,0.18)]"
      style={{
        top: DASHBOARD_EDIT_PANEL_TOP,
        right: 0,
        width: DASHBOARD_EDIT_PANEL_WIDTH,
        willChange: "transform",
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">Edit widget</p>
          <p className="truncate text-xs text-muted-foreground">{widget.title}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8 shrink-0 rounded-md"
          aria-label="Close edit panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="shrink-0 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                tab === item.id
                  ? "text-gray-800 bg-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-200/70",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {tab === "display" ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`edit-title-${widget.id}`}>Title</Label>
              <Input
                id={`edit-title-${widget.id}`}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-md"
                placeholder="Widget title"
              />
            </div>

            {supportsFieldFormats ? (
              <div className="space-y-2">
                <Label>Default date format</Label>
                <Select
                  value={dateFormat}
                  onValueChange={(value) => setDateFormat(value as VisualDateFormat)}
                >
                  <SelectTrigger className="rounded-md">
                    <SelectValue placeholder="Choose date format" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISUAL_DATE_FORMAT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                        {option.value !== "default" ? ` · ${option.example}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used as the fallback for any field without its own date format.
                </p>
              </div>
            ) : null}

            {widget.payload.type === "table" ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-foreground">Column formats</p>
                {widget.payload.data.columns.map((column) => {
                  const formats = tableColumnFormats[column.key] ?? fieldFormatFromWidget(widget, column.key);
                  return (
                    <div
                      key={column.key}
                      className="space-y-2 rounded-md border border-gray-200 bg-white p-3"
                    >
                      <p className="truncate text-sm font-medium text-foreground">{column.label}</p>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Value format</Label>
                        <Select
                          value={formats.valueFormat || "auto"}
                          onValueChange={(value) =>
                            setTableColumnFormats((current) => ({
                              ...current,
                              [column.key]: {
                                ...formats,
                                valueFormat: value === "auto" ? "" : (value as VisualValueFormat),
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="rounded-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VISUAL_VALUE_FORMAT_OPTIONS.map((option) => (
                              <SelectItem key={option.value || "auto"} value={option.value || "auto"}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Date format</Label>
                        <Select
                          value={formats.dateFormat ?? "default"}
                          onValueChange={(value) =>
                            setTableColumnFormats((current) => ({
                              ...current,
                              [column.key]: {
                                ...formats,
                                dateFormat: value as VisualDateFormat,
                              },
                            }))
                          }
                        >
                          <SelectTrigger className="rounded-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VISUAL_DATE_FORMAT_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {widget.payload.type === "pivot" ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Value format</Label>
                  <Select
                    value={pivotValueFormat}
                    onValueChange={(value) => setPivotValueFormat(value as PivotValueFormat)}
                  >
                    <SelectTrigger className="rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="currency">Currency</SelectItem>
                      <SelectItem value="percent">Percent</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {widget.payload.data.value.label}
                  </p>
                </div>

                {widget.payload.data.row_fields.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">Row field formats</p>
                    {widget.payload.data.row_fields.map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3"
                      >
                        <Label className="min-w-0 flex-1 truncate text-sm font-normal text-foreground">
                          {field.label}
                        </Label>
                        <Select
                          value={pivotRowFormats[field.key] ?? "default"}
                          onValueChange={(value) =>
                            setPivotRowFormats((current) => ({
                              ...current,
                              [field.key]: value as VisualDateFormat,
                            }))
                          }
                        >
                          <SelectTrigger className="w-[9.5rem] rounded-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VISUAL_DATE_FORMAT_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                ) : null}

                {widget.payload.data.column_fields.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-foreground">Column field formats</p>
                    {widget.payload.data.column_fields.map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3"
                      >
                        <Label className="min-w-0 flex-1 truncate text-sm font-normal text-foreground">
                          {field.label}
                        </Label>
                        <Select
                          value={pivotColumnFormats[field.key] ?? "default"}
                          onValueChange={(value) =>
                            setPivotColumnFormats((current) => ({
                              ...current,
                              [field.key]: value as VisualDateFormat,
                            }))
                          }
                        >
                          <SelectTrigger className="w-[9.5rem] rounded-md">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {VISUAL_DATE_FORMAT_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!hasQuery && widget.payload.type !== "table" && widget.payload.type !== "pivot" ? (
              <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-muted-foreground">
                Re-pin this visual from Homev2 to enable SQL query editing.
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "query" && hasQuery ? (
          <div className="space-y-4">
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
              <p className="text-xs font-medium text-foreground">{widget.querySource?.purpose}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {widget.querySource?.visualType} widget · Lightspeed SQL
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`edit-sql-${widget.id}`}>SQL</Label>
              <Textarea
                id={`edit-sql-${widget.id}`}
                value={sql}
                onChange={(event) => setSql(event.target.value)}
                rows={14}
                className="rounded-md font-mono text-xs"
                spellCheck={false}
              />
            </div>
            {queryError ? (
              <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-destructive">
                {queryError}
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "ai" && hasQuery ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`edit-ai-${widget.id}`}>What should change?</Label>
              <Textarea
                id={`edit-ai-${widget.id}`}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={5}
                className="rounded-md text-sm"
                placeholder="e.g. Show last 90 days only, group by category, and sort highest revenue first"
              />
            </div>
            <div className="space-y-2">
              <Label>Current SQL</Label>
              <pre className="max-h-48 overflow-auto rounded-md bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-700 ring-1 ring-black/[0.04]">
                {widget.querySource?.sql}
              </pre>
            </div>
            {queryError ? (
              <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-destructive">
                {queryError}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-gray-200 px-4 py-3">
        {tab === "display" ? (
          <Button type="button" className="w-full rounded-md" onClick={handleSaveDisplay}>
            Save display
          </Button>
        ) : tab === "query" ? (
          <Button
            type="button"
            className="w-full rounded-md"
            onClick={() => runQuery("edit")}
            disabled={running || !sql.trim()}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Run query
          </Button>
        ) : tab === "ai" ? (
          <Button
            type="button"
            className="w-full rounded-md"
            onClick={() => runQuery("ai_edit")}
            disabled={running || !instruction.trim()}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply with AI
          </Button>
        ) : null}
      </div>
    </motion.aside>
  );
}
