"use client";

import * as React from "react";
import Image from "next/image";
import { motion, Reorder } from "framer-motion";
import { Plus, Trash2, Edit2, GripVertical, Loader2, Upload, X, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import type { StoreBrand } from "@/lib/types/store";

interface BrandFormData {
  name: string;
  logoUrl: string;
}

export function StoreBrandsManager() {
  const [brands, setBrands] = React.useState<StoreBrand[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingBrand, setEditingBrand] = React.useState<StoreBrand | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<BrandFormData>({ name: '', logoUrl: '' });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchBrands = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/store/brands');
      if (response.ok) {
        const data = await response.json();
        setBrands(data.brands || []);
      }
    } catch (error) {
      console.error('Error fetching brands:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchBrands();
  }, [fetchBrands]);

  const handleAddNew = () => {
    setEditingBrand(null);
    setFormData({ name: '', logoUrl: '' });
    setSaveError(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (brand: StoreBrand) => {
    setEditingBrand(brand);
    setFormData({ name: brand.name, logoUrl: brand.logo_url || '' });
    setSaveError(null);
    setIsDialogOpen(true);
  };

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', file);

      const response = await fetch('/api/store/brands/upload-logo', {
        method: 'POST',
        body: fd,
      });

      if (response.ok) {
        const data = await response.json();
        setFormData(prev => ({ ...prev, logoUrl: data.url }));
      } else {
        const data = await response.json();
        console.error('Upload failed:', data.error);
      }
    } catch (error) {
      console.error('Error uploading logo:', error);
    } finally {
      setUploading(false);
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    try {
      setSaving(true);
      setSaveError(null);

      const response = await fetch('/api/store/brands', {
        method: editingBrand ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingBrand
            ? { id: editingBrand.id, name: formData.name, logo_url: formData.logoUrl || null }
            : { name: formData.name, logo_url: formData.logoUrl || null }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        setSaveError(data.error || 'Failed to save brand');
        return;
      }

      await fetchBrands();
      setIsDialogOpen(false);
    } catch (error) {
      console.error('Error saving brand:', error);
      setSaveError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (brandId: string) => {
    try {
      const response = await fetch(`/api/store/brands?id=${brandId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        await fetchBrands();
      }
    } catch (error) {
      console.error('Error deleting brand:', error);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleReorder = async (newOrder: StoreBrand[]) => {
    setBrands(newOrder);
    try {
      await Promise.all(
        newOrder.map((brand, index) =>
          fetch('/api/store/brands', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: brand.id, display_order: index }),
          })
        )
      );
    } catch (error) {
      console.error('Error updating order:', error);
      fetchBrands();
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
      <div className="flex justify-end">
        <Button onClick={handleAddNew} className="rounded-md">
          <Plus className="h-4 w-4 mr-2" />
          Add Brand
        </Button>
      </div>

      {brands.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Tag className="h-8 w-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-600">No brands added yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Add the brands you stock to showcase them on your store page
            </p>
          </CardContent>
        </Card>
      ) : (
        <Reorder.Group
          axis="y"
          values={brands}
          onReorder={handleReorder}
          className="space-y-2"
        >
          {brands.map((brand) => (
            <Reorder.Item key={brand.id} value={brand}>
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-md hover:shadow-sm transition-shadow cursor-move bg-white">
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>

                {/* Logo preview */}
                <div className="flex-shrink-0 h-10 w-10 rounded-md bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center">
                  {brand.logo_url ? (
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      width={40}
                      height={40}
                      className="object-contain w-full h-full p-0.5"
                    />
                  ) : (
                    <Tag className="h-4 w-4 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 truncate">{brand.name}</h4>
                  {!brand.logo_url && (
                    <p className="text-xs text-gray-400 mt-0.5">No logo uploaded</p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(brand)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(brand.id)}
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
            <DialogTitle>{editingBrand ? 'Edit Brand' : 'Add Brand'}</DialogTitle>
            <DialogDescription>
              {editingBrand ? 'Update the brand details below' : 'Add a brand that you stock in your store'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-4">
            {/* Logo Upload */}
            <div className="space-y-2">
              <Label>Brand Logo</Label>
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div className="h-20 w-20 flex-shrink-0 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center relative">
                  {formData.logoUrl ? (
                    <>
                      <Image
                        src={formData.logoUrl}
                        alt="Brand logo preview"
                        fill
                        className="object-contain p-1"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, logoUrl: '' }))}
                        className="absolute top-0.5 right-0.5 rounded-full bg-white border border-gray-200 p-0.5 hover:bg-gray-50"
                      >
                        <X className="h-3 w-3 text-gray-500" />
                      </button>
                    </>
                  ) : uploading ? (
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                  ) : (
                    <Tag className="h-6 w-6 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="rounded-md w-full"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Logo
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-gray-400">
                    JPEG, PNG, WebP, or SVG — max 5MB
                  </p>
                </div>
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="brandName">Brand Name *</Label>
              <Input
                id="brandName"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Trek, Shimano, Specialized"
              />
            </div>
          </div>

          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {saveError}
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formData.name.trim() || saving || uploading}
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
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this brand from your store? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
