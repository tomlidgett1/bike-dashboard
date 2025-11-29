"use client";

import * as React from "react";
import { motion, Reorder } from "framer-motion";
import { Plus, Trash2, Edit2, GripVertical, Loader2 } from "lucide-react";
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
import type { StoreService } from "@/lib/types/store";

// ============================================================
// Store Services Manager
// Manage services with add/edit/delete and drag-to-reorder
// ============================================================

interface ServiceFormData {
  name: string;
  description: string;
}

export function StoreServicesManager() {
  const [services, setServices] = React.useState<StoreService[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingService, setEditingService] = React.useState<StoreService | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<ServiceFormData>({
    name: '',
    description: '',
  });

  // Fetch services
  const fetchServices = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/store/services');
      if (response.ok) {
        const data = await response.json();
        setServices(data.services || []);
      }
    } catch (error) {
      console.error('Error fetching services:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Open dialog for new service
  const handleAddNew = () => {
    setEditingService(null);
    setFormData({ name: '', description: '' });
    setIsDialogOpen(true);
  };

  // Open dialog for editing
  const handleEdit = (service: StoreService) => {
    setEditingService(service);
    setFormData({
      name: service.name,
      description: service.description || '',
    });
    setIsDialogOpen(true);
  };

  // Save service (create or update)
  const handleSave = async () => {
    if (!formData.name.trim()) return;

    try {
      setSaving(true);

      if (editingService) {
        // Update existing
        const response = await fetch('/api/store/services', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingService.id,
            name: formData.name,
            description: formData.description || null,
          }),
        });

        if (response.ok) {
          await fetchServices();
          setIsDialogOpen(false);
        }
      } else {
        // Create new
        const response = await fetch('/api/store/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            description: formData.description || null,
          }),
        });

        if (response.ok) {
          await fetchServices();
          setIsDialogOpen(false);
        }
      }
    } catch (error) {
      console.error('Error saving service:', error);
    } finally {
      setSaving(false);
    }
  };

  // Delete service
  const handleDelete = async (serviceId: string) => {
    try {
      const response = await fetch(`/api/store/services?id=${serviceId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchServices();
      }
    } catch (error) {
      console.error('Error deleting service:', error);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Handle reorder
  const handleReorder = async (newOrder: StoreService[]) => {
    setServices(newOrder);

    // Update display_order for all services
    try {
      await Promise.all(
        newOrder.map((service, index) =>
          fetch('/api/store/services', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: service.id,
              display_order: index,
            }),
          })
        )
      );
    } catch (error) {
      console.error('Error updating order:', error);
      // Revert on error
      fetchServices();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Button */}
      <div className="flex justify-end">
        <Button onClick={handleAddNew} className="rounded-md">
          <Plus className="h-4 w-4 mr-2" />
          Add Service
        </Button>
      </div>

      {/* Services List */}
      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-gray-600">No services added yet</p>
          </CardContent>
        </Card>
      ) : (
        <Reorder.Group
          axis="y"
          values={services}
          onReorder={handleReorder}
          className="space-y-2"
        >
          {services.map((service) => (
            <Reorder.Item key={service.id} value={service}>
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-md hover:shadow-sm transition-shadow cursor-move bg-white">
                {/* Drag Handle */}
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 truncate">
                    {service.name}
                  </h4>
                  {service.description && (
                    <p className="text-xs text-gray-600 line-clamp-1 mt-0.5">
                      {service.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(service)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(service.id)}
                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingService ? 'Edit Service' : 'Add Service'}
            </DialogTitle>
            <DialogDescription>
              {editingService
                ? 'Update the service details below'
                : 'Add a new service that you offer'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Service Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Full Bicycle Service"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Describe what this service includes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name.trim() || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={() => setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this service? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

