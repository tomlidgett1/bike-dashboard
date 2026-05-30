"use client";

import * as React from "react";
import { Reorder } from "framer-motion";
import {
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  Loader2,
  Scan,
  Check,
  Package,
  RotateCcw,
  Tag,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Badge } from "@/components/ui/badge";
import type { StoreCategory, LightspeedCategoryOption, CarouselSize } from "@/lib/types/store";

interface BrandOption {
  name: string;
  product_count: number;
}

// ============================================================
// Store Categories Manager
// Manage categories with Lightspeed scan and custom creation
// ============================================================

interface CategoryFormData {
  name: string;
  productIds: string[];
}

export function StoreCategoriesManager() {
  const [categories, setCategories] = React.useState<StoreCategory[]>([]);
  const [products, setProducts] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [scanning, setScanning] = React.useState(false);
  const [lightspeedCategories, setLightspeedCategories] = React.useState<
    LightspeedCategoryOption[]
  >([]);
  const [selectedLightspeedCategories, setSelectedLightspeedCategories] = React.useState<
    Set<string>
  >(new Set());
  const [isScanDialogOpen, setIsScanDialogOpen] = React.useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = React.useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = React.useState(false);
  const [addingMultiple, setAddingMultiple] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<StoreCategory | null>(
    null
  );
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);
  const [formData, setFormData] = React.useState<CategoryFormData>({
    name: '',
    productIds: [],
  });

  // Brand carousel state
  const [isBrandDialogOpen, setIsBrandDialogOpen] = React.useState(false);
  const [brandOptions, setBrandOptions] = React.useState<BrandOption[]>([]);
  const [brandScanning, setBrandScanning] = React.useState(false);
  const [selectedBrand, setSelectedBrand] = React.useState<string>('');
  const [brandDisplayName, setBrandDisplayName] = React.useState<string>('');
  const [brandListExpanded, setBrandListExpanded] = React.useState(false);

  // Fetch categories and auto-generated category names
  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);

      const [categoriesRes, productsRes, categoryNamesRes] = await Promise.all([
        fetch('/api/store/categories'),
        fetch('/api/products?pageSize=1000&status=active&stock=in-stock'),
        fetch('/api/store/category-names'), // Get auto-generated category names
      ]);

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }

      if (productsRes.ok) {
        const data = await productsRes.json();
        setProducts(data.products || []);
      }

      if (categoryNamesRes.ok) {
        const data = await categoryNamesRes.json();
        // Merge with existing categories to show auto-generated ones
        const existingCategoryNames = new Set(categories.map(c => c.lightspeed_category_id || c.name));
        const autoCategories = (data.categories || [])
          .filter((cat: any) => !existingCategoryNames.has(cat.category_name))
          .map((cat: any, index: number) => ({
            id: `auto-${cat.category_name}`,
            name: cat.category_name,
            display_order: 1000 + index,
            source: 'auto' as const,
            lightspeed_category_id: cat.category_name,
            product_ids: [],
            is_active: true,
            product_count: cat.product_count,
          }));
        
        setCategories(prev => [...prev, ...autoCategories]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Scan Lightspeed categories
  const handleScanLightspeed = async () => {
    try {
      setScanning(true);
      const response = await fetch('/api/lightspeed/categories/scan');

      if (response.ok) {
        const data = await response.json();

        // Filter out categories already added to avoid duplicates
        const existingLightspeedIds = new Set(
          categories
            .filter((c) => c.source === 'lightspeed' && c.lightspeed_category_id)
            .map((c) => c.lightspeed_category_id!)
        );
        const newCategories = (data.categories || []).filter(
          (c: LightspeedCategoryOption) => !existingLightspeedIds.has(c.id)
        );

        setLightspeedCategories(newCategories);
        setSelectedLightspeedCategories(new Set());
        setIsScanDialogOpen(true);
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to scan categories');
      }
    } catch (error) {
      console.error('Error scanning categories:', error);
      alert('Failed to scan categories');
    } finally {
      setScanning(false);
    }
  };

  // Toggle category selection
  const toggleLightspeedCategory = (categoryId: string) => {
    setSelectedLightspeedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Select all categories
  const handleSelectAll = () => {
    if (selectedLightspeedCategories.size === lightspeedCategories.length) {
      setSelectedLightspeedCategories(new Set());
    } else {
      setSelectedLightspeedCategories(
        new Set(lightspeedCategories.map((c) => c.id))
      );
    }
  };

  // Add selected categories
  const handleAddSelectedCategories = async () => {
    if (selectedLightspeedCategories.size === 0) return;

    try {
      setAddingMultiple(true);

      // Fetch ALL products for accurate assignment (not limited by pageSize)
      const allProductsRes = await fetch('/api/products?pageSize=10000&status=active&stock=in-stock');
      const allProductsData = await allProductsRes.json();
      const allProducts = allProductsData.products || [];

      // Add each selected category
      const promises = Array.from(selectedLightspeedCategories).map(async (categoryId) => {
        const lsCategory = lightspeedCategories.find((c) => c.id === categoryId);
        if (!lsCategory) return;

        // Get ALL products for this category from the full list
        const categoryProducts = allProducts.filter(
          (p: any) => p.lightspeed_category_id === categoryId
        );

        console.log(`Adding category "${lsCategory.name}" with ${categoryProducts.length} products`);

        return fetch('/api/store/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: lsCategory.name,
            source: 'lightspeed',
            lightspeed_category_id: lsCategory.id,
            product_ids: categoryProducts.map((p: any) => p.id),
          }),
        });
      });

      await Promise.all(promises);
      await fetchData();
      setIsScanDialogOpen(false);
      setSelectedLightspeedCategories(new Set());
    } catch (error) {
      console.error('Error adding categories:', error);
      alert('Failed to add some categories');
    } finally {
      setAddingMultiple(false);
    }
  };

  // Refresh products for a Lightspeed category
  const handleRefreshCategoryProducts = async (category: StoreCategory) => {
    if (!category.lightspeed_category_id) return;

    try {
      setSaving(true);

      // Fetch ALL products for this category
      const allProductsRes = await fetch('/api/products?pageSize=10000&status=active&stock=in-stock');
      const allProductsData = await allProductsRes.json();
      const allProducts = allProductsData.products || [];

      // Filter products for this category
      const categoryProducts = allProducts.filter(
        (p: any) => p.lightspeed_category_id === category.lightspeed_category_id
      );

      console.log(`Refreshing "${category.name}": found ${categoryProducts.length} products`);

      // Update category with new product list
      const response = await fetch('/api/store/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: category.id,
          product_ids: categoryProducts.map((p: any) => p.id),
        }),
      });

      if (response.ok) {
        await fetchData();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to refresh products');
      }
    } catch (error) {
      console.error('Error refreshing products:', error);
      alert('Failed to refresh products');
    } finally {
      setSaving(false);
    }
  };

  // Open add custom category dialog
  const handleAddCustom = () => {
    setFormData({ name: '', productIds: [] });
    setIsAddDialogOpen(true);
  };

  // Save custom category
  const handleSaveCustom = async () => {
    if (!formData.name.trim()) return;

    try {
      setSaving(true);

      const response = await fetch('/api/store/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          source: 'custom',
          product_ids: formData.productIds,
        }),
      });

      if (response.ok) {
        await fetchData();
        setIsAddDialogOpen(false);
      }
    } catch (error) {
      console.error('Error saving category:', error);
    } finally {
      setSaving(false);
    }
  };

  // Open edit dialog
  const handleEdit = (category: StoreCategory) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      productIds: category.product_ids,
    });
    setIsEditDialogOpen(true);
  };

  // Update category
  const handleUpdate = async () => {
    if (!editingCategory || !formData.name.trim()) return;

    try {
      setSaving(true);

      const response = await fetch('/api/store/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingCategory.id,
          name: formData.name,
          product_ids: formData.productIds,
        }),
      });

      if (response.ok) {
        await fetchData();
        setIsEditDialogOpen(false);
      }
    } catch (error) {
      console.error('Error updating category:', error);
    } finally {
      setSaving(false);
    }
  };

  // Delete category
  const handleDelete = async (categoryId: string) => {
    try {
      const response = await fetch(`/api/store/categories?id=${categoryId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchData();
      }
    } catch (error) {
      console.error('Error deleting category:', error);
    } finally {
      setDeleteConfirmId(null);
    }
  };

  // Update carousel size (optimistic)
  const handleCarouselSizeChange = async (category: StoreCategory, size: CarouselSize) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === category.id ? { ...c, carousel_size: size } : c))
    );
    await fetch('/api/store/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: category.id, carousel_size: size }),
    });
  };

  // Handle reorder
  const handleReorder = async (newOrder: StoreCategory[]) => {
    setCategories(newOrder);

    try {
      await Promise.all(
        newOrder.map((category, index) =>
          fetch('/api/store/categories', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: category.id,
              display_order: index,
            }),
          })
        )
      );
    } catch (error) {
      console.error('Error updating order:', error);
      fetchData();
    }
  };

  // Open brand carousel dialog — scans store's product brands on first open
  const handleAddBrandCarousel = async () => {
    setSelectedBrand('');
    setBrandDisplayName('');
    setBrandListExpanded(false);
    setIsBrandDialogOpen(true);

    if (brandOptions.length === 0) {
      try {
        setBrandScanning(true);
        const res = await fetch('/api/store/brands-scan');
        if (res.ok) {
          const data = await res.json();
          setBrandOptions(data.brands || []);
        }
      } catch (err) {
        console.error('Error scanning brands:', err);
      } finally {
        setBrandScanning(false);
      }
    }
  };

  // Select a brand from the list
  const handleSelectBrand = (brandName: string) => {
    setSelectedBrand(brandName);
    // Auto-fill display name only if user hasn't typed one yet
    setBrandDisplayName((prev) => (prev.trim() === '' || prev === selectedBrand ? brandName : prev));
  };

  // Save brand carousel
  const handleSaveBrandCarousel = async () => {
    if (!selectedBrand.trim()) return;
    const displayName = brandDisplayName.trim() || selectedBrand;

    try {
      setSaving(true);
      const response = await fetch('/api/store/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName,
          source: 'brand',
          brand_name: selectedBrand,
          product_ids: [],
        }),
      });

      if (response.ok) {
        await fetchData();
        setIsBrandDialogOpen(false);
      }
    } catch (err) {
      console.error('Error saving brand carousel:', err);
    } finally {
      setSaving(false);
    }
  };

  // Toggle product selection
  const toggleProduct = (productId: string) => {
    setFormData((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(productId)
        ? prev.productIds.filter((id) => id !== productId)
        : [...prev.productIds, productId],
    }));
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
      {/* Action Buttons */}
      <div className="flex gap-2 justify-end flex-wrap">
        <Button
          onClick={handleScanLightspeed}
          variant="outline"
          disabled={scanning}
          className="rounded-md"
        >
          {scanning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Scan className="h-4 w-4 mr-2" />
              Scan Lightspeed
            </>
          )}
        </Button>
        <Button onClick={handleAddBrandCarousel} variant="outline" className="rounded-md">
          <Tag className="h-4 w-4 mr-2" />
          Add Brand Carousel
        </Button>
        <Button onClick={handleAddCustom} className="rounded-md">
          <Plus className="h-4 w-4 mr-2" />
          Add Custom
        </Button>
      </div>

      {/* Categories List */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-gray-600">No categories added yet</p>
          </CardContent>
        </Card>
      ) : (
        <Reorder.Group
          axis="y"
          values={categories}
          onReorder={handleReorder}
          className="space-y-2"
        >
          {categories.map((category) => (
            <Reorder.Item key={category.id} value={category}>
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-md hover:shadow-sm transition-shadow cursor-move bg-white">
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {category.name}
                    </h4>
                    <Badge
                      variant="outline"
                      className={`text-xs flex-shrink-0 ${
                        category.source === 'brand'
                          ? 'border-violet-300 text-violet-700 bg-violet-50'
                          : category.source === 'lightspeed'
                          ? 'border-blue-300 text-blue-700 bg-blue-50'
                          : ''
                      }`}
                    >
                      {category.source === 'brand' ? `Brand: ${category.brand_name}` : category.source}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {category.source === 'brand'
                      ? 'Matches products by brand automatically'
                      : `${category.product_ids.length} products assigned`}
                  </p>
                </div>

                {/* Carousel size toggle */}
                <div className="flex items-center rounded-md border border-gray-200 overflow-hidden flex-shrink-0 text-xs font-medium">
                  {(
                    [
                      { value: 'featured', label: 'Featured', count: 4 },
                      { value: 'normal',   label: 'Normal',   count: 6 },
                      { value: 'compact',  label: 'Compact',  count: 8 },
                    ] as { value: CarouselSize; label: string; count: number }[]
                  ).map(({ value, label, count }) => {
                    const active = (category.carousel_size ?? 'normal') === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => handleCarouselSizeChange(category, value)}
                        title={`${label} — shows ${count} products`}
                        className={`px-2.5 py-1.5 cursor-pointer transition-colors border-r border-gray-200 last:border-r-0 ${
                          active ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        {label} <span className="opacity-60">({count})</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  {category.source === 'lightspeed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRefreshCategoryProducts(category)}
                      className="h-8 px-2 text-xs"
                      title="Refresh products from Lightspeed"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(category)}
                    className="h-8 w-8 p-0"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteConfirmId(category.id)}
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

      {/* Lightspeed Scan Dialog */}
      <Dialog open={isScanDialogOpen} onOpenChange={setIsScanDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Lightspeed Categories</DialogTitle>
            <DialogDescription>
              Select categories to add to your store. Products will be automatically assigned.
            </DialogDescription>
          </DialogHeader>

          {/* Select All Button */}
          {lightspeedCategories.length > 0 && (
            <div className="flex items-center justify-between px-1 pb-2 border-b">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                className="rounded-md"
              >
                {selectedLightspeedCategories.size === lightspeedCategories.length
                  ? 'Deselect All'
                  : 'Select All'}
              </Button>
              <span className="text-sm text-gray-600">
                {selectedLightspeedCategories.size} of {lightspeedCategories.length} selected
              </span>
            </div>
          )}

          <div className="overflow-y-auto max-h-[45vh]">
            {lightspeedCategories.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-600">
                No new categories available
              </div>
            ) : (
              <div className="space-y-2 pr-1">
                {lightspeedCategories.map((lsCategory) => (
                  <div
                    key={lsCategory.id}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-md hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleLightspeedCategory(lsCategory.id)}
                  >
                    <Checkbox
                      checked={selectedLightspeedCategories.has(lsCategory.id)}
                      onCheckedChange={() => toggleLightspeedCategory(lsCategory.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {lsCategory.name}
                      </h4>
                      <p className="text-xs text-gray-600">
                        {lsCategory.product_count} products will be added
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsScanDialogOpen(false)}
              disabled={addingMultiple}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSelectedCategories}
              disabled={selectedLightspeedCategories.size === 0 || addingMultiple}
              className="rounded-md"
            >
              {addingMultiple ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding {selectedLightspeedCategories.size} categories...
                </>
              ) : (
                `Add ${selectedLightspeedCategories.size} ${selectedLightspeedCategories.size === 1 ? 'Category' : 'Categories'}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Custom Category Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Add Custom Category</DialogTitle>
            <DialogDescription>
              Create a custom category and select products to include
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">Category Name *</Label>
              <Input
                id="category-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., New Arrivals"
              />
            </div>

            <div className="space-y-2">
              <Label>Select Products ({formData.productIds.length} selected)</Label>
              <div className="border rounded-md overflow-y-auto max-h-[42vh]">
                <div className="p-3">
                  {products.length === 0 ? (
                    <p className="text-sm text-gray-600 text-center py-8">
                      No products available
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                          onClick={() => toggleProduct(product.id)}
                        >
                          <Checkbox
                            checked={formData.productIds.includes(product.id)}
                            onCheckedChange={() => toggleProduct(product.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {(product as any).display_name || product.description}
                            </p>
                            <p className="text-xs text-gray-600">
                              ${product.price} • Stock: {product.qoh}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCustom}
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

      {/* Edit Category Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update category name and product selection
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-category-name">Category Name *</Label>
              <Input
                id="edit-category-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Select Products ({formData.productIds.length} selected)</Label>
              <div className="border rounded-md overflow-y-auto max-h-[42vh]">
                <div className="p-3">
                  {products.length === 0 ? (
                    <p className="text-sm text-gray-600 text-center py-8">
                      No products available
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-md cursor-pointer"
                          onClick={() => toggleProduct(product.id)}
                        >
                          <Checkbox
                            checked={formData.productIds.includes(product.id)}
                            onCheckedChange={() => toggleProduct(product.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {(product as any).display_name || product.description}
                            </p>
                            <p className="text-xs text-gray-600">
                              ${product.price} • Stock: {product.qoh}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!formData.name.trim() || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Update'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Brand Carousel Dialog */}
      <Dialog open={isBrandDialogOpen} onOpenChange={setIsBrandDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Brand Carousel</DialogTitle>
            <DialogDescription>
              Choose a brand — the carousel will automatically show all in-stock products from that brand.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Brand picker */}
            <div className="space-y-2">
              <Label>Brand</Label>
              {brandScanning ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning your products...
                </div>
              ) : brandOptions.length > 0 ? (
                <>
                  {/* Show top brands inline, rest behind expand */}
                  <div className="border rounded-md overflow-hidden">
                    {(brandListExpanded ? brandOptions : brandOptions.slice(0, 6)).map((b) => (
                      <button
                        key={b.name}
                        type="button"
                        onClick={() => handleSelectBrand(b.name)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b last:border-b-0 transition-colors text-left ${
                          selectedBrand === b.name
                            ? 'bg-gray-900 text-white'
                            : 'hover:bg-gray-50 text-gray-900'
                        }`}
                      >
                        <span className="font-medium">{b.name}</span>
                        <span className={`text-xs ${selectedBrand === b.name ? 'text-gray-300' : 'text-gray-400'}`}>
                          {b.product_count} product{b.product_count !== 1 ? 's' : ''}
                        </span>
                      </button>
                    ))}
                    {brandOptions.length > 6 && (
                      <button
                        type="button"
                        onClick={() => setBrandListExpanded((v) => !v)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 border-t transition-colors"
                      >
                        {brandListExpanded ? (
                          <><ChevronUp className="h-3 w-3" /> Show less</>
                        ) : (
                          <><ChevronDown className="h-3 w-3" /> Show {brandOptions.length - 6} more brands</>
                        )}
                      </button>
                    )}
                  </div>
                  {/* Free-text fallback */}
                  <p className="text-xs text-gray-500">Or type a brand name:</p>
                  <Input
                    value={selectedBrand}
                    onChange={(e) => {
                      setSelectedBrand(e.target.value);
                      setBrandDisplayName((prev) => prev === selectedBrand ? e.target.value : prev);
                    }}
                    placeholder="e.g. Wahoo"
                  />
                </>
              ) : (
                <Input
                  value={selectedBrand}
                  onChange={(e) => {
                    setSelectedBrand(e.target.value);
                    setBrandDisplayName((prev) => prev === selectedBrand ? e.target.value : prev);
                  }}
                  placeholder="e.g. Wahoo"
                />
              )}
            </div>

            {/* Display name */}
            <div className="space-y-2">
              <Label htmlFor="brand-display-name">
                Carousel title <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="brand-display-name"
                value={brandDisplayName}
                onChange={(e) => setBrandDisplayName(e.target.value)}
                placeholder={selectedBrand || 'e.g. Wahoo Products'}
              />
              <p className="text-xs text-gray-500">Leave blank to use the brand name as the title.</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBrandDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveBrandCarousel}
              disabled={!selectedBrand.trim() || saving}
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
              ) : (
                'Add Carousel'
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
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this category? This action cannot be
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

