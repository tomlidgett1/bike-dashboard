"use client";

import * as React from "react";
import Image from "next/image";
import { Reorder } from "framer-motion";
import { Trash2, Edit2, GripVertical, Loader2, Upload, X, Tag, Search } from "@/components/layout/app-sidebar/dashboard-icons";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LightspeedManufacturerOption, StoreBrand } from "@/lib/types/store";
import type { BrandLogoSearchResult } from "@/lib/store/brand-logo-serper";
import { cn } from "@/lib/utils";

interface BrandFormData {
  name: string;
  logoUrl: string;
  lightspeedManufacturerId: string;
  lightspeedManufacturerName: string;
}

export function StoreBrandsManager({ addRequest = 0 }: { addRequest?: number }) {
  const [brands, setBrands] = React.useState<StoreBrand[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [editingBrand, setEditingBrand] = React.useState<StoreBrand | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<BrandFormData>({
    name: '',
    logoUrl: '',
    lightspeedManufacturerId: '',
    lightspeedManufacturerName: '',
  });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [logoSearchQuery, setLogoSearchQuery] = React.useState('');
  const [logoSearchResults, setLogoSearchResults] = React.useState<BrandLogoSearchResult[]>([]);
  const [logoSearching, setLogoSearching] = React.useState(false);
  const [logoSearchError, setLogoSearchError] = React.useState<string | null>(null);
  const [logoImportingUrl, setLogoImportingUrl] = React.useState<string | null>(null);
  const [lightspeedBrands, setLightspeedBrands] = React.useState<LightspeedManufacturerOption[]>([]);
  const [lightspeedBrandsLoading, setLightspeedBrandsLoading] = React.useState(false);
  const [lightspeedBrandsError, setLightspeedBrandsError] = React.useState<string | null>(null);

  const resetLogoSearch = React.useCallback(() => {
    setLogoSearchQuery('');
    setLogoSearchResults([]);
    setLogoSearchError(null);
    setLogoSearching(false);
    setLogoImportingUrl(null);
  }, []);

  const openBrandDialog = React.useCallback((brand: StoreBrand | null) => {
    setEditingBrand(brand);
    setFormData({
      name: brand?.name ?? '',
      logoUrl: brand?.logo_url ?? '',
      lightspeedManufacturerId: brand?.lightspeed_manufacturer_id ?? '',
      lightspeedManufacturerName: brand?.lightspeed_manufacturer_name ?? '',
    });
    setSaveError(null);
    resetLogoSearch();
    setLogoSearchQuery(brand?.name ? `${brand.name} logo` : '');
    setIsDialogOpen(true);
  }, [resetLogoSearch]);

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

  const fetchLightspeedBrands = React.useCallback(async () => {
    try {
      setLightspeedBrandsLoading(true);
      setLightspeedBrandsError(null);
      const response = await fetch('/api/lightspeed/manufacturers');
      const data = await response.json();
      if (!response.ok) {
        setLightspeedBrandsError(data.error || 'Could not load Lightspeed brands');
        setLightspeedBrands([]);
        return;
      }
      setLightspeedBrands(Array.isArray(data.manufacturers) ? data.manufacturers : []);
    } catch (error) {
      console.error('Error fetching Lightspeed brands:', error);
      setLightspeedBrandsError('Could not load Lightspeed brands');
      setLightspeedBrands([]);
    } finally {
      setLightspeedBrandsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isDialogOpen) {
      void fetchLightspeedBrands();
    }
  }, [isDialogOpen, fetchLightspeedBrands]);

  const handleLightspeedBrandChange = (manufacturerId: string) => {
    if (manufacturerId === 'none') {
      setFormData((prev) => ({
        ...prev,
        lightspeedManufacturerId: '',
        lightspeedManufacturerName: '',
      }));
      return;
    }

    const selected = lightspeedBrands.find((brand) => brand.id === manufacturerId);
    setFormData((prev) => ({
      ...prev,
      lightspeedManufacturerId: manufacturerId,
      lightspeedManufacturerName: selected?.name ?? '',
      name: prev.name.trim() || selected?.name || prev.name,
    }));
  };

  const handleAddNew = React.useCallback(() => {
    openBrandDialog(null);
  }, [openBrandDialog]);

  React.useEffect(() => {
    if (addRequest > 0) handleAddNew();
  }, [addRequest, handleAddNew]);

  const handleEdit = (brand: StoreBrand) => {
    openBrandDialog(brand);
  };

  const handleLogoSearch = async () => {
    const query = logoSearchQuery.trim() || (formData.name.trim() ? `${formData.name.trim()} logo` : '');
    if (!query) {
      setLogoSearchError('Enter a brand name or search query first');
      return;
    }

    try {
      setLogoSearching(true);
      setLogoSearchError(null);
      setLogoSearchResults([]);

      const response = await fetch('/api/store/brands/search-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: logoSearchQuery.trim() || undefined,
          brandName: formData.name.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setLogoSearchError(data.error || 'Logo search failed');
        return;
      }

      setLogoSearchResults(Array.isArray(data.results) ? data.results : []);
      if (!data.results?.length) {
        setLogoSearchError('No logo images found — try a different search');
      }
    } catch (error) {
      console.error('Error searching logos:', error);
      setLogoSearchError('Logo search failed');
    } finally {
      setLogoSearching(false);
    }
  };

  const handleSelectSerperLogo = async (result: BrandLogoSearchResult) => {
    try {
      setLogoImportingUrl(result.url);
      setLogoSearchError(null);

      const response = await fetch('/api/store/brands/import-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: result.url }),
      });

      const data = await response.json();
      if (!response.ok) {
        setLogoSearchError(data.error || 'Could not import logo');
        return;
      }

      setFormData((prev) => ({ ...prev, logoUrl: data.url }));
    } catch (error) {
      console.error('Error importing logo:', error);
      setLogoSearchError('Could not import logo');
    } finally {
      setLogoImportingUrl(null);
    }
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
            ? {
                id: editingBrand.id,
                name: formData.name,
                logo_url: formData.logoUrl || null,
                lightspeed_manufacturer_id: formData.lightspeedManufacturerId || null,
                lightspeed_manufacturer_name: formData.lightspeedManufacturerName || null,
              }
            : {
                name: formData.name,
                logo_url: formData.logoUrl || null,
                lightspeed_manufacturer_id: formData.lightspeedManufacturerId || null,
                lightspeed_manufacturer_name: formData.lightspeedManufacturerName || null,
              }
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
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <>
      {brands.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-white py-12 text-center">
          <Tag className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-600">No brands added yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Add the brands you stock to showcase them on your store page
          </p>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={brands}
          onReorder={handleReorder}
          className="divide-y divide-gray-100 rounded-md border border-gray-200 bg-white"
        >
          {brands.map((brand) => (
            <Reorder.Item key={brand.id} value={brand}>
              <div className="flex cursor-move items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50">
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>

                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50">
                  {brand.logo_url ? (
                    <Image
                      src={brand.logo_url}
                      alt={brand.name}
                      width={36}
                      height={36}
                      className="h-full w-full object-contain p-0.5"
                    />
                  ) : (
                    <Tag className="h-4 w-4 text-gray-300" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-medium text-gray-900">{brand.name}</h4>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {brand.lightspeed_manufacturer_name
                      ? `Lightspeed: ${brand.lightspeed_manufacturer_name}`
                      : !brand.logo_url
                        ? 'No logo uploaded'
                        : 'No Lightspeed brand linked'}
                  </p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(brand)}>
                    <Edit2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteConfirmId(brand.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="flex max-h-[min(40rem,90vh)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
          <DialogHeader className="shrink-0 px-6 pt-6">
            <DialogTitle>{editingBrand ? 'Edit Brand' : 'Add Brand'}</DialogTitle>
            <DialogDescription>
              {editingBrand ? 'Update the brand details below' : 'Add a brand that you stock in your store'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-4">
            {/* Logo Upload */}
            <div className="space-y-2">
              <Label>Brand Logo</Label>
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div className="h-20 w-20 flex-shrink-0 rounded-md border-2 border-dashed border-border bg-muted overflow-hidden flex items-center justify-center relative">
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
                        className="absolute top-0.5 right-0.5 rounded-full bg-background border border-border p-0.5 hover:bg-accent"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </>
                  ) : uploading ? (
                    <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                  ) : (
                    <Tag className="h-6 w-6 text-muted-foreground/40" />
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
                    className="w-full"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="size-4" />
                        Upload Logo
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    JPEG, PNG, WebP, or SVG — max 5MB
                  </p>
                </div>
              </div>

              <div className="rounded-md border border-gray-200 bg-white p-3">
                <p className="text-xs font-medium text-gray-700">Search for a logo</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Find brand logos via Serper, then click one to add it
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={logoSearchQuery}
                    onChange={(e) => setLogoSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleLogoSearch();
                      }
                    }}
                    placeholder={formData.name.trim() ? `${formData.name.trim()} logo` : 'e.g. Shimano logo'}
                    className="h-9 flex-1 rounded-md bg-white text-sm"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void handleLogoSearch()}
                    disabled={logoSearching || logoImportingUrl !== null}
                    className="h-9 shrink-0 rounded-md"
                  >
                    {logoSearching ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Searching…
                      </>
                    ) : (
                      <>
                        <Search className="size-4" />
                        Search
                      </>
                    )}
                  </Button>
                </div>

                {logoSearchError ? (
                  <p className="mt-2 text-xs text-destructive">{logoSearchError}</p>
                ) : null}

                {logoSearchResults.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {logoSearchResults.map((result) => {
                      const isImporting = logoImportingUrl === result.url;
                      return (
                        <button
                          key={result.url}
                          type="button"
                          disabled={Boolean(logoImportingUrl)}
                          onClick={() => void handleSelectSerperLogo(result)}
                          className={cn(
                            'overflow-hidden rounded-md border bg-white text-left transition-colors',
                            isImporting ? 'border-gray-900 ring-1 ring-gray-900' : 'border-gray-200 hover:border-gray-400',
                            logoImportingUrl && !isImporting && 'opacity-50',
                          )}
                        >
                          <div className="relative flex aspect-square items-center justify-center bg-gray-50 p-2">
                            <Image
                              src={result.thumbnailUrl || result.url}
                              alt={result.title || 'Logo result'}
                              width={80}
                              height={80}
                              unoptimized
                              className="max-h-full max-w-full object-contain"
                            />
                            {isImporting ? (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                                <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
                              </div>
                            ) : null}
                          </div>
                          {(result.domain || result.title) && (
                            <p className="line-clamp-1 px-1.5 py-1 text-[10px] text-gray-500">
                              {result.domain || result.title}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Lightspeed brand link */}
            <div className="space-y-2">
              <Label>Lightspeed brand</Label>
              <Select
                value={formData.lightspeedManufacturerId || 'none'}
                onValueChange={handleLightspeedBrandChange}
                disabled={lightspeedBrandsLoading}
              >
                <SelectTrigger className="h-9 w-full rounded-md bg-white">
                  <SelectValue placeholder="Select a Lightspeed brand" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none">No Lightspeed brand linked</SelectItem>
                  {lightspeedBrands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {lightspeedBrandsLoading ? (
                <p className="text-xs text-gray-500">Loading Lightspeed brands…</p>
              ) : lightspeedBrandsError ? (
                <p className="text-xs text-destructive">{lightspeedBrandsError}</p>
              ) : (
                <p className="text-xs text-gray-500">
                  Link this logo to a Lightspeed brand so it appears on matching product pages.
                </p>
              )}
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="brandName">Display name *</Label>
              <Input
                id="brandName"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Trek, Shimano, Specialized"
              />
            </div>
          </div>

          {saveError && (
            <p className="mx-6 mb-2 shrink-0 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {saveError}
            </p>
          )}

          <DialogFooter className="shrink-0 border-t border-gray-100 px-6 py-4">
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!formData.name.trim() || saving || uploading || logoImportingUrl !== null}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
