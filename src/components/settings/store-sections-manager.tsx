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
  Truck,
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
import { UberCarouselLogo } from "@/components/marketplace/store-profile/uber-carousel-logo";

// ============================================================
// Store Sections Manager — page layout + section grouping
// Shows a unified draggable list of sections and standalone
// carousels so stores can interleave them on the Products tab.
// ============================================================

interface SectionWithCategories extends StoreSection {
  categoryRows: StoreCategory[];
}

type PageItemType = 'section' | 'carousel';

interface PageItem {
  type: PageItemType;
  id: string;
  /** Resolved data — either the section or the standalone category */
  section?: SectionWithCategories;
  category?: StoreCategory;
}

function buildPageItems(
  savedLayout: Array<{ type: string; id: string }>,
  sections: SectionWithCategories[],
  standaloneCategories: StoreCategory[],
): PageItem[] {
  const sectionMap = new Map(sections.map((s) => [s.id, s]));
  const catMap = new Map(standaloneCategories.map((c) => [c.id, c]));

  const items: PageItem[] = [];
  const addedIds = new Set<string>();

  for (const entry of savedLayout) {
    if (entry.type === 'section') {
      const sec = sectionMap.get(entry.id);
      if (sec) { items.push({ type: 'section', id: entry.id, section: sec }); addedIds.add(entry.id); }
    } else if (entry.type === 'carousel') {
      const cat = catMap.get(entry.id);
      if (cat) { items.push({ type: 'carousel', id: entry.id, category: cat }); addedIds.add(entry.id); }
    }
  }

  // Append any sections / carousels not yet in the saved layout (newly created)
  for (const sec of sections) {
    if (!addedIds.has(sec.id)) items.push({ type: 'section', id: sec.id, section: sec });
  }
  for (const cat of standaloneCategories) {
    if (!addedIds.has(cat.id)) items.push({ type: 'carousel', id: cat.id, category: cat });
  }

  return items;
}

