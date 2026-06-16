"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Loader2 } from "@/components/layout/app-sidebar/dashboard-icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveProductCategory } from "@/lib/missing-categories/client";
import type { LightspeedCategoryOption } from "@/lib/missing-categories/types";
import { formatCategoryDisplayLabel } from "@/lib/products/category-recognition";

const POPUP_WIDTH = 280;

type CategoryRow = LightspeedCategoryOption & { name: string };

type ProductCategoryCellProps = {
  productId: string;
  displayLabel: string;
  lightspeedCategoryId: string | null;
  onUpdated: (update: {
    categoryId: string;
    categoryName: string;
    fullCategoryPath: string;
    categoryLabel: string;
  }) => void;
};

let cachedCategories: CategoryRow[] | null = null;
let categoriesRequest: Promise<CategoryRow[]> | null = null;

async function fetchLightspeedCategories(): Promise<CategoryRow[]> {
  if (cachedCategories) return cachedCategories;
  if (!categoriesRequest) {
    categoriesRequest = fetch("/api/lightspeed/categories", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Could not load Lightspeed categories.");
        }
        const rows = Array.isArray(json.categories) ? json.categories : [];
        return rows
          .map((row: { categoryID: string | number; name: string; fullPathName?: string | null }) => ({
            categoryId: String(row.categoryID),
            name: row.name.trim(),
            label: formatCategoryDisplayLabel({
              name: row.name,
              fullPathName: row.fullPathName,
            }),
            fullPathName: (row.fullPathName || row.name).trim(),
          }))
          .sort((a: CategoryRow, b: CategoryRow) => a.label.localeCompare(b.label));
      })
      .then((categories) => {
        cachedCategories = categories;
        return categories;
      })
      .finally(() => {
        categoriesRequest = null;
      });
  }
  return categoriesRequest;
}

function useAnchoredPopupPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement | null>,
) {
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(POPUP_WIDTH, window.innerWidth - 24);
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
      setPosition({ top: rect.bottom + 6, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef]);

  return position;
}

export function ProductCategoryCell({
  productId,
  displayLabel,
  lightspeedCategoryId,
  onUpdated,
}: ProductCategoryCellProps) {
  const [editing, setEditing] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [categories, setCategories] = React.useState<CategoryRow[]>(cachedCategories ?? []);
  const [loadingCategories, setLoadingCategories] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const position = useAnchoredPopupPosition(editing, anchorRef);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const closeEditor = React.useCallback(() => {
    setEditing(false);
    setError(null);
    setQuery("");
    setSavingId(null);
  }, []);

  const openEditor = React.useCallback(async () => {
    setEditing(true);
    setError(null);
    setQuery("");

    if (cachedCategories) {
      setCategories(cachedCategories);
      return;
    }

    setLoadingCategories(true);
    try {
      const loaded = await fetchLightspeedCategories();
      setCategories(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load categories.");
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  React.useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [editing, position]);

  React.useEffect(() => {
    if (!editing) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      closeEditor();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [editing, closeEditor]);

  React.useEffect(() => {
    if (!editing) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeEditor();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editing, closeEditor]);

  const filteredCategories = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return categories;
    return categories.filter(
      (category) =>
        category.label.toLowerCase().includes(needle) ||
        category.fullPathName.toLowerCase().includes(needle),
    );
  }, [categories, query]);

  const handleSelect = async (category: CategoryRow) => {
    if (savingId) return;
    if (category.categoryId === lightspeedCategoryId) {
      closeEditor();
      return;
    }

    setSavingId(category.categoryId);
    setError(null);
    try {
      const response = await saveProductCategory(productId, category.categoryId);
      const categoryLabel = response.result?.categoryLabel || category.label;

      onUpdated({
        categoryId: category.categoryId,
        categoryName: category.name,
        fullCategoryPath: category.fullPathName,
        categoryLabel,
      });
      closeEditor();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save category.");
    } finally {
      setSavingId(null);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeEditor();
    }
    if (event.key === "Enter" && filteredCategories.length === 1) {
      event.preventDefault();
      void handleSelect(filteredCategories[0]);
    }
  };

  const hasLabel = !!displayLabel && displayLabel !== "—";

  const popup =
    editing && mounted && position ? (
      <div
        ref={popupRef}
        style={{ top: position.top, left: position.left, width: POPUP_WIDTH }}
        className="fixed z-[80] animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-200"
      >
        <div className="rounded-md border border-border bg-white p-2 shadow-lg">
          <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">
            Lightspeed category
          </p>
          <Input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search categories…"
            disabled={loadingCategories || Boolean(savingId)}
            className="h-7 rounded-md text-[11px]"
          />
          <div className="mt-1.5 max-h-44 overflow-y-auto rounded-md border border-border/60">
            {loadingCategories ? (
              <div className="flex items-center justify-center gap-2 py-6 text-[11px] text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading categories…
              </div>
            ) : filteredCategories.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">
                No categories match your search.
              </p>
            ) : (
              filteredCategories.map((category) => {
                const isActive = category.categoryId === lightspeedCategoryId;
                const isSaving = savingId === category.categoryId;
                return (
                  <button
                    key={category.categoryId}
                    type="button"
                    disabled={Boolean(savingId)}
                    onClick={() => void handleSelect(category)}
                    className={cn(
                      "flex w-full items-start gap-2 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/50",
                      isActive && "bg-muted/40 font-medium",
                      isSaving && "opacity-70",
                    )}
                  >
                    {isSaving ? (
                      <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-muted-foreground" />
                    ) : null}
                    <span className="min-w-0 truncate leading-tight">{category.label}</span>
                  </button>
                );
              })
            )}
          </div>
          <div className="mt-1.5 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 rounded-md px-2 text-[10px]"
              disabled={Boolean(savingId)}
              onClick={closeEditor}
            >
              Cancel
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
    ) : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void openEditor();
        }}
        className={cn(
          "block min-w-0 w-full truncate rounded-md border border-transparent px-1 py-0.5 text-left text-[11px] leading-tight transition-colors hover:border-border hover:bg-white",
          hasLabel ? "text-foreground" : "text-muted-foreground",
          editing && "border-border bg-white",
        )}
        title={
          hasLabel
            ? `Double-click to change category: ${displayLabel}`
            : "Double-click to set Lightspeed category"
        }
      >
        {hasLabel ? displayLabel : "—"}
      </button>
      {mounted && popup ? createPortal(popup, document.body) : null}
    </>
  );
}
