"use client";

import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Trash2, Edit2, GripVertical, Loader2, Star, Clock, X, Check, ListChecks, Wrench } from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import type { StoreService } from "@/lib/types/store";
import { ServiceCard } from "@/components/marketplace/store-profile/service-card";
import { BRAND_YELLOW } from "@/lib/marketplace/homepage-config";

// ============================================================
// Store Services Manager
// Manage services with add/edit/delete and drag-to-reorder.
// Supports price, duration, and featured highlight flag.
// ============================================================

interface ServiceFormData {
  name: string;
  description: string;
  price: string;          // kept as string to allow empty
  price_from: boolean;
  duration_minutes: string;
  highlight: boolean;
  includes: string[];     // dot-points of what the service covers
}

const BLANK_FORM: ServiceFormData = {
  name: "",
  description: "",
  price: "",
  price_from: false,
  duration_minutes: "",
  highlight: false,
  includes: [""],
};

// Common duration options (minutes)
const DURATION_PRESETS = [
  { label: "15 min",  value: "15" },
  { label: "30 min",  value: "30" },
  { label: "45 min",  value: "45" },
  { label: "1 hr",    value: "60" },
  { label: "1.5 hrs", value: "90" },
  { label: "2 hrs",   value: "120" },
  { label: "3 hrs",   value: "180" },
  { label: "Half day",value: "240" },
  { label: "Full day",value: "480" },
];

/** Fixed-height service form — body scrolls, header/footer stay put. */
const SERVICE_DIALOG_CLASS =
  "flex !flex-col h-[min(85vh,40rem)] max-h-[85vh] w-full max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-md";

// Placeholder examples for the "what's included" bullets
const INCLUDE_EXAMPLES = [
  "Full drivetrain clean & degrease",
  "Gears indexed & brakes adjusted",
  "Wheels trued & tyres inflated",
  "All bolts torqued to spec",
  "Frame wipe-down & safety check",
];

const STORE_ACCENT_TEXT = "#0a0a0a";

