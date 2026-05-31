"use client";

import * as React from "react";
import { Reorder, motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Layers,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { StoreSection, StoreCategory } from "@/lib/types/store";

// ============================================================
// Store Sections Manager
// Create named groupings (e.g. "Nutrition") that contain
// category carousels (e.g. "Clif", "GU", "Specials").
// ============================================================

interface SectionWithCategories extends StoreSection {
  categoryRows: StoreCategory[];
}

export function StoreSectionsManager() {
  const [sections, setSections] = React.useState<SectionWithCategories[]>([]);
  const [categories, setCategories] = React.useState<StoreCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // New / edit section dialog
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingSection, setEditingSection] = React.useState<StoreSection | null>(null);
  const [formName, setFormName] = React.useState("");
  const [formDescription, setFormDescription] = React.useState("");

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);

  // Assign carousels dialog
  const [assignSectionId, setAssignSectionId] = React.useState<string | null>(null);

  // Collapsed sections
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [sectionsRes, categoriesRes] = await Promise.all([
        fetch("/api/store/sections"),
        fetch("/api/store/categories"),
      ]);
      const sectionsData = sectionsRes.ok ? await sectionsRes.json() : { sections: [] };
      const categoriesData = categoriesRes.ok ? await categoriesRes.json() : { categories: [] };

      const allCats: StoreCategory[] = categoriesData.categories || [];
      const rawSections: StoreSection[] = sectionsData.sections || [];

      setSections(
        rawSections.map((s) => ({
          ...s,
          categoryRows: allCats.filter((c) => (c as any).section_id === s.id),
        }))
      );
      setCategories(allCats);
    } catch (err) {
      console.error("Error fetching sections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Create / edit section ──────────────────────────────────
  const openCreate = () => {
    setEditingSection(null);
    setFormName("");
    setFormDescription("");
    setIsDialogOpen(true);
  };

  const openEdit = (section: SectionWithCategories) => {
    setEditingSection(section);
    setFormName(section.name);
    setFormDescription(section.description ?? "");
    setIsDialogOpen(true);
  };

  const handleSaveSection = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingSection) {
        await fetch("/api/store/sections", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingSection.id,
            name: formName,
            description: formDescription || null,
          }),
        });
      } else {
        await fetch("/api/store/sections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: formName, description: formDescription || undefined }),
        });
      }
      await fetchData();
      setIsDialogOpen(false);
    } catch (err) {
      console.error("Error saving section:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete section ─────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/store/sections?id=${id}`, { method: "DELETE" });
      await fetchData();
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // ── Reorder sections ───────────────────────────────────────
  const handleReorder = async (newOrder: SectionWithCategories[]) => {
    setSections(newOrder);
    await Promise.all(
      newOrder.map((section, index) =>
        fetch("/api/store/sections", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: section.id, display_order: index }),
        })
      )
    );
  };

  // ── Assign / remove carousel from section ─────────────────
  const handleAssign = async (categoryId: string, sectionId: string) => {
    await fetch("/api/store/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: categoryId, section_id: sectionId }),
    });
    await fetchData();
  };

  const handleRemoveFromSection = async (categoryId: string) => {
    await fetch("/api/store/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: categoryId, section_id: null }),
    });
    await fetchData();
  };

  // ── Logo upload ────────────────────────────────────────────
  const [uploadingLogoId, setUploadingLogoId] = React.useState<string | null>(null);

  const handleLogoUpload = async (categoryId: string, file: File) => {
    setUploadingLogoId(categoryId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("categoryId", categoryId);
      const res = await fetch("/api/store/categories/upload-logo", { method: "POST", body: fd });
      if (res.ok) await fetchData();
    } catch (err) {
      console.error("Logo upload error:", err);
    } finally {
      setUploadingLogoId(null);
    }
  };

  const unassignedCategories = categories.filter(
    (c) => !(c as any).section_id
  );

  const assignTargetSection = sections.find((s) => s.id === assignSectionId);
  const assignableCategories = unassignedCategories;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Group your product carousels into named sections shown on your store page.
        </p>
        <Button onClick={openCreate} className="rounded-md flex-shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          New Section
        </Button>
      </div>

      {/* Section list */}
      {sections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Layers className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No sections yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
            Create a section to group your carousels — e.g. "Nutrition" containing Clif, GU and Specials carousels.
          </p>
          <Button onClick={openCreate} variant="outline" className="mt-4 rounded-md">
            <Plus className="h-4 w-4 mr-2" />
            Create first section
          </Button>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={sections}
          onReorder={handleReorder}
          className="space-y-2"
        >
          {sections.map((section) => {
            const isCollapsed = collapsed.has(section.id);
            return (
              <Reorder.Item key={section.id} value={section} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Section header row */}
                <div className="flex items-center gap-3 px-3 py-3">
                  <div className="cursor-grab text-muted-foreground/60 active:cursor-grabbing flex-shrink-0">
                    <GripVertical className="h-4 w-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {section.name}
                      </span>
                      <Badge variant="secondary" className="text-xs font-normal flex-shrink-0">
                        {section.categoryRows.length} carousel{section.categoryRows.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                    {section.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {section.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(section)}
                      className="h-8 w-8 p-0"
                      title="Edit section"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirmId(section.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Delete section"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCollapsed((prev) => {
                          const next = new Set(prev);
                          isCollapsed ? next.delete(section.id) : next.add(section.id);
                          return next;
                        })
                      }
                      className="h-8 w-8 p-0"
                    >
                      {isCollapsed ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronUp className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Expandable carousel list */}
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border bg-muted/20 px-3 py-2 space-y-1">
                        {section.categoryRows.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-2 text-center">
                            No carousels assigned yet
                          </p>
                        ) : (
                          section.categoryRows.map((cat) => (
                            <div
                              key={cat.id}
                              className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50 group"
                            >
                              {/* Logo thumbnail */}
                              <div className="flex-shrink-0 h-8 w-8 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center">
                                {uploadingLogoId === cat.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : (cat as any).logo_url ? (
                                  <Image
                                    src={(cat as any).logo_url}
                                    alt=""
                                    width={32}
                                    height={32}
                                    className="h-full w-full object-contain"
                                  />
                                ) : (
                                  <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm text-foreground truncate">{cat.name}</span>
                                  <Badge variant="outline" className="text-[10px] font-normal py-0 flex-shrink-0">
                                    {cat.source === "brand" ? "Brand" : cat.source === "lightspeed" ? "Lightspeed" : "Custom"}
                                  </Badge>
                                </div>
                                {/* Logo upload link */}
                                <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors mt-0.5">
                                  <ImagePlus className="h-3 w-3" />
                                  {(cat as any).logo_url ? "Change logo" : "Add logo"}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="sr-only"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleLogoUpload(cat.id, file);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveFromSection(cat.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                                title="Remove from section"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))
                        )}

                        {/* Assign button */}
                        {unassignedCategories.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAssignSectionId(section.id)}
                            className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors cursor-pointer"
                          >
                            <Plus className="h-3 w-3" />
                            Add carousels to this section
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}

      {/* Standalone carousels (not in any section) */}
      {unassignedCategories.length > 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/10 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Standalone carousels (not in any section)
          </p>
          <div className="space-y-1">
            {unassignedCategories.map((cat) => (
              <div key={cat.id} className="flex items-center gap-2 py-1">
                <span className="text-sm text-foreground flex-1 min-w-0 truncate">{cat.name}</span>
                <Badge variant="outline" className="text-[10px] font-normal py-0 flex-shrink-0">
                  {cat.source === "brand" ? "Brand" : cat.source === "lightspeed" ? "Lightspeed" : "Custom"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSection ? "Edit Section" : "New Section"}</DialogTitle>
            <DialogDescription>
              {editingSection
                ? "Update the section name and optional description."
                : "Create a named section to group carousels on your store page."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="section-name">Section name *</Label>
              <Input
                id="section-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Nutrition, Bikes, Specials"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveSection();
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="section-desc">
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="section-desc"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Fuel up for your next ride"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSaveSection} disabled={!formName.trim() || saving}>
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
              ) : editingSection ? (
                <><Check className="h-4 w-4 mr-2" />Save changes</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" />Create section</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign carousels dialog */}
      <Dialog open={assignSectionId !== null} onOpenChange={() => setAssignSectionId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add carousels to "{assignTargetSection?.name}"</DialogTitle>
            <DialogDescription>
              Select which standalone carousels to add to this section.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {assignableCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                All carousels are already assigned to sections.
              </p>
            ) : (
              assignableCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={async () => {
                    if (assignSectionId) {
                      await handleAssign(cat.id, assignSectionId);
                    }
                  }}
                  className="w-full flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat.source === "brand" ? `Brand: ${cat.brand_name}` : cat.source}
                      {" · "}{cat.product_ids.length} products
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignSectionId(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete section?</AlertDialogTitle>
            <AlertDialogDescription>
              The section will be removed. Its carousels will become standalone and remain on your store.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
