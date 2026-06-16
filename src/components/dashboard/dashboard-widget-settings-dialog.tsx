"use client";

import * as React from "react";
import { Settings2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardWidget, DashboardWidgetPayload } from "@/lib/dashboard/store-dashboard";
import type { PivotValueFormat } from "@/lib/genie/pivot-table";
import {
  VISUAL_DATE_FORMAT_OPTIONS,
  VISUAL_VALUE_FORMAT_OPTIONS,
  type VisualDateFormat,
  type VisualValueFormat,
} from "@/lib/genie/visual-format";
import type { GenieTableColumn } from "@/lib/genie/visual-payloads";

interface DashboardWidgetSettingsDialogProps {
  widget: DashboardWidget;
  onSave: (updates: {
    title: string;
    dateFormat: VisualDateFormat;
    payload?: DashboardWidgetPayload;
  }) => void;
}

function clonePayload(payload: DashboardWidgetPayload): DashboardWidgetPayload {
  return JSON.parse(JSON.stringify(payload)) as DashboardWidgetPayload;
}

export function DashboardWidgetSettingsDialog({
  widget,
  onSave,
}: DashboardWidgetSettingsDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(widget.title);
  const [dateFormat, setDateFormat] = React.useState<VisualDateFormat>(widget.dateFormat ?? "default");
  const [columnFormats, setColumnFormats] = React.useState<Record<string, VisualValueFormat | "">>({});
  const [pivotValueFormat, setPivotValueFormat] = React.useState<PivotValueFormat>("number");

  React.useEffect(() => {
    if (!open) return;
    setTitle(widget.title);
    setDateFormat(widget.dateFormat ?? "default");

    if (widget.payload.type === "table") {
      setColumnFormats(
        Object.fromEntries(
          widget.payload.data.columns.map((column) => [column.key, column.format ?? ""]),
        ),
      );
    }

    if (widget.payload.type === "pivot") {
      setPivotValueFormat(widget.payload.data.value.format ?? "number");
    }
  }, [open, widget]);

  const supportsFormatting = widget.payload.type === "table" || widget.payload.type === "pivot";

  const handleSave = () => {
    const trimmedTitle = title.trim() || widget.title;
    let payload = widget.payload;

    if (widget.payload.type === "table") {
      const nextPayload = clonePayload(widget.payload);
      if (nextPayload.type === "table") {
        nextPayload.data.columns = nextPayload.data.columns.map((column) => {
          const selected = columnFormats[column.key] ?? "";
          const nextColumn: GenieTableColumn = { ...column };
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
      payload: payload !== widget.payload ? payload : undefined,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
          aria-label={`Customise ${widget.title}`}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(36rem,90vh)] overflow-y-auto rounded-md bg-white sm:max-w-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <DialogHeader>
          <DialogTitle>Widget settings</DialogTitle>
          <DialogDescription>
            Adjust how this widget looks on your dashboard. Changes are saved locally.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor={`widget-title-${widget.id}`}>Title</Label>
            <Input
              id={`widget-title-${widget.id}`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="rounded-md"
              placeholder="Widget title"
            />
          </div>

          {supportsFormatting ? (
            <div className="space-y-2">
              <Label>Date format</Label>
              <Select value={dateFormat} onValueChange={(value) => setDateFormat(value as VisualDateFormat)}>
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
                Applies to date values in rows, columns, and table cells.
              </p>
            </div>
          ) : null}

          {widget.payload.type === "table" ? (
            <div className="space-y-3 rounded-md border border-gray-200 bg-white p-3">
              <p className="text-sm font-medium text-foreground">Column formats</p>
              {widget.payload.data.columns.map((column) => (
                <div key={column.key} className="flex items-center justify-between gap-3">
                  <Label className="min-w-0 flex-1 truncate text-sm font-normal text-muted-foreground">
                    {column.label}
                  </Label>
                  <Select
                    value={columnFormats[column.key] || "auto"}
                    onValueChange={(value) =>
                      setColumnFormats((current) => ({
                        ...current,
                        [column.key]: value === "auto" ? "" : (value as VisualValueFormat),
                      }))
                    }
                  >
                    <SelectTrigger className="w-[8.5rem] rounded-md">
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
              ))}
            </div>
          ) : null}

          {widget.payload.type === "pivot" ? (
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
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="rounded-md" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" className="rounded-md" onClick={handleSave}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
