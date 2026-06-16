"use client";

import * as React from "react";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProductBrandCellProps = {
  productId: string;
  brandName: string | null;
  onUpdated: (brand: string) => void;
};

export function ProductBrandCell({
  productId,
  brandName,
  onUpdated,
}: ProductBrandCellProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(brandName || "");
  const [saving, setSaving] = React.useState(false);
  const [identifying, setIdentifying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!editing) setDraft(brandName || "");
  }, [brandName, editing]);

  React.useEffect(() => {
    if (editing) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [editing]);

  React.useEffect(() => {
    if (!editing) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setEditing(false);
        setError(null);
        setDraft(brandName || "");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [editing, brandName]);

  const busy = saving || identifying;

  const handleSave = async () => {
    const value = draft.trim();
    if (!value) {
      setError("Enter a brand name.");
      return;
    }
    if (value === (brandName || "").trim()) {
      setEditing(false);
      setError(null);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/products/set-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, brandName: value }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Failed to save brand");
      }
      const savedBrand = json.result?.brand || value;
      onUpdated(savedBrand);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save brand");
    } finally {
      setSaving(false);
    }
  };

  const handleAiIdentify = async () => {
    setIdentifying(true);
    setError(null);
    try {
      const response = await fetch("/api/optimize/identify-brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [productId] }),
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Brand identification failed");
      }

      const result = (json.results ?? []).find(
        (row: { productId: string }) => row.productId === productId,
      );

      if (result?.brand) {
        onUpdated(result.brand);
        setDraft(result.brand);
        setEditing(false);
      } else {
        throw new Error(result?.error || "Could not identify a brand");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Brand identification failed");
    } finally {
      setIdentifying(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSave();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
      setError(null);
      setDraft(brandName || "");
    }
  };

  if (editing) {
    return (
      <div ref={containerRef} className="relative z-20 w-[200px]">
        <div className="rounded-md border border-border bg-white p-2 shadow-sm">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Brand name"
            disabled={busy}
            className="h-7 rounded-md text-[11px]"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Button
              type="button"
              size="xs"
              className="h-6 rounded-md px-2 text-[10px]"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="h-6 rounded-md px-2 text-[10px]"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setError(null);
                setDraft(brandName || "");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="h-6 rounded-md px-2 text-[10px]"
              disabled={busy}
              onClick={() => void handleAiIdentify()}
              title="Identify brand with AI and write to Lightspeed"
            >
              {identifying ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3" />
              )}
              AI
            </Button>
          </div>
          {error ? (
            <p className="mt-1.5 flex items-start gap-1 text-[10px] text-destructive">
              <AlertCircle className="mt-0.5 size-3 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const hasBrand = !!brandName?.trim();

  return (
    <div className="flex max-w-full min-w-0 items-center gap-1">
      <button
        type="button"
        onClick={() => {
          setEditing(true);
          setError(null);
          setDraft(brandName || "");
        }}
        className={cn(
          "block min-w-0 flex-1 truncate rounded-md border border-transparent px-1 py-0.5 text-left text-[11px] transition-colors hover:border-border hover:bg-white",
          hasBrand ? "text-foreground" : "text-muted-foreground",
        )}
        title={hasBrand ? `Edit brand: ${brandName}` : "Add brand"}
      >
        {hasBrand ? brandName : "—"}
      </button>
      {!hasBrand ? (
        <button
          type="button"
          onClick={() => void handleAiIdentify()}
          disabled={identifying}
          title="Auto-add brand with AI"
          className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-md border border-dashed border-border bg-white px-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          {identifying ? (
            <Loader2 className="size-2.5 animate-spin" />
          ) : (
            <Sparkles className="size-2.5" />
          )}
          AI
        </button>
      ) : null}
    </div>
  );
}
