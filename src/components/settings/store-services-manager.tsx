"use client";

import * as React from "react";
import { motion, Reorder } from "framer-motion";
import { Plus, Trash2, Edit2, GripVertical, Loader2, Star, Clock, DollarSign } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StoreService } from "@/lib/types/store";

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
}

const BLANK_FORM: ServiceFormData = {
  name: "",
  description: "",
  price: "",
  price_from: false,
  duration_minutes: "",
  highlight: false,
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

function formatDuration(minutes: number): string {
  if (minutes < 60) return `~${minutes} min`;
  const hrs = minutes / 60;
  const rounded = Math.round(hrs * 2) / 2;
  return `~${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} hr${rounded >= 2 ? "s" : ""}`;
}

export function StoreServicesManager() {
  const [services, setServices] = React.useState<StoreService[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingService, setEditingService] = React.useState<StoreService | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<ServiceFormData>(BLANK_FORM);

  // ── Data fetching ──────────────────────────────────────────
  const fetchServices = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/store/services");
      if (res.ok) {
        const data = await res.json();
        setServices(data.services || []);
      }
    } catch (err) {
      console.error("Error fetching services:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchServices(); }, [fetchServices]);

  // ── Dialog helpers ─────────────────────────────────────────
  const openAdd = () => {
    setEditingService(null);
    setFormData(BLANK_FORM);
    setIsDialogOpen(true);
  };

  const openEdit = (svc: StoreService) => {
    setEditingService(svc);
    setFormData({
      name: svc.name,
      description: svc.description || "",
      price: svc.price != null ? String(svc.price) : "",
      price_from: svc.price_from ?? false,
      duration_minutes: svc.duration_minutes != null ? String(svc.duration_minutes) : "",
      highlight: svc.highlight ?? false,
    });
    setIsDialogOpen(true);
  };

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

  // ── Toggle highlight inline ────────────────────────────────
  const toggleHighlight = async (svc: StoreService) => {
    const next = !svc.highlight;
    setServices((prev) => prev.map((s) => s.id === svc.id ? { ...s, highlight: next } : s));
    await fetch("/api/store/services", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: svc.id, highlight: next }),
    }).catch(console.error);
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Drag to reorder · ★ to feature on the services tab
        </p>
        <Button onClick={openAdd} size="sm" className="rounded-md">
          <Plus className="h-4 w-4 mr-2" />
          Add Service
        </Button>
      </div>

      {/* List */}
      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No services added yet</p>
          </CardContent>
        </Card>
      ) : (
        <Reorder.Group
          axis="y"
          values={services}
          onReorder={handleReorder}
          className="space-y-2"
        >
          {services.map((svc) => (
            <Reorder.Item key={svc.id} value={svc}>
              <div className={cn(
                "flex items-center gap-3 p-3 border rounded-md transition-colors cursor-move bg-card",
                svc.highlight
                  ? "border-yellow-200 bg-yellow-50/60 hover:bg-yellow-50"
                  : "border-border hover:bg-accent/40"
              )}>
                {/* Drag handle */}
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {svc.highlight && (
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 flex-shrink-0" />
                    )}
                    <h4 className="text-sm font-medium text-foreground truncate">{svc.name}</h4>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {svc.price != null && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground font-medium">
                        <DollarSign className="h-3 w-3" />
                        {svc.price_from ? "From " : ""}
                        {svc.price % 1 === 0 ? svc.price.toFixed(0) : svc.price.toFixed(2)}
                      </span>
                    )}
                    {svc.duration_minutes != null && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDuration(svc.duration_minutes)}
                      </span>
                    )}
                    {svc.description && (
                      <span className="text-xs text-muted-foreground line-clamp-1 truncate max-w-[180px]">
                        {svc.description}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Feature toggle */}
                  <button
                    type="button"
                    title={svc.highlight ? "Remove feature" : "Feature this service"}
                    onClick={() => toggleHighlight(svc)}
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded-md transition-colors cursor-pointer",
                      svc.highlight
                        ? "text-yellow-500 hover:text-yellow-600 hover:bg-yellow-100"
                        : "text-muted-foreground/40 hover:text-yellow-400 hover:bg-yellow-50"
                    )}
                  >
                    <Star className={cn("h-3.5 w-3.5", svc.highlight && "fill-current")} />
                  </button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEdit(svc)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(svc.id)}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {/* ── Add / Edit dialog ─────────────────────────────── */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>
              {editingService
                ? "Update the details for this service."
                : "Add a new service you offer at the store."}
            </DialogDescription>
          </DialogHeader>

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
              <Label htmlFor="svc-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="svc-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this service include?"
                rows={2}
              />
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
            <div className="rounded-lg border border-yellow-200 bg-yellow-50/60 p-3">
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!formData.name.trim() || saving}>
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
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
    </div>
  );
}