function SortableServiceCard({
  service,
  accent,
  onEdit,
  onDelete,
}: {
  service: StoreService;
  accent: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: service.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("h-full", isDragging && "opacity-60")}
    >
      <div className="group relative h-full">
        <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-md border border-gray-200 bg-white p-0.5 shadow-sm">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-8 w-8 cursor-grab items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
            aria-label={`Reorder ${service.name}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <Button variant="ghost" size="icon-sm" onClick={onEdit}>
            <Edit2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        <ServiceCard
          service={service}
          accent={accent}
          accentText={STORE_ACCENT_TEXT}
          className="h-full"
        />
      </div>
    </div>
  );
}

export function StoreServicesManager({ addRequest = 0 }: { addRequest?: number }) {
  const [services, setServices] = React.useState<StoreService[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingService, setEditingService] = React.useState<StoreService | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<ServiceFormData>(BLANK_FORM);
  const [accent, setAccent] = React.useState(BRAND_YELLOW);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // ── Data fetching ──────────────────────────────────────────
  const fetchServices = React.useCallback(async () => {
    try {
      setLoading(true);
      const [servicesRes, homepageRes] = await Promise.all([
        fetch("/api/store/services"),
        fetch("/api/store/homepage"),
      ]);
      if (servicesRes.ok) {
        const data = await servicesRes.json();
        setServices(data.services || []);
      }
      if (homepageRes.ok) {
        const homepage = await homepageRes.json();
        const nextAccent = homepage?.config?.theme?.accent;
        if (typeof nextAccent === "string" && nextAccent.trim()) {
          setAccent(nextAccent);
        }
      }
    } catch (err) {
      console.error("Error fetching services:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchServices(); }, [fetchServices]);

  // ── Dialog helpers ─────────────────────────────────────────
  const openAdd = React.useCallback(() => {
    setEditingService(null);
    setFormData(BLANK_FORM);
    setIsDialogOpen(true);
  }, []);

  React.useEffect(() => {
    if (addRequest > 0) openAdd();
  }, [addRequest, openAdd]);

  const openEdit = (svc: StoreService) => {
    setEditingService(svc);
    setFormData({
      name: svc.name,
      description: svc.description || "",
      price: svc.price != null ? String(svc.price) : "",
      price_from: svc.price_from ?? false,
      duration_minutes: svc.duration_minutes != null ? String(svc.duration_minutes) : "",
      highlight: svc.highlight ?? false,
      includes: svc.includes && svc.includes.length > 0 ? [...svc.includes] : [""],
    });
    setIsDialogOpen(true);
  };

  // ── "What's included" bullet editors ───────────────────────
  const updateInclude = (i: number, val: string) =>
    setFormData((f) => ({ ...f, includes: f.includes.map((x, idx) => (idx === i ? val : x)) }));
  const addInclude = () =>
    setFormData((f) => ({ ...f, includes: [...f.includes, ""] }));
  const addIncludeAfter = (i: number) =>
    setFormData((f) => {
      const next = [...f.includes];
      next.splice(i + 1, 0, "");
      return { ...f, includes: next };
    });
  const removeInclude = (i: number) =>
    setFormData((f) => {
      const next = f.includes.filter((_, idx) => idx !== i);
      return { ...f, includes: next.length ? next : [""] };
    });

  // ── Save ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const price = formData.price.trim() ? parseFloat(formData.price) : null;
      const duration = formData.duration_minutes.trim()
        ? parseInt(formData.duration_minutes, 10)
        : null;

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price,
        price_from: price != null ? formData.price_from : false,
        duration_minutes: duration,
        highlight: formData.highlight,
        includes: formData.includes.map((i) => i.trim()).filter(Boolean),
      };

      if (editingService) {
        const res = await fetch("/api/store/services", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingService.id, ...payload }),
        });
        if (res.ok) { await fetchServices(); setIsDialogOpen(false); }
      } else {
        const res = await fetch("/api/store/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) { await fetchServices(); setIsDialogOpen(false); }
      }
    } catch (err) {
      console.error("Error saving service:", err);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/store/services?id=${id}`, { method: "DELETE" });
      if (res.ok) await fetchServices();
    } catch (err) {
      console.error("Error deleting service:", err);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // ── Reorder ────────────────────────────────────────────────
  const handleReorder = async (newOrder: StoreService[]) => {
    setServices(newOrder);
    try {
      await Promise.all(
        newOrder.map((svc, index) =>
          fetch("/api/store/services", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: svc.id, display_order: index }),
          })
        )
      );
    } catch (err) {
      console.error("Error updating order:", err);
      fetchServices();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = services.findIndex((svc) => svc.id === active.id);
    const newIndex = services.findIndex((svc) => svc.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    handleReorder(arrayMove(services, oldIndex, newIndex));
  };

  // ── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <>
      {services.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-white py-12 text-center">
          <Wrench className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-600">No services added yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Add the services you offer, like repairs, fittings, or tune-ups
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-gray-500">
            Drag cards to reorder in any direction. Featured services show the Popular ribbon on your storefront.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={services.map((svc) => svc.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {services.map((svc) => (
                  <SortableServiceCard
                    key={svc.id}
                    service={svc}
                    accent={accent}
                    onEdit={() => openEdit(svc)}
                    onDelete={() => setDeleteConfirmId(svc.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {/* ── Add / Edit dialog ─────────────────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className={SERVICE_DIALOG_CLASS}>
          <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-2">
            <DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>
              {editingService
                ? "Update the details for this service."
                : "Add a new service you offer at the store."}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
            <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="svc-name">Service name *</Label>
              <Input
                id="svc-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Full Bicycle Service"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="svc-desc">Short summary <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="svc-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="One line shown under the title, e.g. “Everything your bike needs to ride like new.”"
                rows={2}
              />
            </div>

            {/* What's included — dot points */}
            <div className="space-y-2">
              <div>
                <Label className="flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                  What&apos;s included
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Add a bullet for each thing this service covers — shown as a checklist on your storefront card.
                </p>
              </div>

              <div className="space-y-2">
                {formData.includes.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-900">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                    <Input
                      value={item}
                      onChange={(e) => updateInclude(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addIncludeAfter(i);
                        }
                      }}
                      placeholder={INCLUDE_EXAMPLES[i % INCLUDE_EXAMPLES.length]}
                      className="h-9"
                    />
                    <button
                      type="button"
                      onClick={() => removeInclude(i)}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground/50"
                      aria-label="Remove item"
                      disabled={formData.includes.length === 1 && !item.trim()}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addInclude}
              >
                <Plus className="size-4" />
                Add item
              </Button>
            </div>

            {/* Price row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="svc-price">Price <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    id="svc-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0.00"
                    className="pl-6"
                  />
                </div>
              </div>

              {/* Duration */}
              <div className="space-y-1.5">
                <Label htmlFor="svc-duration">Duration <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <div className="relative">
                  <select
                    id="svc-duration"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 appearance-none pr-8 cursor-pointer"
                  >
                    <option value="">Select…</option>
                    {DURATION_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <Clock className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Price from toggle — only relevant if price is set */}
            {formData.price.trim() !== "" && (
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <div
                  role="checkbox"
                  aria-checked={formData.price_from}
                  tabIndex={0}
                  onClick={() => setFormData({ ...formData, price_from: !formData.price_from })}
                  onKeyDown={(e) => e.key === " " && setFormData({ ...formData, price_from: !formData.price_from })}
                  className={cn(
                    "w-9 h-5 rounded-full transition-colors flex-shrink-0 relative cursor-pointer",
                    formData.price_from ? "bg-gray-900" : "bg-gray-200"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    formData.price_from ? "translate-x-4" : "translate-x-0.5"
                  )} />
                </div>
                <span className="text-sm text-foreground">
                  Show as "From $…" <span className="text-muted-foreground">(price starts at)</span>
                </span>
              </label>
            )}

            {/* Highlight toggle */}
            <div className="rounded-md border border-gray-200 bg-white p-3">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <div
                  role="checkbox"
                  aria-checked={formData.highlight}
                  tabIndex={0}
                  onClick={() => setFormData({ ...formData, highlight: !formData.highlight })}
                  onKeyDown={(e) => e.key === " " && setFormData({ ...formData, highlight: !formData.highlight })}
                  className={cn(
                    "mt-0.5 w-9 h-5 rounded-full transition-colors flex-shrink-0 relative cursor-pointer",
                    formData.highlight ? "bg-yellow-400" : "bg-gray-200"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    formData.highlight ? "translate-x-4" : "translate-x-0.5"
                  )} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    Feature this service
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Shown in a larger highlighted card at the top of the services section.
                  </p>
                </div>
              </label>
            </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!formData.name.trim() || saving}>
              {saving ? (
                <><Loader2 className="size-4 animate-spin" />Saving…</>
              ) : (
                "Save service"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the service from your profile. This action cannot be undone.
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
    </>
  );
}
