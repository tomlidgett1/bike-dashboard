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
  ImagePlus,
  X,
  Search,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
import type {
  StoreCategory,
  LightspeedCategoryOption,
  CarouselSize,
  StoreCarouselPage,
} from "@/lib/types/store";
import { UberCarouselLogo } from "@/components/marketplace/store-profile/uber-carousel-logo";

interface BrandOption {
  name: string;
  product_count: number;
}

// ============================================================
// Store carousels manager
// Manage product carousels with Lightspeed scan and custom creation
// ============================================================

interface CategoryFormData {
  name: string;
  productIds: string[];
}

/** Fixed-height carousel form dialogs — body scrolls, header/footer stay put. */
const PRODUCT_PICKER_DIALOG_CLASS =
  "flex h-[min(32rem,85vh)] max-h-[min(32rem,85vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl";
const BRAND_CAROUSEL_DIALOG_CLASS =
  "flex h-[min(26rem,85vh)] max-h-[min(26rem,85vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg";

function categoryPage(category: StoreCategory): StoreCarouselPage {
  return category.store_page === "bikes" ? "bikes" : "products";
}

export function StoreCategoriesManager({
  refreshKey,
  activePage = "products",
}: {
  refreshKey?: number;
  activePage?: StoreCarouselPage;
} = {}) {
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

  // Product picker filter state
  const [productSearch, setProductSearch] = React.useState('');
  const [productSourceFilter, setProductSourceFilter] = React.useState<'all' | 'lightspeed' | 'private' | 'uber'>('all');

  // Logo upload state
  const [uploadingLogoId, setUploadingLogoId] = React.useState<string | null>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const logoTargetIdRef = React.useRef<string | null>(null);

  const handleLogoClick = (categoryId: string) => {
    logoTargetIdRef.current = categoryId;
    logoInputRef.current?.click();
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const categoryId = logoTargetIdRef.current;
    if (!file || !categoryId) return;

    setUploadingLogoId(categoryId);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const ext = file.name.split('.').pop();
      // Must be under user's own folder to satisfy RLS policy
      const path = `${user.id}/category-${categoryId}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('logo')
        .upload(path, file, { cacheControl: '31536000', upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('logo').getPublicUrl(path);

      // Persist via store categories API
      await fetch('/api/store/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: categoryId, logo_url: publicUrl }),
      });

      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, logo_url: publicUrl } : c))
      );
    } catch (err) {
      console.error('Logo upload failed:', err);
    } finally {
      setUploadingLogoId(null);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async (categoryId: string) => {
    setUploadingLogoId(categoryId);
    try {
      await fetch('/api/store/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: categoryId, logo_url: null }),
      });
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, logo_url: null } : c))
      );
    } catch (err) {
      console.error('Logo remove failed:', err);
    } finally {
      setUploadingLogoId(null);
    }
  };

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

      const [categoriesRes, productsRes, privateListingsRes, categoryNamesRes] = await Promise.all([
        fetch('/api/store/categories'),
        fetch('/api/products?pageSize=2000&status=active&stock=in-stock'),
        fetch('/api/products?pageSize=500&status=active&listing_type=private_listing'),
        fetch('/api/store/category-names'),
      ]);

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }

      if (productsRes.ok) {
        const lsData = await productsRes.json();
        const lsProducts: any[] = lsData.products || [];
        const lsIds = new Set(lsProducts.map((p: any) => p.id));

        let privateProducts: any[] = [];
        if (privateListingsRes.ok) {
          const privateData = await privateListingsRes.json();
          // Deduplicate — private listings with qoh>0 may already appear in lsProducts
          privateProducts = (privateData.products || []).filter((p: any) => !lsIds.has(p.id));
        }

        setProducts([...lsProducts, ...privateProducts]);
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
  }, [fetchData, refreshKey]);

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
        alert(error.error || 'Failed to scan Lightspeed');
      }
    } catch (error) {
      console.error('Error scanning categories:', error);
      alert('Failed to scan Lightspeed');
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
            store_page: activePage,
          }),
        });
      });

      await Promise.all(promises);
      await fetchData();
      setIsScanDialogOpen(false);
      setSelectedLightspeedCategories(new Set());
    } catch (error) {
      console.error('Error adding categories:', error);
      alert('Failed to add some carousels');
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
    setProductSearch('');
    setProductSourceFilter('all');
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
          store_page: activePage,
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

  const handleAddUberCarousel = async () => {
    const existingUberCarousel = categories.find((category) => category.source === 'uber');
    if (existingUberCarousel) {
      alert('An Uber Delivery carousel already exists.');
      return;
    }

    try {
      setSaving(true);
      const response = await fetch('/api/store/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Uber Delivery',
          source: 'uber',
          product_ids: [],
          store_page: activePage,
        }),
      });

      if (response.ok) await fetchData();
    } catch (error) {
      console.error('Error adding Uber carousel:', error);
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
    setProductSearch('');
    setProductSourceFilter('all');
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

  // Update carousel title visibility (optimistic)
  const handleHideTitleChange = async (category: StoreCategory) => {
    const next = !category.hide_title;
    setCategories((prev) =>
      prev.map((c) => (c.id === category.id ? { ...c, hide_title: next } : c))
    );
    await fetch('/api/store/categories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: category.id, hide_title: next }),
    });
  };

  const pageCategories = React.useMemo(
    () =>
      categories
        .filter((category) => categoryPage(category) === activePage)
        .sort((a, b) => a.display_order - b.display_order),
    [categories, activePage],
  );

  const handleStorePageChange = async (
    category: StoreCategory,
    nextPage: StoreCarouselPage,
  ) => {
    if (categoryPage(category) === nextPage) return;

    setCategories((prev) =>
      prev.map((item) =>
        item.id === category.id
          ? { ...item, store_page: nextPage, section_id: nextPage === "bikes" ? undefined : item.section_id }
          : item,
      ),
    );

    await fetch("/api/store/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: category.id,
        store_page: nextPage,
        ...(nextPage === "bikes" ? { section_id: null } : {}),
      }),
    });
  };

  // Handle reorder within the active storefront page
  const handleReorder = async (newOrder: StoreCategory[]) => {
    const otherPageCategories = categories.filter(
      (category) => categoryPage(category) !== activePage,
    );
    const merged = [...otherPageCategories, ...newOrder];
    setCategories(merged);

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
          store_page: activePage,
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

  const lightspeedCount = products.filter(p => p.listing_type !== 'private_listing').length;
  const privateCount = products.filter(p => p.listing_type === 'private_listing').length;
  const uberCount = products.filter(p => p.uber_delivery_enabled === true).length;

  const filteredProducts = products.filter(p => {
    const isPrivate = p.listing_type === 'private_listing';
    if (productSourceFilter === 'lightspeed' && isPrivate) return false;
    if (productSourceFilter === 'private' && !isPrivate) return false;
    if (productSourceFilter === 'uber' && p.uber_delivery_enabled !== true) return false;
    if (productSearch) {
      const q = productSearch.toLowerCase();
      if (!(p.display_name || p.description || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const visibleProductIds = React.useMemo(() => filteredProducts.map((product) => product.id), [filteredProducts]);
  const allVisibleSelected = visibleProductIds.length > 0 && visibleProductIds.every((id) => formData.productIds.includes(id));
  const toggleVisibleProducts = () => {
    setFormData((prev) => {
      if (allVisibleSelected) {
        const visibleSet = new Set(visibleProductIds);
        return { ...prev, productIds: prev.productIds.filter((id) => !visibleSet.has(id)) };
      }
      const next = new Set(prev.productIds);
      visibleProductIds.forEach((id) => next.add(id));
      return { ...prev, productIds: Array.from(next) };
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
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
          size="sm"
          disabled={scanning}
        >
          {scanning ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Scan className="size-4" />
              Scan Lightspeed
            </>
          )}
        </Button>
        <Button onClick={handleAddBrandCarousel} variant="outline" size="sm">
          <Tag className="size-4" />
          Add Brand Carousel
        </Button>
        <Button onClick={handleAddUberCarousel} variant="outline" size="sm" disabled={saving}>
          <Truck className="size-4" />
          Add Uber Carousel
        </Button>
        <Button onClick={handleAddCustom} size="sm">
          <Plus className="size-4" />
          Add custom carousel
        </Button>
      </div>

      {/* Carousels list */}
      {pageCategories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {activePage === "bikes"
                ? "No Bikes page carousels yet"
                : "No Products page carousels yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Reorder.Group
          axis="y"
          values={pageCategories}
          onReorder={handleReorder}
          className="space-y-2"
        >
          {pageCategories.map((category) => (
            <Reorder.Item key={category.id} value={category}>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-accent/40 cursor-move">
                <div className="flex-shrink-0 cursor-grab text-muted-foreground/60 active:cursor-grabbing">
                  <GripVertical className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-foreground truncate">
                      {category.name}
                    </h4>
                    <Badge variant="secondary" className="text-xs flex-shrink-0 font-normal">
                      {category.source === 'brand'
                        ? `Brand: ${category.brand_name}`
                        : category.source === 'uber'
                          ? 'Uber'
                          : category.source}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {category.source === 'brand'
                      ? 'Matches products by brand automatically'
                      : category.source === 'uber'
                        ? 'Automatically shows every Uber-enabled product'
                      : `${category.product_ids.length} products assigned`}
                  </p>
                  <div className="mt-2 flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                    {(["products", "bikes"] as StoreCarouselPage[]).map((page) => {
                      const isActive = categoryPage(category) === page;
                      return (
                        <button
                          key={page}
                          type="button"
                          onClick={() => void handleStorePageChange(category, page)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                            isActive
                              ? "text-gray-800 bg-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-200/70"
                          }`}
                        >
                          {page === "bikes" ? "Bikes page" : "Products page"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Logo upload + title toggle */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {uploadingLogoId === category.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : category.logo_url ? (
                    <div className="group relative h-8 w-20 flex items-center justify-center border border-border rounded-md bg-white overflow-hidden">
                      <img src={category.logo_url} alt="" className="max-h-full max-w-full object-contain p-0.5" />
                      <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleLogoClick(category.id)}
                          className="text-white hover:text-gray-200 cursor-pointer"
                          title="Replace logo"
                        >
                          <ImagePlus className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveLogo(category.id)}
                          className="text-white hover:text-red-300 cursor-pointer"
                          title="Remove logo"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    category.source === 'uber' ? (
                      <UberCarouselLogo />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleLogoClick(category.id)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-2 py-1 transition-colors cursor-pointer"
                        title="Add carousel logo"
                      >
                        <ImagePlus className="h-3.5 w-3.5" />
                        Logo
                      </button>
                    )
                  )}
                  {(category.logo_url || category.source === 'uber') && (
                    <button
                      type="button"
                      title={category.hide_title ? 'Title hidden — click to show' : 'Title visible — click to hide'}
                      onClick={() => handleHideTitleChange(category)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                        category.hide_title
                          ? 'border-dashed border-border text-muted-foreground hover:text-foreground'
                          : 'border-border bg-muted text-foreground hover:bg-muted/70'
                      }`}
                    >
                      {category.hide_title ? 'Title off' : 'Title on'}
                    </button>
                  )}
                </div>

                {/* Carousel size toggle */}
                <div className="flex items-center rounded-md bg-muted p-0.5 overflow-hidden flex-shrink-0 text-xs font-medium">
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
                        className={`rounded-[5px] px-2.5 py-1 cursor-pointer transition-colors ${
                          active
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
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
                      size="icon-sm"
                      onClick={() => handleRefreshCategoryProducts(category)}
                      title="Refresh products from Lightspeed"
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleEdit(category)}
                  >
                    <Edit2 className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteConfirmId(category.id)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {/* Shared hidden file input for logo uploads */}
      <input
        ref={logoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleLogoChange}
      />

      {/* Lightspeed Scan Dialog */}
      <Dialog open={isScanDialogOpen} onOpenChange={setIsScanDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Import from Lightspeed</DialogTitle>
            <DialogDescription>
              Select Lightspeed groups to add as carousels on your store. Products are assigned automatically.
            </DialogDescription>
          </DialogHeader>

          {/* Select All Button */}
          {lightspeedCategories.length > 0 && (
            <div className="flex items-center justify-between px-1 pb-2 border-b">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
              >
                {selectedLightspeedCategories.size === lightspeedCategories.length
                  ? 'Deselect All'
                  : 'Select All'}
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedLightspeedCategories.size} of {lightspeedCategories.length} selected
              </span>
            </div>
          )}

          <div className="overflow-y-auto max-h-[45vh]">
            {lightspeedCategories.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Nothing new to import from Lightspeed
              </div>
            ) : (
              <div className="space-y-2 pr-1">
                {lightspeedCategories.map((lsCategory) => (
                  <div
                    key={lsCategory.id}
                    className="flex items-center gap-3 p-3 border border-border rounded-md hover:bg-accent cursor-pointer"
                    onClick={() => toggleLightspeedCategory(lsCategory.id)}
                  >
                    <Checkbox
                      checked={selectedLightspeedCategories.has(lsCategory.id)}
                      onCheckedChange={() => toggleLightspeedCategory(lsCategory.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-foreground truncate">
                        {lsCategory.name}
                      </h4>
                      <p className="text-xs text-muted-foreground">
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
              size="sm"
              onClick={() => setIsScanDialogOpen(false)}
              disabled={addingMultiple}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAddSelectedCategories}
              disabled={selectedLightspeedCategories.size === 0 || addingMultiple}
            >
              {addingMultiple ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Adding {selectedLightspeedCategories.size} carousels...
                </>
              ) : (
                `Add ${selectedLightspeedCategories.size} ${selectedLightspeedCategories.size === 1 ? 'carousel' : 'carousels'}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add custom carousel dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className={PRODUCT_PICKER_DIALOG_CLASS}>
          <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-2">
            <DialogTitle>Add custom carousel</DialogTitle>
            <DialogDescription>
              Create a custom carousel and select products to include
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-4">
            <div className="space-y-2">
              <Label htmlFor="carousel-name">Carousel name *</Label>
              <Input
                id="carousel-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., New Arrivals"
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <Label>Select Products ({formData.productIds.length} selected)</Label>
                {filteredProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleVisibleProducts}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {allVisibleSelected ? 'Clear visible' : `Select visible (${filteredProducts.length})`}
                  </button>
                )}
              </div>
              <div className="shrink-0 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { key: 'all', label: `All (${products.length})` },
                    { key: 'lightspeed', label: `Lightspeed (${lightspeedCount})` },
                    { key: 'private', label: `Private (${privateCount})` },
                    { key: 'uber', label: `Uber (${uberCount})` },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProductSourceFilter(key)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        productSourceFilter === key
                          ? 'bg-foreground text-background'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                <div className="p-2">
                  {filteredProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {productSourceFilter === 'private'
                        ? 'No private listings yet. Add secondhand items via your Listings page.'
                        : productSourceFilter === 'uber'
                          ? 'No Uber-enabled products yet. Turn on Uber delivery for products in the Uber settings page.'
                        : 'No products found'}
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredProducts.map((product) => {
                        const isPrivate = product.listing_type === 'private_listing';
                        const isUber = product.uber_delivery_enabled === true;
                        return (
                          <div
                            key={product.id}
                            className="flex items-center gap-2.5 p-2 hover:bg-accent rounded-md cursor-pointer"
                            onClick={() => toggleProduct(product.id)}
                          >
                            <Checkbox
                              checked={formData.productIds.includes(product.id)}
                              onCheckedChange={() => toggleProduct(product.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-shrink-0 h-9 w-9 rounded overflow-hidden bg-muted flex items-center justify-center">
                              {product.resolved_image_url ? (
                                <img src={product.resolved_image_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {product.display_name || product.description}
                                </p>
                                {isPrivate ? (
                                  <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 bg-amber-50">Private</span>
                                ) : isUber ? (
                                  <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full border border-[#0eb462]/30 text-[#087a43] bg-[#0eb462]/10">Uber</span>
                                ) : (
                                  <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full border border-blue-300 text-blue-700 bg-blue-50">Lightspeed</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                ${product.price}{!isPrivate && ` • Stock: ${product.qoh}`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCustom}
              disabled={!formData.name.trim() || saving}
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

      {/* Edit carousel dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className={PRODUCT_PICKER_DIALOG_CLASS}>
          <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-2">
            <DialogTitle>Edit carousel</DialogTitle>
            <DialogDescription>
              Update carousel name and product selection
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pb-4">
            <div className="space-y-2">
              <Label htmlFor="edit-carousel-name">Carousel name *</Label>
              <Input
                id="edit-carousel-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex shrink-0 items-center justify-between gap-2">
                <Label>Select Products ({formData.productIds.length} selected)</Label>
                {filteredProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={toggleVisibleProducts}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {allVisibleSelected ? 'Clear visible' : `Select visible (${filteredProducts.length})`}
                  </button>
                )}
              </div>
              <div className="shrink-0 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search products..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { key: 'all', label: `All (${products.length})` },
                    { key: 'lightspeed', label: `Lightspeed (${lightspeedCount})` },
                    { key: 'private', label: `Private (${privateCount})` },
                    { key: 'uber', label: `Uber (${uberCount})` },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProductSourceFilter(key)}
                      className={`rounded-md px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        productSourceFilter === key
                          ? 'bg-foreground text-background'
                          : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
                <div className="p-2">
                  {filteredProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {productSourceFilter === 'private'
                        ? 'No private listings yet. Add secondhand items via your Listings page.'
                        : productSourceFilter === 'uber'
                          ? 'No Uber-enabled products yet. Turn on Uber delivery for products in the Uber settings page.'
                        : 'No products found'}
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredProducts.map((product) => {
                        const isPrivate = product.listing_type === 'private_listing';
                        const isUber = product.uber_delivery_enabled === true;
                        return (
                          <div
                            key={product.id}
                            className="flex items-center gap-2.5 p-2 hover:bg-accent rounded-md cursor-pointer"
                            onClick={() => toggleProduct(product.id)}
                          >
                            <Checkbox
                              checked={formData.productIds.includes(product.id)}
                              onCheckedChange={() => toggleProduct(product.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-shrink-0 h-9 w-9 rounded overflow-hidden bg-muted flex items-center justify-center">
                              {product.resolved_image_url ? (
                                <img src={product.resolved_image_url} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {product.display_name || product.description}
                                </p>
                                {isPrivate ? (
                                  <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full border border-amber-300 text-amber-700 bg-amber-50">Private</span>
                                ) : isUber ? (
                                  <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full border border-[#0eb462]/30 text-[#087a43] bg-[#0eb462]/10">Uber</span>
                                ) : (
                                  <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full border border-blue-300 text-blue-700 bg-blue-50">Lightspeed</span>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                ${product.price}{!isPrivate && ` • Stock: ${product.qoh}`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleUpdate}
              disabled={!formData.name.trim() || saving}
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
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
        <DialogContent className={BRAND_CAROUSEL_DIALOG_CLASS}>
          <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-2">
            <DialogTitle>Add Brand Carousel</DialogTitle>
            <DialogDescription>
              Choose a brand — the carousel will automatically show all in-stock products from that brand.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            <div className="space-y-4">
            <div className="space-y-2">
              <Label>Brand</Label>
              {brandScanning ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning your products...
                </div>
              ) : brandOptions.length > 0 ? (
                <>
                  <div className="rounded-md border border-border overflow-hidden">
                    {(brandListExpanded ? brandOptions : brandOptions.slice(0, 6)).map((b) => (
                      <button
                        key={b.name}
                        type="button"
                        onClick={() => handleSelectBrand(b.name)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm border-b last:border-b-0 transition-colors text-left ${
                          selectedBrand === b.name
                            ? 'bg-accent text-accent-foreground'
                            : 'hover:bg-accent/50 text-foreground'
                        }`}
                      >
                        <span className="font-medium">{b.name}</span>
                        <span className={`text-xs ${selectedBrand === b.name ? 'text-accent-foreground/70' : 'text-muted-foreground'}`}>
                          {b.product_count} product{b.product_count !== 1 ? 's' : ''}
                        </span>
                      </button>
                    ))}
                    {brandOptions.length > 6 && (
                      <button
                        type="button"
                        onClick={() => setBrandListExpanded((v) => !v)}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 border-t transition-colors"
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
                  <p className="text-xs text-muted-foreground">Or type a brand name:</p>
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
                Carousel title <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Input
                id="brand-display-name"
                value={brandDisplayName}
                onChange={(e) => setBrandDisplayName(e.target.value)}
                placeholder={selectedBrand || 'e.g. Wahoo Products'}
              />
              <p className="text-xs text-muted-foreground">Leave blank to use the brand name as the title.</p>
            </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => setIsBrandDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveBrandCarousel}
              disabled={!selectedBrand.trim() || saving}
            >
              {saving ? (
                <><Loader2 className="size-4 animate-spin" />Saving...</>
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
            <AlertDialogTitle>Delete carousel</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this carousel? This action cannot be
              undone.
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
