"use client";

import * as React from "react";
import Image from "next/image";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
} from "@/components/layout/app-sidebar/dashboard-icons";
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
import type {
  StoreCategory,
  LightspeedCategoryOption,
  CarouselSize,
  StoreCarouselPage,
} from "@/lib/types/store";
import { UberCarouselLogo } from "@/components/marketplace/store-profile/uber-carousel-logo";
import { LightspeedCarouselLogo } from "@/components/marketplace/store-profile/lightspeed-carousel-logo";
import type { CarouselCreateRequest } from "@/components/settings/store-carousels-new-menu";
import { cn } from "@/lib/utils";
import type { BrandLogoSearchResult } from "@/lib/store/brand-logo-serper";

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
  storePage: StoreCarouselPage;
  carouselSize: CarouselSize;
  hideTitle: boolean;
}

function carouselProductCount(category: StoreCategory): number {
  return category.resolved_product_count ?? category.product_ids.length;
}

function CarouselCardMetadata({ category }: { category: StoreCategory }) {
  const count = carouselProductCount(category);
  const countLabel = `${count} product${count === 1 ? "" : "s"}`;

  if (category.source === "brand") {
    return (
      <p className="mt-0.5 text-xs text-gray-500">
        {countLabel} · Brand · {category.brand_name ?? category.name}
      </p>
    );
  }

  if (category.source === "uber") {
    return <p className="mt-0.5 text-xs text-gray-500">{countLabel} · Uber delivery</p>;
  }

  if (category.source === "specials") {
    return (
      <p className="mt-0.5 text-xs text-gray-500">{countLabel} · Specials · Auto-rotating</p>
    );
  }

  if (category.source === "lightspeed") {
    const originalName =
      category.lightspeed_category_name &&
      category.lightspeed_category_name !== category.name
        ? category.lightspeed_category_name
        : null;

    return (
      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
        <span>{countLabel}</span>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <LightspeedCarouselLogo variant="badge" />
        {originalName ? (
          <>
            <span aria-hidden className="text-gray-300">
              ·
            </span>
            <span className="truncate">{originalName}</span>
          </>
        ) : null}
      </p>
    );
  }

  return <p className="mt-0.5 text-xs text-gray-500">{countLabel} · Custom</p>;
}

interface CarouselProductPreview {
  id: string;
  display_name?: string | null;
  description?: string | null;
  resolved_image_url?: string | null;
  price?: number | null;
  qoh?: number | null;
  listing_type?: string | null;
  uber_delivery_enabled?: boolean | null;
}