export function StoreSectionsManager() {
  const [sections, setSections] = React.useState<SectionWithCategories[]>([]);
  const [standaloneCategories, setStandaloneCategories] = React.useState<StoreCategory[]>([]);
  const [pageItems, setPageItems] = React.useState<PageItem[]>([]);
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

  // Collapsed sections in the layout
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  // ── Fetch ──────────────────────────────────────────────────
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [sectionsRes, categoriesRes, configRes] = await Promise.all([
        fetch("/api/store/sections"),
        fetch("/api/store/categories"),
        fetch("/api/store/homepage"),
      ]);

      const sectionsData = sectionsRes.ok ? await sectionsRes.json() : { sections: [] };
      const categoriesData = categoriesRes.ok ? await categoriesRes.json() : { categories: [] };
      const configData = configRes.ok ? await configRes.json() : {};

      const allCats: StoreCategory[] = categoriesData.categories || [];
      const rawSections: StoreSection[] = sectionsData.sections || [];

      const builtSections = rawSections.map((s) => ({
        ...s,
        categoryRows: allCats.filter((c) => (c as any).section_id === s.id),
      }));
      const standalone = allCats.filter((c) => !(c as any).section_id);

      const savedLayout: Array<{ type: string; id: string }> =
        configData?.config?.products_page_layout || [];

      setSections(builtSections);
      setStandaloneCategories(standalone);
      setPageItems(buildPageItems(savedLayout, builtSections, standalone));
    } catch (err) {
      console.error("Error fetching page layout data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchData(); }, [fetchData]);

  // ── Save layout ────────────────────────────────────────────
  const saveLayout = async (items: PageItem[]) => {
    const layout = items.map((item) => ({ type: item.type, id: item.id }));
    await fetch("/api/store/page-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout }),
    });
  };

  // ── Reorder ────────────────────────────────────────────────
  const handleReorder = async (newItems: PageItem[]) => {
    setPageItems(newItems);
    await saveLayout(newItems);
  };

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

  const handleCreateUberSection = async () => {
    setSaving(true);
    try {
      const sectionRes = await fetch("/api/store/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Uber Delivery",
          description: "Products available for fast local Uber delivery",
        }),
      });
      if (!sectionRes.ok) throw new Error("Failed to create Uber section");
      const { section } = await sectionRes.json();

      let uberCarousel = [...standaloneCategories, ...sections.flatMap((s) => s.categoryRows)]
        .find((category) => category.source === "uber");

      if (!uberCarousel) {
        const carouselRes = await fetch("/api/store/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Uber Delivery",
            source: "uber",
            product_ids: [],
          }),
        });
        if (!carouselRes.ok) throw new Error("Failed to create Uber carousel");
        const data = await carouselRes.json();
        uberCarousel = data.category;
      }

      if (uberCarousel?.id) {
        await fetch("/api/store/categories", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: uberCarousel.id, section_id: section.id }),
        });
      }

      await fetchData();
    } catch (err) {
      console.error("Error creating Uber section:", err);
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

  // ── Logo upload inside sections ────────────────────────────
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

  // ── Derived ────────────────────────────────────────────────
  const assignTargetSection = sections.find((s) => s.id === assignSectionId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const hasContent = sections.length > 0 || standaloneCategories.length > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <p className="text-sm text-muted-foreground">
            Drag to set the order sections and standalone carousels appear on your Products page.
            Group carousels into sections using the controls inside each section.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="flex-shrink-0">
          <Plus className="size-4" />
          New Section
        </Button>
        <Button onClick={handleCreateUberSection} variant="outline" size="sm" disabled={saving} className="flex-shrink-0">
          <Truck className="size-4" />
          Uber Section
        </Button>
      </div>

      {!hasContent ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 py-14 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Layers className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground">No layout yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
            Create a section to group carousels, or add carousels in the Carousels tab — they'll appear here to position.
          </p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">
            <Plus className="size-4" />
            Create first section
          </Button>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={pageItems}
          onReorder={handleReorder}
          className="space-y-2"
        >
          {pageItems.map((item) =>
            item.type === 'section' && item.section ? (
              <SectionPageItem
                key={item.id}
                item={item}
                section={item.section}
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                onEdit={openEdit}
                onDelete={(id) => setDeleteConfirmId(id)}
                onAssign={(secId) => setAssignSectionId(secId)}
                onRemoveCarousel={handleRemoveFromSection}
                onLogoUpload={handleLogoUpload}
                uploadingLogoId={uploadingLogoId}
                unassignedCount={standaloneCategories.length}
              />
            ) : item.category ? (
              <StandaloneCarouselPageItem
                key={item.id}
                item={item}
                category={item.category}
              />
            ) : null
          )}
        </Reorder.Group>
      )}

      {/* Create / Edit Section Dialog */}
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
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveSection(); }}
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
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveSection} disabled={!formName.trim() || saving}>
              {saving ? (
                <><Loader2 className="size-4 animate-spin" />Saving…</>
              ) : editingSection ? (
                <><Check className="size-4" />Save changes</>
              ) : (
                <><Plus className="size-4" />Create section</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign carousels to section dialog */}
      <Dialog open={assignSectionId !== null} onOpenChange={() => setAssignSectionId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add carousels to "{assignTargetSection?.name}"</DialogTitle>
            <DialogDescription>
              Select a standalone carousel to move into this section.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
            {standaloneCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                All carousels are already inside sections.
              </p>
            ) : (
              standaloneCategories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={async () => {
                    if (assignSectionId) await handleAssign(cat.id, assignSectionId);
                    setAssignSectionId(null);
                  }}
                  className="w-full flex items-center gap-3 rounded-md border border-border px-3 py-2.5 text-left hover:bg-accent transition-colors cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cat.source === "brand"
                        ? `Brand: ${cat.brand_name}`
                        : cat.source === "uber"
                          ? "Uber products"
                          : cat.source}
                      {" · "}
                      {cat.source === "uber"
                        ? `${cat.product_ids.length} Uber products`
                        : `${cat.product_ids.length} products`}
                    </p>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignSectionId(null)}>Done</Button>
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

// ── Section page item ──────────────────────────────────────
function SectionPageItem({
  item,
  section,
  collapsed,
  setCollapsed,
  onEdit,
  onDelete,
  onAssign,
  onRemoveCarousel,
  onLogoUpload,
  uploadingLogoId,
  unassignedCount,
}: {
  item: PageItem;
  section: SectionWithCategories;
  collapsed: Set<string>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>;
  onEdit: (section: SectionWithCategories) => void;
  onDelete: (id: string) => void;
  onAssign: (sectionId: string) => void;
  onRemoveCarousel: (categoryId: string) => void;
  onLogoUpload: (categoryId: string, file: File) => void;
  uploadingLogoId: string | null;
  unassignedCount: number;
}) {
  const isCollapsed = collapsed.has(section.id);
  const hasUberCarousel = section.categoryRows.some((cat) => cat.source === "uber");

  return (
    <Reorder.Item value={item} className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-3 py-3">
        <div className="cursor-grab text-muted-foreground/60 active:cursor-grabbing flex-shrink-0">
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Section indicator */}
        <div className="flex-shrink-0 h-5 w-1.5 rounded-full bg-foreground/20" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {hasUberCarousel && <UberCarouselLogo className="h-7 px-2.5 flex-shrink-0" />}
            <span className="text-sm font-semibold text-foreground truncate">{section.name}</span>
            <Badge variant="secondary" className="text-xs font-normal flex-shrink-0">
              Section · {section.categoryRows.length} carousel{section.categoryRows.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          {section.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{section.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon-sm" onClick={() => onEdit(section)} title="Edit section">
            <Edit2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(section.id)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Delete section"
          >
            <Trash2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed((prev) => {
              const next = new Set(prev);
              isCollapsed ? next.delete(section.id) : next.add(section.id);
              return next;
            })}
          >
            {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
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
                <p className="text-xs text-muted-foreground py-2 text-center">No carousels assigned yet</p>
              ) : (
                section.categoryRows.map((cat) => (
                  <div key={cat.id} className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent/50 group">
                    <div className="flex-shrink-0 h-8 w-8 rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center">
                      {cat.source !== "uber" && uploadingLogoId === cat.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : cat.source !== "uber" && (cat as any).logo_url ? (
                        <Image src={(cat as any).logo_url} alt="" width={32} height={32} className="h-full w-full object-contain" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-foreground truncate">{cat.name}</span>
                        <Badge variant="outline" className="text-[10px] font-normal py-0 flex-shrink-0">
                          {cat.source === "brand" ? "Brand" : cat.source === "lightspeed" ? "Lightspeed" : cat.source === "uber" ? "Uber" : "Custom"}
                        </Badge>
                      </div>
                      {cat.source === "uber" ? (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {cat.product_ids.length} Uber product{cat.product_ids.length !== 1 ? "s" : ""} added automatically
                        </p>
                      ) : (
                        <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors mt-0.5">
                          <ImagePlus className="h-3 w-3" />
                          {(cat as any).logo_url ? "Change logo" : "Add logo"}
                          <input
                            type="file" accept="image/*" className="sr-only"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) onLogoUpload(cat.id, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onRemoveCarousel(cat.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                      title="Remove from section"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}

              {unassignedCount > 0 && (
                <button
                  type="button"
                  onClick={() => onAssign(section.id)}
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
}

// ── Standalone carousel page item ─────────────────────────
function StandaloneCarouselPageItem({ item, category }: { item: PageItem; category: StoreCategory }) {
  return (
    <Reorder.Item value={item}>
      <div className="flex items-center gap-3 rounded-lg border border-border border-dashed bg-card/50 px-3 py-3 transition-colors hover:bg-accent/30">
        <div className="cursor-grab text-muted-foreground/60 active:cursor-grabbing flex-shrink-0">
          <GripVertical className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{category.name}</span>
          <Badge variant="outline" className="text-xs font-normal flex-shrink-0">
            {category.source === "brand"
              ? `Brand: ${category.brand_name}`
              : category.source === "lightspeed"
                ? "Lightspeed"
                : category.source === "uber"
                  ? "Uber"
                  : "Custom"}
          </Badge>
          <span className="text-xs text-muted-foreground flex-shrink-0">Standalone carousel</span>
        </div>
      </div>
    </Reorder.Item>
  );
}
