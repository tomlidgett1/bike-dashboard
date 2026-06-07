"use client";

import * as React from "react";
import { Loader2, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { mergeVisualArgsWithWidget } from "@/lib/dashboard/dashboard-query-visual";
import type { DashboardWidget } from "@/lib/dashboard/store-dashboard";

type QueryDialogMode = "edit" | "ai_edit";

interface DashboardWidgetQueryDialogProps {
  widget: DashboardWidget;
  mode: QueryDialogMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: (result: {
    payload: DashboardWidget["payload"];
    querySource: NonNullable<DashboardWidget["querySource"]>;
    title?: string;
  }) => void;
}

export function DashboardWidgetQueryDialog({
  widget,
  mode,
  open,
  onOpenChange,
  onApplied,
}: DashboardWidgetQueryDialogProps) {
  const [sql, setSql] = React.useState(widget.querySource?.sql ?? "");
  const [instruction, setInstruction] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSql(widget.querySource?.sql ?? "");
    setInstruction("");
    setError(null);
    setRunning(false);
  }, [open, widget]);

  const querySource = widget.querySource;
  const canRun = Boolean(querySource?.sql?.trim());

  const handleRun = async () => {
    if (!querySource) return;

    setRunning(true);
    setError(null);

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
        setError(typeof data.error === "string" ? data.error : "Query failed.");
        return;
      }

      onApplied({
        payload: data.payload,
        querySource: data.querySource,
        title: widget.title,
      });
      onOpenChange(false);
    } catch {
      setError("Query failed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  if (!querySource) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(40rem,90vh)] overflow-y-auto rounded-md bg-white sm:max-w-2xl animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "edit" ? <Pencil className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {mode === "edit" ? "Edit query" : "AI edit query"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update the SQL behind this widget and refresh the visual."
              : "Describe the change you want. Genie will rewrite the SQL and refresh the widget."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
            <p className="text-xs font-medium text-foreground">{querySource.purpose}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {querySource.visualType} widget · Lightspeed SQL
            </p>
          </div>

          {mode === "edit" ? (
            <div className="space-y-2">
              <Label htmlFor={`widget-sql-${widget.id}`}>SQL</Label>
              <Textarea
                id={`widget-sql-${widget.id}`}
                value={sql}
                onChange={(event) => setSql(event.target.value)}
                rows={12}
                className="rounded-md font-mono text-xs"
                spellCheck={false}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor={`widget-ai-instruction-${widget.id}`}>What should change?</Label>
                <Textarea
                  id={`widget-ai-instruction-${widget.id}`}
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  rows={4}
                  className="rounded-md text-sm"
                  placeholder="e.g. Show last 90 days only, group by category, and sort highest revenue first"
                />
              </div>
              <div className="space-y-2">
                <Label>Current SQL</Label>
                <pre className="max-h-48 overflow-auto rounded-md bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-700 ring-1 ring-black/[0.04]">
                  {querySource.sql}
                </pre>
              </div>
            </div>
          )}

          {error ? (
            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="rounded-md"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-md"
            onClick={handleRun}
            disabled={
              running
              || !canRun
              || (mode === "edit" ? !sql.trim() : !instruction.trim())
            }
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === "edit" ? "Run query" : "Apply with AI"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardWidgetQueryActions({
  widget,
  onApplied,
}: {
  widget: DashboardWidget;
  onApplied: (result: {
    payload: DashboardWidget["payload"];
    querySource: NonNullable<DashboardWidget["querySource"]>;
  }) => void;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const hasQuery = Boolean(widget.querySource?.sql?.trim());

  if (!hasQuery) {
    return (
      <span
        title="Re-pin this visual from Homev2 to enable query editing"
        className="rounded-md px-2 py-1 text-[10px] text-muted-foreground"
      >
        Snapshot
      </span>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onClick={() => setEditOpen(true)}
      >
        Edit
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onClick={() => setAiOpen(true)}
      >
        <Sparkles className="h-3 w-3" />
        AI edit
      </Button>
      <DashboardWidgetQueryDialog
        widget={widget}
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        onApplied={onApplied}
      />
      <DashboardWidgetQueryDialog
        widget={widget}
        mode="ai_edit"
        open={aiOpen}
        onOpenChange={setAiOpen}
        onApplied={onApplied}
      />
    </>
  );
}