function CarouselProductRow({
  product,
  onClick,
  trailing,
}: {
  product: CarouselProductPreview;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) {
  const isPrivate = product.listing_type === "private_listing";
  const isUber = product.uber_delivery_enabled === true;
  const label = product.display_name || product.description || "Untitled product";

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md p-2",
        onClick && "cursor-pointer hover:bg-accent",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {product.resolved_image_url ? (
          <img src={product.resolved_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium text-foreground">{label}</p>
          {isPrivate ? (
            <span className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
              Private
            </span>
          ) : isUber ? (
            <span className="shrink-0 rounded-md border border-[#0eb462]/30 bg-[#0eb462]/10 px-1.5 py-0.5 text-xs text-[#087a43]">
              Uber
            </span>
          ) : (
            <span className="shrink-0 rounded-md border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
              Lightspeed
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          ${product.price ?? "—"}
          {!isPrivate && product.qoh != null ? ` · Stock: ${product.qoh}` : ""}
        </p>
      </div>
      {trailing}
    </div>
  );
}

function carouselProductsSubtitle(category: StoreCategory): string | null {
  if (category.source === "brand") {
    return category.brand_name
      ? `Synced automatically from ${category.brand_name} products in stock`
      : "Synced automatically from brand products in stock";
  }
  if (category.source === "lightspeed") {
    return "Synced from your Lightspeed category — updates when stock changes";
  }
  if (category.source === "uber") {
    return "Synced automatically from Uber-enabled products in stock";
  }
  if (category.source === "specials") {
    return "Curated automatically — manage products on the Specials page";
  }
  return null;
}

const PAGE_ORDER_BASE: Record<StoreCarouselPage, number> = {
  products: 0,
  bikes: 5000,
};

/** Fixed-height carousel form dialogs — body scrolls, header/footer stay put. */
const PRODUCT_PICKER_DIALOG_CLASS =
  "flex !flex-col h-[min(85vh,40rem)] max-h-[85vh] w-full max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl";
const EDIT_CAROUSEL_DIALOG_CLASS =
  "flex !flex-col h-[min(85vh,40rem)] max-h-[85vh] w-full max-w-[calc(100%-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl";
const BRAND_CAROUSEL_DIALOG_CLASS =
  "flex h-[min(26rem,85vh)] max-h-[min(26rem,85vh)] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg";

function categoryPage(category: StoreCategory): StoreCarouselPage {
  return category.store_page === "bikes" ? "bikes" : "products";
}

function createPageLabel(page: StoreCarouselPage): string {
  return page === "bikes" ? "Bikes page" : "Products page";
}

function SortableCarouselCard({
  category,
  onEdit,
  onDelete,
  onRefresh,
}: {
  category: StoreCategory;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("bg-white", isDragging && "opacity-60")}
    >
      <div className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="flex-shrink-0 cursor-grab rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing"
          aria-label={`Reorder ${category.name}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-50">
          {category.source === "uber" ? (
            <UberCarouselLogo className="h-9 w-9" />
          ) : category.logo_url ? (
            <img
              src={category.logo_url}
              alt=""
              className="h-full w-full object-contain p-0.5"
            />
          ) : (
            <Package className="h-4 w-4 text-gray-300" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-medium text-gray-900">{category.name}</h4>
          <CarouselCardMetadata category={category} />
        </div>

        <div className="flex flex-shrink-0 items-center gap-0.5">
          {category.source === "lightspeed" && onRefresh ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              title="Refresh products from Lightspeed"
            >
              <RotateCcw className="size-4" />
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onEdit} className="rounded-full">
            <Edit2 className="h-3.5 w-3.5" />
            Edit carousel
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
      </div>
    </div>
  );
}

export function StoreCategoriesManager({
  refreshKey,
  activePage = "products",
  createRequest,
}: {
  refreshKey?: number;
  activePage?: StoreCarouselPage;
  createRequest?: CarouselCreateRequest | null;
} = {}) {
  const createPageRef = React.useRef<StoreCarouselPage>(activePage);
  const getCreatePage = () => createPageRef.current;

  React.useEffect(() => {
    createPageRef.current = activePage;
  }, [activePage]);
  const [categories, setCategories] = React.useState<StoreCategory[]>([]);
  const [pickerProducts, setPickerProducts] = React.useState<any[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);
  const [pickerPage, setPickerPage] = React.useState(1);
  const [pickerHasMore, setPickerHasMore] = React.useState(false);
  const [pickerTotal, setPickerTotal] = React.useState(0);
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
  const pendingDeleteIdRef = React.useRef<string | null>(null);
  const [formData, setFormData] = React.useState<CategoryFormData>({
    name: '',
    productIds: [],
    storePage: 'products',
    carouselSize: 'normal',
    hideTitle: false,
  });

  // Product picker filter state
  const [productSearch, setProductSearch] = React.useState('');
  const [productSourceFilter, setProductSourceFilter] = React.useState<'all' | 'lightspeed' | 'private' | 'uber'>('all');

  // Logo upload state
  const [uploadingLogoId, setUploadingLogoId] = React.useState<string | null>(null);
  const logoInputRef = React.useRef<HTMLInputElement>(null);
  const logoTargetIdRef = React.useRef<string | null>(null);
  const [logoSearchQuery, setLogoSearchQuery] = React.useState("");
  const [logoSearchResults, setLogoSearchResults] = React.useState<BrandLogoSearchResult[]>([]);
  const [logoSearching, setLogoSearching] = React.useState(false);
  const [logoSearchError, setLogoSearchError] = React.useState<string | null>(null);
  const [logoImportingUrl, setLogoImportingUrl] = React.useState<string | null>(null);
  const [carouselMemberProducts, setCarouselMemberProducts] = React.useState<
    CarouselProductPreview[]
  >([]);
  const [carouselMembersLoading, setCarouselMembersLoading] = React.useState(false);

  const resetLogoSearch = React.useCallback(() => {
    setLogoSearchQuery("");
    setLogoSearchResults([]);
    setLogoSearchError(null);
    setLogoSearching(false);
    setLogoImportingUrl(null);
  }, []);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Fetch categories (product_ids for dynamic carousels are synced server-side)
  const fetchData = React.useCallback(async () => {
    try {
      setLoading(true);

      const categoriesRes = await fetch('/api/store/categories');

      if (categoriesRes.ok) {
        const data = await categoriesRes.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

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
            lightspeed_category_name: lsCategory.name,
            product_ids: categoryProducts.map((p: any) => p.id),
            store_page: getCreatePage(),
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
    setFormData({
      name: '',
      productIds: [],
      storePage: getCreatePage(),
      carouselSize: 'normal',
      hideTitle: false,
    });
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
          store_page: getCreatePage(),
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
          store_page: getCreatePage(),
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
      storePage: categoryPage(category),
      carouselSize: category.carousel_size ?? 'normal',
      hideTitle: category.hide_title ?? false,
    });
    setProductSearch('');
    setProductSourceFilter('all');
    resetLogoSearch();
    setLogoSearchQuery(category.name ? `${category.name} logo` : '');
    setIsEditDialogOpen(true);
  };

  const handleLogoSearch = async () => {
    const query =
      logoSearchQuery.trim() ||
      (formData.name.trim() ? `${formData.name.trim()} logo` : "");
    if (!query) {
      setLogoSearchError("Enter a carousel name or search query first");
      return;
    }

    try {
      setLogoSearching(true);
      setLogoSearchError(null);
      setLogoSearchResults([]);

      const response = await fetch("/api/store/categories/search-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: logoSearchQuery.trim() || undefined,
          carouselName: formData.name.trim() || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setLogoSearchError(data.error || "Logo search failed");
        return;
      }

      setLogoSearchResults(Array.isArray(data.results) ? data.results : []);
      if (!data.results?.length) {
        setLogoSearchError("No logo images found — try a different search");
      }
    } catch (error) {
      console.error("Error searching carousel logos:", error);
      setLogoSearchError("Logo search failed");
    } finally {
      setLogoSearching(false);
    }
  };

  const handleSelectSerperLogo = async (result: BrandLogoSearchResult) => {
    const categoryId = editingCategory?.id;
    if (!categoryId) return;

    try {
      setLogoImportingUrl(result.url);
      setLogoSearchError(null);

      const response = await fetch("/api/store/categories/import-logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: result.url, categoryId }),
      });

      const data = await response.json();
      if (!response.ok) {
        setLogoSearchError(data.error || "Could not import logo");
        return;
      }

      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, logo_url: data.url } : c)),
      );
    } catch (error) {
      console.error("Error importing carousel logo:", error);
      setLogoSearchError("Could not import logo");
    } finally {
      setLogoImportingUrl(null);
    }
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
          store_page: formData.storePage,
          carousel_size: formData.carouselSize,
          hide_title: formData.hideTitle,
          ...(formData.storePage === 'bikes' ? { section_id: null } : {}),
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
      } else {
        const error = await response.json().catch(() => ({}));
        alert(error.error || 'Failed to delete carousel');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete carousel');
    } finally {
      setDeleteConfirmId(null);
      pendingDeleteIdRef.current = null;
    }
  };

  const pageCategories = React.useMemo(
    () =>
      categories
        .filter(
          (category) =>
            categoryPage(category) === activePage &&
            category.source !== 'display_override' &&
            !category.id.startsWith('auto-'),
        )
        .sort((a, b) => a.display_order - b.display_order),
    [categories, activePage],
  );

  const editingCategoryLive = React.useMemo(
    () =>
      editingCategory
        ? categories.find((category) => category.id === editingCategory.id) ?? editingCategory
        : null,
    [categories, editingCategory],
  );

  // Handle reorder within the active storefront page
  const handleReorder = async (newOrder: StoreCategory[]) => {
    const orderBase = PAGE_ORDER_BASE[activePage];
    const reorderedWithOrder = newOrder.map((category, index) => ({
      ...category,
      display_order: orderBase + index,
    }));
    const otherPageCategories = categories.filter(
      (category) => categoryPage(category) !== activePage,
    );
    setCategories([...otherPageCategories, ...reorderedWithOrder]);

    try {
      const results = await Promise.all(
        reorderedWithOrder.map((category, index) =>
          fetch('/api/store/categories', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: category.id,
              display_order: orderBase + index,
            }),
          }),
        ),
      );

      if (results.some((response) => !response.ok)) {
        throw new Error('One or more reorder updates failed');
      }
    } catch (error) {
      console.error('Error updating order:', error);
      await fetchData();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pageCategories.findIndex((category) => category.id === active.id);
    const newIndex = pageCategories.findIndex((category) => category.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    handleReorder(arrayMove(pageCategories, oldIndex, newIndex));
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
          store_page: getCreatePage(),
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

  const fetchPickerProducts = React.useCallback(
    async (search: string, page: number, append: boolean) => {
      setPickerLoading(true);
      try {
        const params = new URLSearchParams({
          pageSize: '100',
          page: String(page),
          status: 'active',
          sortBy: 'display_name',
          sortOrder: 'asc',
        });

        if (productSourceFilter === 'private') {
          params.set('listing_type', 'private_listing');
        } else if (productSourceFilter === 'lightspeed') {
          params.set('stock', 'in-stock');
          params.set('source', 'lightspeed');
        } else if (productSourceFilter === 'uber') {
          params.set('stock', 'in-stock');
        } else {
          params.set('stock', 'in-stock');
        }

        if (search.trim()) {
          params.set('search', search.trim());
        }

        const response = await fetch(`/api/products?${params.toString()}`);
        if (!response.ok) return;

        const data = await response.json();
        let batch: any[] = data.products || [];

        if (productSourceFilter === 'uber') {
          batch = batch.filter((product) => product.uber_delivery_enabled === true);
        }

        setPickerProducts((prev) => (append ? [...prev, ...batch] : batch));
        setPickerPage(page);
        setPickerHasMore(page < (data.pagination?.totalPages ?? 1));
        setPickerTotal(data.pagination?.total ?? batch.length);
      } catch (error) {
        console.error('Error fetching picker products:', error);
      } finally {
        setPickerLoading(false);
      }
    },
    [productSourceFilter],
  );

  const pickerOpen = isAddDialogOpen || isEditDialogOpen;

  React.useEffect(() => {
    if (!isEditDialogOpen || !editingCategory) {
      setCarouselMemberProducts([]);
      setCarouselMembersLoading(false);
      return;
    }

    const ids = formData.productIds;
    if (ids.length === 0) {
      setCarouselMemberProducts([]);
      setCarouselMembersLoading(false);
      return;
    }

    let cancelled = false;

    const loadMembers = async () => {
      setCarouselMembersLoading(true);
      try {
        const fetched: CarouselProductPreview[] = [];
        const chunkSize = 100;

        for (let index = 0; index < ids.length; index += chunkSize) {
          const chunk = ids.slice(index, index + chunkSize);
          const params = new URLSearchParams({
            ids: chunk.join(","),
            pageSize: String(chunk.length),
            page: "1",
            status: "all",
            sortBy: "display_name",
            sortOrder: "asc",
          });

          const response = await fetch(`/api/products?${params.toString()}`);
          if (!response.ok) continue;

          const data = await response.json();
          fetched.push(...(data.products || []));
        }

        if (cancelled) return;

        const byId = new Map(fetched.map((product) => [product.id, product]));
        setCarouselMemberProducts(
          ids.map((id) => byId.get(id)).filter(Boolean) as CarouselProductPreview[],
        );
      } catch (error) {
        console.error("Error loading carousel products:", error);
        if (!cancelled) setCarouselMemberProducts([]);
      } finally {
        if (!cancelled) setCarouselMembersLoading(false);
      }
    };

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [isEditDialogOpen, editingCategory?.id, formData.productIds]);

  React.useEffect(() => {
    if (!pickerOpen) {
      setPickerProducts([]);
      setPickerPage(1);
      setPickerHasMore(false);
      setPickerTotal(0);
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchPickerProducts(productSearch, 1, false);
    }, productSearch.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [pickerOpen, productSearch, productSourceFilter, fetchPickerProducts]);

  const filteredProducts = pickerProducts;
  const visibleProductIds = React.useMemo(
    () => filteredProducts.map((product) => product.id),
    [filteredProducts],
  );
  const allVisibleSelected =
    visibleProductIds.length > 0 &&
    visibleProductIds.every((id) => formData.productIds.includes(id));
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

  const loadMorePickerProducts = () => {
    if (pickerLoading || !pickerHasMore) return;
    void fetchPickerProducts(productSearch, pickerPage + 1, true);
  };

  React.useEffect(() => {
    if (!createRequest) return;

    createPageRef.current = createRequest.storePage;

    switch (createRequest.action) {
      case "scan":
        void handleScanLightspeed();
        break;
      case "brand":
        void handleAddBrandCarousel();
        break;
      case "uber":
        void handleAddUberCarousel();
        break;
      case "custom":
        handleAddCustom();
        break;
    }
  }, [createRequest?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
    );
  }

  return (
    <>
      {pageCategories.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-white py-12 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-600">
            {activePage === "bikes" ? "No Bikes page carousels yet" : "No Products page carousels yet"}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Use New in the top right to scan Lightspeed or add a carousel
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-xs text-gray-500">
            Drag rows to reorder. Order applies to the {createPageLabel(activePage).toLowerCase()}.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={pageCategories.map((category) => category.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-gray-100 overflow-hidden rounded-md border border-gray-200 bg-white">
                {pageCategories.map((category) => (
                  <SortableCarouselCard
                    key={category.id}
                    category={category}
                    onEdit={() => handleEdit(category)}
                    onDelete={() => {
                      pendingDeleteIdRef.current = category.id;
                      setDeleteConfirmId(category.id);
                    }}
                    onRefresh={
                      category.source === "lightspeed"
                        ? () => handleRefreshCategoryProducts(category)
                        : undefined
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
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
              Select Lightspeed groups to add as carousels on your {createPageLabel(getCreatePage())}. Products are assigned automatically.
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
              Create a custom carousel on your {createPageLabel(getCreatePage())} and select products to include.
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
                    { key: 'all', label: 'All' },
                    { key: 'lightspeed', label: 'Lightspeed' },
                    { key: 'private', label: 'Private' },
                    { key: 'uber', label: 'Uber' },
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
                  {pickerLoading && filteredProducts.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading products...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {productSourceFilter === 'private'
                        ? 'No private listings yet. Add secondhand items via your Listings page.'
                        : productSourceFilter === 'uber'
                          ? 'No Uber-enabled products yet. Turn on Uber delivery for products in the Uber settings page.'
                        : productSearch.trim()
                          ? 'No products match your search.'
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
                      {pickerHasMore ? (
                        <div className="pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={loadMorePickerProducts}
                            disabled={pickerLoading}
                          >
                            {pickerLoading ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              `Load more (${filteredProducts.length} of ${pickerTotal})`
                            )}
                          </Button>
                        </div>
                      ) : filteredProducts.length > 0 ? (
                        <p className="pt-2 text-center text-xs text-muted-foreground">
                          Showing {filteredProducts.length} of {pickerTotal} products
                        </p>
                      ) : null}
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
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) resetLogoSearch();
        }}
      >
        <DialogContent className={EDIT_CAROUSEL_DIALOG_CLASS}>
          <DialogHeader className="shrink-0 space-y-1 px-6 pt-6 pb-2">
            <DialogTitle>Edit carousel</DialogTitle>
            <DialogDescription>
              Update carousel settings{editingCategoryLive ? ` for ${editingCategoryLive.name}` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-4">
            <div className="flex flex-col gap-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Show on</Label>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-full w-fit">
                  {(["products", "bikes"] as StoreCarouselPage[]).map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, storePage: page }))}
                      className={cn(
                        "px-2.5 py-1.5 text-xs font-medium rounded-full transition-colors",
                        formData.storePage === page
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70",
                      )}
                    >
                      {page === "bikes" ? "Bikes page" : "Products page"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Carousel size</Label>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-full w-fit">
                  {(
                    [
                      { value: "featured", label: "Featured" },
                      { value: "normal", label: "Normal" },
                      { value: "compact", label: "Compact" },
                    ] as { value: CarouselSize; label: string }[]
                  ).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, carouselSize: value }))}
                      className={cn(
                        "px-2.5 py-1.5 text-xs font-medium rounded-full transition-colors",
                        formData.carouselSize === value
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {editingCategoryLive && editingCategoryLive.source !== "uber" && (
                <div className="space-y-2">
                  <Label>Carousel logo</Label>
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                      {uploadingLogoId === editingCategoryLive.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      ) : editingCategoryLive.logo_url ? (
                        <img
                          src={editingCategoryLive.logo_url}
                          alt=""
                          className="h-full w-full object-contain p-0.5"
                        />
                      ) : (
                        <ImagePlus className="h-4 w-4 text-gray-300" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleLogoClick(editingCategoryLive.id)}
                        disabled={uploadingLogoId === editingCategoryLive.id}
                      >
                        {editingCategoryLive.logo_url ? "Replace" : "Upload"}
                      </Button>
                      {editingCategoryLive.logo_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveLogo(editingCategoryLive.id)}
                          disabled={uploadingLogoId === editingCategoryLive.id}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border border-gray-200 bg-white p-3">
                    <p className="text-xs font-medium text-gray-700">Search for a logo</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Find logos via Serper, then click one to add it
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={logoSearchQuery}
                        onChange={(e) => setLogoSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleLogoSearch();
                          }
                        }}
                        placeholder={
                          formData.name.trim()
                            ? `${formData.name.trim()} logo`
                            : "e.g. Helmets logo"
                        }
                        className="h-9 flex-1 rounded-full bg-white text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleLogoSearch()}
                        disabled={
                          logoSearching ||
                          logoImportingUrl !== null ||
                          uploadingLogoId === editingCategoryLive.id
                        }
                        className="h-9 shrink-0 rounded-full"
                      >
                        {logoSearching ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Searching…
                          </>
                        ) : (
                          <>
                            <Search className="h-4 w-4" />
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
                              disabled={Boolean(logoImportingUrl || uploadingLogoId)}
                              onClick={() => void handleSelectSerperLogo(result)}
                              className={cn(
                                "overflow-hidden rounded-md border bg-white text-left transition-colors",
                                isImporting
                                  ? "border-gray-900 ring-1 ring-gray-900"
                                  : "border-gray-200 hover:border-gray-400",
                                (logoImportingUrl || uploadingLogoId) &&
                                  !isImporting &&
                                  "opacity-50",
                              )}
                            >
                              <div className="relative flex aspect-square items-center justify-center bg-gray-50 p-2">
                                <Image
                                  src={result.thumbnailUrl || result.url}
                                  alt={result.title || "Logo result"}
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
              )}

              {(editingCategoryLive?.logo_url || editingCategoryLive?.source === "uber") && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="hide-carousel-title"
                    checked={formData.hideTitle}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, hideTitle: checked === true }))
                    }
                  />
                  <Label htmlFor="hide-carousel-title" className="font-normal">
                    Hide carousel title on storefront
                  </Label>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-carousel-name">Carousel name *</Label>
              <Input
                id="edit-carousel-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
              {editingCategoryLive?.source === "lightspeed" &&
              editingCategoryLive.lightspeed_category_name ? (
                <p className="text-xs text-gray-500">
                  Lightspeed category: {editingCategoryLive.lightspeed_category_name}
                </p>
              ) : null}
            </div>

            {editingCategoryLive ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>
                    Products in carousel ({formData.productIds.length})
                  </Label>
                  {carouselProductsSubtitle(editingCategoryLive) ? (
                    <p className="text-xs text-gray-500">
                      {carouselProductsSubtitle(editingCategoryLive)}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-md border border-gray-200 bg-white">
                  <div className="max-h-52 overflow-y-auto p-2">
                    {carouselMembersLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading carousel products...
                      </div>
                    ) : formData.productIds.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No products in this carousel yet.
                      </p>
                    ) : carouselMemberProducts.length === 0 ? (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {formData.productIds.length} product
                        {formData.productIds.length === 1 ? "" : "s"} assigned — details could
                        not be loaded.
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        {carouselMemberProducts.map((product) => (
                          <CarouselProductRow
                            key={product.id}
                            product={product}
                            trailing={
                              editingCategoryLive.source === "custom" ||
                              editingCategoryLive.source === "lightspeed" ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 shrink-0 text-gray-400 hover:text-gray-700"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleProduct(product.id);
                                  }}
                                  aria-label={`Remove ${product.display_name || product.description || "product"} from carousel`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : null
                            }
                          />
                        ))}
                        {formData.productIds.length > carouselMemberProducts.length ? (
                          <p className="px-2 pt-1 text-xs text-muted-foreground">
                            + {formData.productIds.length - carouselMemberProducts.length} more
                            not shown
                          </p>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {editingCategoryLive &&
            (editingCategoryLive.source === "custom" ||
              editingCategoryLive.source === "lightspeed") ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Add or remove products</Label>
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
              <div className="space-y-2">
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
                    { key: 'all', label: 'All' },
                    { key: 'lightspeed', label: 'Lightspeed' },
                    { key: 'private', label: 'Private' },
                    { key: 'uber', label: 'Uber' },
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
              <div className="rounded-md border border-border">
                <div className="p-2">
                  {pickerLoading && filteredProducts.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading products...
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      {productSourceFilter === 'private'
                        ? 'No private listings yet. Add secondhand items via your Listings page.'
                        : productSourceFilter === 'uber'
                          ? 'No Uber-enabled products yet. Turn on Uber delivery for products in the Uber settings page.'
                        : productSearch.trim()
                          ? 'No products match your search.'
                        : 'No products found'}
                    </p>
                  ) : (
                    <div className="space-y-0.5">
                      {filteredProducts.map((product) => (
                        <CarouselProductRow
                          key={product.id}
                          product={product}
                          onClick={() => toggleProduct(product.id)}
                          trailing={
                            <Checkbox
                              checked={formData.productIds.includes(product.id)}
                              onCheckedChange={() => toggleProduct(product.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          }
                        />
                      ))}
                      {pickerHasMore ? (
                        <div className="pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={loadMorePickerProducts}
                            disabled={pickerLoading}
                          >
                            {pickerLoading ? (
                              <>
                                <Loader2 className="size-4 animate-spin" />
                                Loading...
                              </>
                            ) : (
                              `Load more (${filteredProducts.length} of ${pickerTotal})`
                            )}
                          </Button>
                        </div>
                      ) : filteredProducts.length > 0 ? (
                        <p className="pt-2 text-center text-xs text-muted-foreground">
                          Showing {filteredProducts.length} of {pickerTotal} products
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </div>
            ) : null}
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
              Choose a brand — the carousel will automatically show all in-stock products from that brand on your {createPageLabel(getCreatePage())}.
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
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmId(null);
            pendingDeleteIdRef.current = null;
          }
        }}
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
              onClick={() => {
                const id = pendingDeleteIdRef.current ?? deleteConfirmId;
                if (id) void handleDelete(id);
              }}
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
