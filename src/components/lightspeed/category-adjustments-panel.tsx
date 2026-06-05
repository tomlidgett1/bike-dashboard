"use client";

import * as React from "react";
import { Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/lightspeed/delete-confirm-dialog";
import { cn } from "@/lib/utils";

export type ManagedLightspeedCategory = {
  categoryID: string;
  name: string;
  fullPathName: string;
  nodeDepth: string;
  parentID: string;
  productCount: number;
  createTime?: string;
  timeStamp?: string;
};

type CategoryAdjustmentsPanelProps = {
  onCategoriesChanged?: () => void | Promise<void>;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-AU").format(value);
}

export function CategoryAdjustmentsPanel({ onCategoriesChanged }: CategoryAdjustmentsPanelProps) {
  const [categories, setCategories] = React.useState<ManagedLightspeedCategory[]>([]);
  const [uncategorisedProductCount, setUncategorisedProductCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createParentId, setCreateParentId] = React.useState("0");
  const [creating, setCreating] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<ManagedLightspeedCategory | null>(null);

  const loadCategories = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch("/api/lightspeed/categories/manage");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to load categories");
      }

      setCategories(data.categories || []);
      setUncategorisedProductCount(data.uncategorisedProductCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  React.useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const startEditing = (category: ManagedLightspeedCategory) => {
    setEditingId(category.categoryID);
    setDraftName(category.name);
    setError(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftName("");
  };

  const saveCategoryName = async (category: ManagedLightspeedCategory) => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError("Category name cannot be empty.");
      return;
    }
    if (trimmed === category.name) {
      cancelEditing();
      return;
    }

    setSavingId(category.categoryID);
    setError(null);

    try {
      const response = await fetch("/api/lightspeed/categories/manage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryID: category.categoryID,
          name: trimmed,
          parentID: category.parentID,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update category");
      }

      setCategories((prev) =>
        prev.map((item) =>
          item.categoryID === category.categoryID
            ? { ...item, ...data.category }
            : item
        )
      );
      setMessage(`Updated "${trimmed}" in Lightspeed.`);
      cancelEditing();
      await onCategoriesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateCategory = async () => {
    const trimmed = createName.trim();
    if (!trimmed) {
      setError("Category name is required.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/lightspeed/categories/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          parentID: createParentId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create category");
      }

      setCategories((prev) =>
        [...prev, data.category].sort((a, b) =>
          (a.fullPathName || a.name).localeCompare(b.fullPathName || b.name)
        )
      );
      setMessage(`Created "${trimmed}" in Lightspeed.`);
      setCreateOpen(false);
      setCreateName("");
      setCreateParentId("0");
      await onCategoriesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteTarget) return;

    setDeletingId(deleteTarget.categoryID);
    setError(null);

    try {
      const response = await fetch("/api/lightspeed/categories/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryID: deleteTarget.categoryID }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete category");
      }

      setCategories((prev) =>
        prev.filter((item) => item.categoryID !== deleteTarget.categoryID)
      );
      setMessage(`Deleted "${deleteTarget.name}" from Lightspeed.`);
      setDeleteTarget(null);
      await onCategoriesChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setDeletingId(null);
    }
  };

  const parentCategoryOptions = categories;

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="px-6 py-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Category adjustments</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              View, rename, create, or delete Lightspeed inventory categories. Changes apply directly in Lightspeed.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => loadCategories(true)}
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh
            </Button>
            <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              Create category
            </Button>
          </div>
        </div>

        {(error || message) && (
          <div
            className={cn(
              "mb-4 rounded-md border px-4 py-3 text-sm",
              error
                ? "border-red-200 bg-white text-red-700"
                : "border-border bg-white text-foreground"
            )}
          >
            {error || message}
          </div>
        )}

        {uncategorisedProductCount > 0 && (
          <div className="mb-4 rounded-md border border-border bg-white px-4 py-3 text-sm text-muted-foreground">
            {formatNumber(uncategorisedProductCount)} products are not assigned to a Lightspeed category.
          </div>
        )}

        <div className="overflow-hidden rounded-md border border-border bg-white">
          <table className="w-full">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Category
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Path
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Products
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No Lightspeed categories found.
                  </td>
                </tr>
              ) : (
                categories.map((category) => {
                  const isEditing = editingId === category.categoryID;
                  const isSaving = savingId === category.categoryID;
                  const isDeleting = deletingId === category.categoryID;

                  return (
                    <tr
                      key={category.categoryID}
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Input
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                            className="h-9 max-w-sm"
                            autoFocus
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                void saveCategoryName(category);
                              }
                              if (event.key === "Escape") {
                                cancelEditing();
                              }
                            }}
                          />
                        ) : (
                          <div>
                            <p className="text-sm font-medium text-foreground">{category.name}</p>
                            {category.parentID && category.parentID !== "0" && (
                              <p className="text-xs text-muted-foreground">
                                Subcategory · depth {category.nodeDepth}
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {category.fullPathName || category.name}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-foreground">
                        {formatNumber(category.productCount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={cancelEditing}
                                disabled={isSaving}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => saveCategoryName(category)}
                                disabled={isSaving}
                              >
                                {isSaving ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  "Save"
                                )}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => startEditing(category)}
                                disabled={isDeleting}
                              >
                                <Pencil className="size-4" />
                                Rename
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setDeleteTarget(category)}
                                disabled={isDeleting}
                              >
                                {isDeleting ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle>Create category</DialogTitle>
            <DialogDescription>
              Adds a new category in Lightspeed. You can place it at the top level or under an existing category.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="e.g. Helmets"
              />
            </div>

            <div className="space-y-2">
              <Label>Parent category</Label>
              <Select value={createParentId} onValueChange={setCreateParentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Top level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Top level</SelectItem>
                  {parentCategoryOptions.map((category) => (
                    <SelectItem key={category.categoryID} value={category.categoryID}>
                      {category.fullPathName || category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleCreateCategory} disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteCategory}
        isDeleting={Boolean(deletingId)}
        title="Delete Lightspeed category?"
        description={
          deleteTarget
            ? `Delete "${deleteTarget.name}" from Lightspeed? This is permanent.${
                deleteTarget.productCount > 0
                  ? ` ${formatNumber(deleteTarget.productCount)} products are currently assigned to this category.`
                  : ""
              }`
            : undefined
        }
        itemCount={1}
        itemType="categories"
      />
    </>
  );
}
