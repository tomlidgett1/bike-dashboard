"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Image as ImageIcon,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Sparkles,
  CheckCircle2,
  XCircle,
  Star,
  MoreHorizontal,
  PackageX,
  Package,
  Tag,
  Trash2,
  Wand2,
  X,
  Pencil,
  Plus,
  Layers,
  SlidersHorizontal,
  ChevronDown,
  Delivery,
} from "@/components/layout/app-sidebar/dashboard-icons";
import Image from "next/image";
import NextDynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { BikeIcon, BICYCLE_PRODUCT_ICON } from "@/components/ui/bike-icon";
import { Checkbox } from "@/components/ui/checkbox";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { useSellModal } from "@/components/providers/sell-modal-provider";
import {
  formatLightspeedCategory,
  isLightspeedProduct,
} from "@/lib/products/catalog-helpers";
import {
  StatusBadge,
  type StatusTone,
} from "@/components/dashboard";
import type { MarketplaceReadiness } from "@/lib/marketplace/product-readiness";
import { BULK_OPTIMISE_STORAGE_KEY } from "@/lib/optimize/bulk-optimise-session";
import { resolveLivePrice } from "@/lib/marketplace/pricing";
import { ProductBrandCell } from "@/components/products/product-brand-cell";
import { ProductCategoryCell } from "@/components/products/product-category-cell";
import { ProductVariantCell } from "@/components/products/product-variant-cell";
import {
  FloatingCard,
  FloatingCardPage,
  FloatingCardPageBody,
  FloatingCardPageHeader,
  FloatingCardPageTitleRow,
} from "@/components/layout/floating-card-page";

// Dialog (lazy — avoids SSR issues)
const Dialog = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.Dialog), { ssr: false });
const DialogContent = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.DialogContent), { ssr: false });
const DialogDescription = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.DialogDescription), { ssr: false });
const DialogHeader = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.DialogHeader), { ssr: false });
const DialogTitle = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.DialogTitle), { ssr: false });
const ImageGallery = NextDynamic(() => import("@/components/products/image-gallery").then((m) => m.ImageGallery), { ssr: false });
const ProductBikeSpecsSheet = NextDynamic(
  () => import("@/components/products/product-bike-specs-sheet").then((m) => m.ProductBikeSpecsSheet),
  { ssr: false }
);
const EditProductPanel = NextDynamic(
  () => import("@/components/products/edit-product-panel").then((m) => m.EditProductPanel),
  { ssr: false }
);
interface Product {
  id: string;
  lightspeed_item_id: string | null;
  system_sku: string | null;
  custom_sku: string | null;
  description: string;
  category_name: string | null;
  full_category_path: string | null;
  lightspeed_category_id: string | null;
  marketplace_category: string | null;
  marketplace_subcategory: string | null;
  marketplace_level_3_category: string | null;
  manufacturer_name: string | null;
  price: number;
  default_cost: number;
  qoh: number;
  sellable: number;
  reorder_point: number;
  model_year: string | null;
  primary_image_url: string | null;
  resolved_image_url: string | null;
  canonical_product_id: string | null;
  last_synced_at: string;
  is_active: boolean;
  listing_source: string | null;
  listing_status: string | null;
  listing_type: string | null;
  marketplace_readiness?: MarketplaceReadiness;
  is_bicycle?: boolean;
  bike_specs?: unknown;
  display_name?: string | null;
  variant_group_id?: string | null;
  variant_master_title?: string | null;
  variant_hidden_from_grid?: boolean;
  variant_is_master?: boolean | null;
  variant_option_label?: string | null;
  variant_sibling_count?: number | null;
  variant_group_title?: string | null;
  discount_percent?: number | null;
  discount_active?: boolean | null;
  discount_ends_at?: string | null;
  sale_price?: number | null;
}

interface DiscoveredImage {
  id: string;
  url: string;
  is_primary: boolean;
  approval_status: 'pending' | 'approved' | 'rejected';
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ProductStats {
  total: number;
  live: number;
  needsOptimisation: number;
  onSale: number;
  lowStock: number;
  needsImages: number;
  lightspeed?: number;
  manual?: number;
  variantGrouped?: number;
  variantPendingReview?: number;
}

// ── Row helpers ──────────────────────────────────────────────────────────────

function hasImage(p: Product) {
  return !!(p.resolved_image_url || p.primary_image_url);
}

function deriveStatus(p: Product): { label: string; tone: StatusTone } {
  if (p.marketplace_readiness) {
    if (p.marketplace_readiness.isLive) {
      return { label: "Live", tone: "success" };
    }
    const primary = p.marketplace_readiness.blockers[0];
    if (primary?.id === "no_approved_image") {
      return { label: "Needs optimisation", tone: "warning" };
    }
    if (primary?.id === "inactive") {
      return { label: "Hidden", tone: "neutral" };
    }
    if (primary?.id === "out_of_stock") {
      return { label: "Out of stock", tone: "warning" };
    }
    if (primary?.id === "listing_status") {
      return { label: primary.label, tone: "neutral" };
    }
    return { label: "Not live", tone: "warning" };
  }

  if (!p.is_active) return { label: "Hidden", tone: "neutral" };
  if (!hasImage(p)) return { label: "Needs optimisation", tone: "warning" };
  if (p.listing_status === "draft") return { label: "Draft", tone: "neutral" };
  return { label: "Live", tone: "success" };
}

function isExternal(url: string | null | undefined) {
  if (!url) return false;
  return !url.includes("res.cloudinary.com") && !url.includes("supabase.co");
}

function isCloudinaryUrl(url: string | null | undefined) {
  return !!url && url.includes("res.cloudinary.com");
}

function ProductThumb({ product }: { product: Product }) {
  const src = product.resolved_image_url || product.primary_image_url;

  if (src) {
    return (
      <div className="size-8 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
        <Image
          src={src}
          alt={product.description}
          width={32}
          height={32}
          className="size-full object-cover"
          loading="lazy"
          sizes="32px"
          unoptimized={isCloudinaryUrl(src) || isExternal(src)}
        />
      </div>
    );
  }

  return (
    <div
      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground"
      title="No image — use Optimise or Manage images from the row menu"
    >
      <ImageOff className="size-3.5" />
    </div>
  );
}

function SortButton({
  label,
  column,
  sortBy,
  sortOrder,
  onSort,
  align = "left",
}: {
  label: string;
  column: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
  onSort: (c: string) => void;
  align?: "left" | "right";
}) {
  const active = sortBy === column;
  const Icon = !active ? ArrowUpDown : sortOrder === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      onClick={() => onSort(column)}
      className={cn(
        "-mx-0.5 inline-flex items-center gap-0.5 rounded-md px-0.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground",
        align === "right" && "ml-auto flex-row-reverse"
      )}
    >
      {label}
      <Icon className={cn("size-3", active ? "opacity-100" : "opacity-40")} />
    </button>
  );
}

function formatProductCurrency(value: number | null | undefined) {
  if (!value) return "—";
  return value.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  });
}

function formatSource(product: Product) {
  if (isLightspeedProduct(product)) return "Catalogue";
  if (product.listing_source === "online_catalog") return "Online";
  if (product.listing_source === "manual") return "Listing";
  return "Listing";
}

function marketplaceStatusLabel(label: string) {
  if (label === "Needs optimisation") return "Optimise";
  return label;
}

function marginPercent(product: Product) {
  if (!product.price || !product.default_cost) return null;
  return Math.round(((product.price - product.default_cost) / product.price) * 100);
}

function productColumnClassName(columnId: string) {
  switch (columnId) {
    case "select":
      return "w-8";
    case "edit":
      return "w-8";
    case "marketplace":
      return "w-[76px]";
    case "variants":
      return "w-[68px]";
    case "product":
      return "w-auto min-w-0";
    case "brand":
      return "w-[84px]";
    case "category":
      return "w-[96px]";
    case "source":
      return "w-[64px]";
    case "price":
      return "w-[72px] text-right";
    case "stock":
      return "w-[64px] text-right";
    case "image":
      return "w-[52px]";
    case "bike":
      return "w-9";
    case "visible":
      return "w-11 text-center";
    case "actions":
      return "w-8 text-right";
    default:
      return "w-[72px]";
  }
}

function MiniLabel({
  children,
  muted = false,
  title,
}: {
  children: React.ReactNode;
  muted?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center gap-0.5 rounded-md border border-border bg-white px-1 text-[10px] font-medium",
        muted ? "text-muted-foreground" : "text-foreground"
      )}
    >
      {children}
    </span>
  );
}


export default function ProductsPage() {
  const router = useRouter();
  const { openSellModal } = useSellModal();
  const [products, setProducts] = React.useState<Product[]>([]);
  const [stats, setStats] = React.useState<ProductStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pagination, setPagination] = React.useState<PaginationInfo>({
    page: 1,
    pageSize: 100,
    total: 0,
    totalPages: 0,
  });
  const [categories, setCategories] = React.useState<string[]>([]);
  const [brands, setBrands] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('');
  const [brandFilter, setBrandFilter] = React.useState<string>('');
  const [stockFilter, setStockFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [imageFilter, setImageFilter] = React.useState<string>('all');
  const [sourceFilter, setSourceFilter] = React.useState<string>('all');
  const [saleFilter, setSaleFilter] = React.useState<string>('all');
  const [needsOptimisation, setNeedsOptimisation] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<string>('created_at');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteMode, setDeleteMode] = React.useState<"selected" | "page" | "all">("selected");
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [editModalOpen, setEditModalOpen] = React.useState(false);
  const [editProductId, setEditProductId] = React.useState<string | null>(null);

  const openEditModal = React.useCallback((id?: string | null) => {
    setEditProductId(id ?? null);
    setEditModalOpen(true);
  }, []);
  const [imageManageProduct, setImageManageProduct] = React.useState<Product | null>(null);
  const [bikeSpecsProduct, setBikeSpecsProduct] = React.useState<Product | null>(null);
  const [bikeSpecsSheetOpen, setBikeSpecsSheetOpen] = React.useState(false);

  // Image discovery state
  const [discoveryModalOpen, setDiscoveryModalOpen] = React.useState(false);
  const [discoveringProduct, setDiscoveringProduct] = React.useState<Product | null>(null);
  const [discoveredImages, setDiscoveredImages] = React.useState<DiscoveredImage[]>([]);
  const [discovering, setDiscovering] = React.useState(false);

  // Refs to access current values without re-renders
  const paginationRef = React.useRef(pagination);
  const sortByRef = React.useRef(sortBy);
  const sortOrderRef = React.useRef(sortOrder);
  const filterOptionsLoadedRef = React.useRef(false);
  const tableViewportRef = React.useRef<HTMLDivElement | null>(null);
  const tableScrollFrameRef = React.useRef<number | null>(null);
  const [tableViewport, setTableViewport] = React.useState({ scrollTop: 0, height: 640 });

  React.useEffect(() => { paginationRef.current = pagination; }, [pagination]);
  React.useEffect(() => { sortByRef.current = sortBy; }, [sortBy]);
  React.useEffect(() => { sortOrderRef.current = sortOrder; }, [sortOrder]);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchStats = React.useCallback(async () => {
    try {
      const res = await fetch('/api/products/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      }
    } catch (error) {
      console.error('Error fetching product stats:', error);
    }
  }, []);

  // Fetch products. Each call cancels the previous in-flight request and stale
  // responses are discarded, so a slow earlier query can never overwrite the
  // results of a newer search/filter.
  const fetchSeqRef = React.useRef(0);
  const fetchAbortRef = React.useRef<AbortController | null>(null);

  const fetchProducts = React.useCallback(async (page: number = 1, isInitialLoad: boolean = false) => {
    const seq = ++fetchSeqRef.current;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    if (isInitialLoad) setLoading(true);

    try {
      const includeFilterOptions = isInitialLoad || !filterOptionsLoadedRef.current;
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pagination.pageSize.toString(),
        search: debouncedSearch,
        category: categoryFilter,
        brand: brandFilter,
        stock: stockFilter,
        status: statusFilter,
        image: imageFilter,
        source: sourceFilter,
        sale: saleFilter,
        readiness: needsOptimisation ? 'needs-optimisation' : 'all',
        sortBy: sortBy,
        sortOrder: sortOrder,
        includeFilters: includeFilterOptions ? 'true' : 'false',
      });

      const response = await fetch(`/api/products?${params}`, { signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data?.error === 'string' ? data.error : 'Failed to fetch products',
        );
      }
      if (seq !== fetchSeqRef.current) return; // stale response

      setProducts(data.products || []);
      setPagination(data.pagination);
      if (Array.isArray(data.categories)) {
        setCategories(data.categories);
        filterOptionsLoadedRef.current = true;
      }
      if (Array.isArray(data.brands)) {
        setBrands(data.brands);
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Error fetching products:', error);
    } finally {
      if (seq === fetchSeqRef.current) {
        if (isInitialLoad) setLoading(false);
      }
    }
  }, [pagination.pageSize, debouncedSearch, categoryFilter, brandFilter, stockFilter, statusFilter, imageFilter, sourceFilter, saleFilter, needsOptimisation, sortBy, sortOrder]);

  // Initial + filter-change fetch
  const initialLoadRef = React.useRef(true);
  React.useEffect(() => {
    fetchProducts(1, initialLoadRef.current);
    initialLoadRef.current = false;
  }, [debouncedSearch, categoryFilter, brandFilter, stockFilter, statusFilter, imageFilter, sourceFilter, saleFilter, needsOptimisation, sortBy, sortOrder, pagination.pageSize, fetchProducts]);

  // Load stats once on mount
  React.useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-backfill brand/category names from Lightspeed if any are missing
  const backfillRan = React.useRef(false);
  React.useEffect(() => {
    if (backfillRan.current || products.length === 0) return;
    if (products.some(p => !p.category_name || !p.manufacturer_name)) {
      backfillRan.current = true;
      fetch('/api/lightspeed/backfill-manufacturer-names', { method: 'POST' })
        .then(() => fetchProducts(pagination.page))
        .catch(() => {});
    }
  }, [products, fetchProducts, pagination.page]);

  const handlePageSizeChange = React.useCallback((newPageSize: string) => {
    setPagination(prev => ({ ...prev, pageSize: parseInt(newPageSize), page: 1 }));
  }, []);

  const handleSort = React.useCallback((column: string) => {
    if (sortByRef.current === column) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  }, []);

  const handleRefreshList = React.useCallback(() => {
    fetchProducts(paginationRef.current.page);
    fetchStats();
  }, [fetchProducts, fetchStats]);

  const handlePageChange = React.useCallback((newPage: number) => {
    setSelected(new Set());
    fetchProducts(newPage);
  }, [fetchProducts]);

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    try {
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_active: !currentStatus } : p));
      const response = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(errorBody?.error || 'Failed to update product status');
      }
      fetchProducts(paginationRef.current.page);
      fetchStats();
    } catch (error) {
      console.error('Error toggling product status:', error);
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_active: currentStatus } : p));
    }
  };

  const openBikeSpecsSheet = (product: Product) => {
    setBikeSpecsProduct(product);
    setBikeSpecsSheetOpen(true);
  };

  const handleToggleBicycle = async (productId: string, currentValue: boolean) => {
    const nextValue = !currentValue;
    const product = products.find((p) => p.id === productId);
    try {
      setProducts(prev =>
        prev.map(p => (p.id === productId ? { ...p, is_bicycle: nextValue } : p))
      );
      const response = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_bicycle: nextValue }),
      });
      if (!response.ok) throw new Error("Failed to update bicycle flag");
      if (nextValue && product) {
        openBikeSpecsSheet({ ...product, is_bicycle: true });
      }
    } catch (error) {
      console.error("Error toggling bicycle flag:", error);
      setProducts(prev =>
        prev.map(p => (p.id === productId ? { ...p, is_bicycle: currentValue } : p))
      );
    }
  };

  const handleBikeSpecsUpdate = (
    productId: string,
    updates: { is_bicycle?: boolean; bike_specs?: unknown }
  ) => {
    setProducts(prev =>
      prev.map(p => (p.id === productId ? { ...p, ...updates } : p))
    );
    setBikeSpecsProduct(prev =>
      prev?.id === productId ? { ...prev, ...updates } : prev
    );
  };

  const handleBrandUpdated = React.useCallback((productId: string, brand: string) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, manufacturer_name: brand } : p)),
    );
    setBrands((prev) => {
      const trimmed = brand.trim();
      if (!trimmed || prev.includes(trimmed)) return prev;
      return [...prev, trimmed].sort((a, b) => a.localeCompare(b));
    });
  }, []);

  const handleCategoryUpdated = React.useCallback(
    (
      productId: string,
      update: {
        categoryId: string;
        categoryName: string;
        fullCategoryPath: string;
        categoryLabel: string;
      },
    ) => {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                lightspeed_category_id: update.categoryId,
                category_name: update.categoryName,
                full_category_path: update.fullCategoryPath,
              }
            : p,
        ),
      );
      setCategories((prev) => {
        const name = update.categoryName.trim();
        if (!name || prev.includes(name)) return prev;
        return [...prev, name].sort((a, b) => a.localeCompare(b));
      });
    },
    [],
  );

  const handleBulkActive = async (active: boolean) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setProducts(prev => prev.map(p => selected.has(p.id) ? { ...p, is_active: active } : p));
    try {
      await Promise.all(ids.map(id => fetch(`/api/products/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      })));
    } catch (error) {
      console.error('Error in bulk update:', error);
    }
    setSelected(new Set());
    fetchProducts(paginationRef.current.page);
    fetchStats();
  };

  const openDeleteDialog = (mode: "selected" | "page" | "all") => {
    setDeleteMode(mode);
    setDeleteDialogOpen(true);
  };

  const getDeleteCount = () => {
    if (deleteMode === "all") return pagination.total;
    if (deleteMode === "page") return products.length;
    return selected.size;
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      if (deleteMode === "all") {
        const response = await fetch("/api/products/delete-all", { method: "DELETE" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Failed to delete products");
      } else {
        const productIds =
          deleteMode === "page" ? products.map((p) => p.id) : [...selected];
        if (productIds.length === 0) return;

        const response = await fetch("/api/products/bulk-delete", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds, hardDelete: true }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "Failed to delete products");
      }

      setSelected(new Set());
      setDeleteDialogOpen(false);
      fetchProducts(1);
      fetchStats();
    } catch (error) {
      console.error("Error deleting products:", error);
      alert(error instanceof Error ? error.message : "Failed to delete products");
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle image placeholder click - trigger AI discovery
  const handleDiscoverImages = async (product: Product) => {
    if (!product.canonical_product_id) {
      alert('This product needs to be matched to the canonical catalog first.');
      return;
    }

    setDiscoveringProduct(product);
    setDiscoveryModalOpen(true);
    setDiscovering(true);
    setDiscoveredImages([]);

    try {
      const cleanedName = product.description.trim();
      const searchQuery = `cycling ${cleanedName}`;

      const response = await fetch('/api/admin/images/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId: product.canonical_product_id, customSearchQuery: searchQuery }),
      });

      if (!response.ok) throw new Error('Discovery failed');
      await response.json();

      let pollCount = 0;
      const maxPolls = 20;
      const pollInterval = setInterval(async () => {
        pollCount++;
        const { data, error } = await (await import('@/lib/supabase/client')).createClient()
          .from('product_images')
          .select('id, external_url, cloudinary_url, is_primary, approval_status')
          .eq('canonical_product_id', product.canonical_product_id)
          .eq('approval_status', 'pending')
          .order('created_at', { ascending: false });

        if (error) console.error('[DISCOVER] Polling error:', error);

        if (!error && data && data.length > 0) {
          const mappedImages = data.map(img => ({
            id: img.id,
            url: img.cloudinary_url || img.external_url || '',
            is_primary: img.is_primary || false,
            approval_status: img.approval_status as 'pending' | 'approved' | 'rejected'
          }));
          setDiscoveredImages(mappedImages);
          clearInterval(pollInterval);
          setDiscovering(false);
        } else if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setDiscovering(false);
          if (!data || data.length === 0) {
            alert('No images were found. Try a different product.');
            setDiscoveryModalOpen(false);
          }
        }
      }, 2000);
    } catch (error) {
      console.error('[DISCOVER] Error:', error);
      alert(`Failed to discover images: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setDiscovering(false);
      setDiscoveryModalOpen(false);
    }
  };

  const handleToggleImageApproval = async (imageId: string, currentStatus: DiscoveredImage["approval_status"]) => {
    const newStatus = currentStatus === 'pending' ? 'approved' : currentStatus === 'approved' ? 'rejected' : 'pending';
    setDiscoveredImages(prev => prev.map(img => img.id === imageId ? { ...img, approval_status: newStatus } : img));
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error } = await supabase.from('product_images').update({ approval_status: newStatus }).eq('id', imageId).select();
      if (error) throw error;
    } catch (error) {
      console.error('[APPROVE] Error updating image:', error);
      setDiscoveredImages(prev => prev.map(img => img.id === imageId ? { ...img, approval_status: currentStatus } : img));
    }
  };

  const handleSetPrimary = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!discoveringProduct?.canonical_product_id) return;
    setDiscoveredImages(prev => prev.map(img => ({ ...img, is_primary: img.id === imageId })));
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      await supabase.from('product_images').update({ is_primary: false }).eq('canonical_product_id', discoveringProduct.canonical_product_id);
      const { error } = await supabase.from('product_images').update({ is_primary: true }).eq('id', imageId).select();
      if (error) throw error;
    } catch (error) {
      console.error('[PRIMARY] Error setting primary:', error);
      alert('Failed to set primary image');
    }
  };

  const handleCompleteSelection = async () => {
    const approvedImages = discoveredImages.filter(img => img.approval_status === 'approved');
    const hasPrimary = approvedImages.some(img => img.is_primary);

    if (approvedImages.length === 0) { alert('Please approve at least one image'); return; }
    if (!hasPrimary) { alert('Please select a primary image (click the ⭐ star)'); return; }

    const nonApprovedIds = discoveredImages.filter(img => img.approval_status !== 'approved').map(img => img.id);
    if (nonApprovedIds.length > 0) {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        const { error } = await supabase.from('product_images').delete().in('id', nonApprovedIds).select();
        if (error) console.error('[COMPLETE] Error deleting rejected images:', error);
      } catch (error) {
        console.error('[COMPLETE] Exception deleting rejected images:', error);
      }
    }

    setDiscoveryModalOpen(false);
    setDiscoveredImages([]);
    setDiscoveringProduct(null);
    fetchProducts(pagination.page);
    fetchStats();
  };

  // Selection helpers
  const allChecked = products.length > 0 && products.every(p => selected.has(p.id));
  const someChecked = products.some(p => selected.has(p.id));
  const toggleAll = () => setSelected(() => allChecked ? new Set() : new Set(products.map(p => p.id)));
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const catalogFilterCount =
    (stockFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (imageFilter !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (saleFilter !== 'all' ? 1 : 0);

  const hasFilters =
    search !== '' ||
    categoryFilter !== '' ||
    brandFilter !== '' ||
    catalogFilterCount > 0 ||
    needsOptimisation;
  const clearCatalogFilters = () => {
    setStockFilter('all');
    setStatusFilter('all');
    setImageFilter('all');
    setSourceFilter('all');
    setSaleFilter('all');
  };
  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setBrandFilter('');
    clearCatalogFilters();
    setNeedsOptimisation(false);
  };

  const openBulkOptimise = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    try {
      sessionStorage.setItem(BULK_OPTIMISE_STORAGE_KEY, JSON.stringify(ids));
    } catch { /* storage unavailable */ }
    router.push('/products/optimise');
  };

  const totalCount = stats?.total ?? pagination.total;

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(pagination.page * pagination.pageSize, pagination.total);


  const productColumns: ColumnDef<Product>[] = [
      {
        id: "select",
        enableSorting: false,
        header: () => (
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={toggleAll}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => {
          const product = row.original;
          return (
            <Checkbox
              checked={selected.has(product.id)}
              onCheckedChange={() => toggleOne(product.id)}
              aria-label={`Select ${product.description}`}
            />
          );
        },
      },
      {
        id: "edit",
        enableSorting: false,
        header: () => <span className="sr-only">Edit</span>,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => openEditModal(row.original.id)}
            className="rounded-md text-muted-foreground"
            aria-label="Edit product"
          >
            <Pencil className="size-3" />
          </Button>
        ),
      },
      {
        id: "marketplace",
        accessorFn: (product) => deriveStatus(product).label,
        header: "Status",
        cell: ({ row }) => {
          const status = deriveStatus(row.original);
          return (
            <span className="block max-w-full truncate" title={status.label}>
              <StatusBadge
                label={marketplaceStatusLabel(status.label)}
                tone={status.tone}
                className="h-5 max-w-full truncate rounded-md px-1 text-[10px]"
              />
            </span>
          );
        },
      },
      {
        id: "variants",
        accessorFn: (product) => product.variant_group_id ?? "",
        header: "Var.",
        cell: ({ row }) => (
          <ProductVariantCell
            className="max-w-[64px]"
            summary={{
              variant_group_id: row.original.variant_group_id ?? null,
              variant_master_title: row.original.variant_master_title ?? null,
              variant_hidden_from_grid: row.original.variant_hidden_from_grid ?? false,
              variant_is_master: row.original.variant_is_master ?? null,
              variant_option_label: row.original.variant_option_label ?? null,
              variant_sibling_count: row.original.variant_sibling_count ?? null,
              variant_group_title: row.original.variant_group_title ?? null,
            }}
          />
        ),
      },
      {
        id: "product",
        accessorKey: "description",
        header: () => (
          <SortButton label="Product" column="description" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} />
        ),
        cell: ({ row }) => {
          const product = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <ProductThumb product={product} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/marketplace/product/${product.id}`}
                  className="block truncate text-left text-[12px] font-medium leading-tight text-foreground transition-colors hover:text-primary hover:underline"
                  title={product.display_name?.trim() ? `${product.display_name}\n${product.description}` : product.description}
                >
                  {product.display_name || product.description}
                </Link>
                <p
                  className="mt-0.5 truncate font-mono text-[10px] leading-tight text-muted-foreground"
                  title={product.custom_sku || product.system_sku || undefined}
                >
                  {product.custom_sku || product.system_sku || "No SKU"}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: "visible",
        accessorFn: (product) => Number(product.is_active),
        header: () => <span className="sr-only">Visible</span>,
        cell: ({ row }) => (
          <div className="flex justify-center">
            <Switch
              size="sm"
              checked={row.original.is_active}
              onCheckedChange={() => handleToggleActive(row.original.id, row.original.is_active)}
              aria-label={row.original.is_active ? "Hide product" : "Show product"}
            />
          </div>
        ),
      },
      {
        id: "bike",
        accessorFn: (product) => Number(!!product.is_bicycle),
        header: () => <span className="sr-only">Bicycle</span>,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => handleToggleBicycle(row.original.id, !!row.original.is_bicycle)}
            className={cn(
              "mx-auto flex size-7 items-center justify-center rounded-md border border-border bg-white transition-colors hover:bg-muted",
              row.original.is_bicycle ? "text-foreground" : "text-muted-foreground",
            )}
            aria-label={row.original.is_bicycle ? "Mark as not a bike" : "Mark as bike"}
            title={row.original.is_bicycle ? "Bicycle" : "Not a bicycle"}
          >
            <BikeIcon iconName={BICYCLE_PRODUCT_ICON} size={14} className="size-3.5 shrink-0" />
          </button>
        ),
      },
      {
        id: "brand",
        accessorFn: (product) => product.manufacturer_name || "",
        header: "Brand",
        cell: ({ row }) => (
          <div className="min-w-0">
            <ProductBrandCell
              productId={row.original.id}
              brandName={row.original.manufacturer_name}
              onUpdated={(brand) => handleBrandUpdated(row.original.id, brand)}
            />
          </div>
        ),
      },
      {
        id: "category",
        accessorFn: (product) => product.marketplace_category || product.category_name || "",
        header: "Category",
        cell: ({ row }) => {
          const product = row.original;
          const marketplaceCategory = [
            product.marketplace_category,
            product.marketplace_subcategory,
            product.marketplace_level_3_category,
          ].filter(Boolean).join(" / ");
          const lightspeedCategory = formatLightspeedCategory(product);
          const displayLabel = marketplaceCategory || lightspeedCategory || "—";
          return (
            <div className="min-w-0">
              <ProductCategoryCell
                productId={product.id}
                displayLabel={displayLabel}
                lightspeedCategoryId={product.lightspeed_category_id}
                onUpdated={(update) => handleCategoryUpdated(product.id, update)}
              />
            </div>
          );
        },
      },
      {
        id: "source",
        accessorFn: formatSource,
        header: "Source",
        cell: ({ row }) => (
          <span
            className="block truncate text-[10px] leading-tight text-muted-foreground"
            title={formatSource(row.original)}
          >
            {formatSource(row.original)}
          </span>
        ),
      },
      {
        id: "price",
        accessorKey: "price",
        header: () => (
          <SortButton label="Price" column="price" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
        ),
        cell: ({ row }) => {
          const product = row.original;
          const live = resolveLivePrice(product);
          const margin = marginPercent(product);
          const costLine = product.default_cost
            ? `${formatProductCurrency(product.default_cost)} cost${margin != null ? ` · ${margin}% margin` : ""}`
            : undefined;
          return (
            <div className="text-right">
              {live.onSale ? (
                <div className="flex flex-col items-end gap-0.5">
                  <div className="flex items-center justify-end gap-1">
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-800">
                      Sale
                    </span>
                    <p
                      className="truncate font-mono text-[11px] font-semibold tabular-nums text-foreground"
                      title={costLine}
                    >
                      {formatProductCurrency(live.price)}
                    </p>
                  </div>
                  <p className="truncate font-mono text-[10px] tabular-nums text-muted-foreground line-through">
                    {formatProductCurrency(live.originalPrice)}
                  </p>
                </div>
              ) : (
                <p
                  className="truncate font-mono text-[11px] font-semibold tabular-nums text-foreground"
                  title={costLine}
                >
                  {formatProductCurrency(product.price)}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: "stock",
        accessorKey: "qoh",
        header: () => (
          <SortButton label="Stock" column="qoh" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" />
        ),
        cell: ({ row }) => {
          const product = row.original;
          const lowStock = product.qoh > 0 && product.reorder_point > 0 && product.qoh <= product.reorder_point;
          const stockTitle = `${product.sellable.toLocaleString()} sellable · reorder ${product.reorder_point.toLocaleString()}`;
          return (
            <div className="text-right">
              <p
                className={cn(
                  "truncate font-mono text-[11px] font-semibold tabular-nums text-foreground",
                  lowStock && "text-amber-700",
                )}
                title={stockTitle}
              >
                {product.qoh <= 0 ? "Out" : product.qoh.toLocaleString()}
              </p>
            </div>
          );
        },
      },
      {
        id: "image",
        accessorFn: (product) => Number(hasImage(product)),
        header: () => <span className="sr-only">Photo</span>,
        cell: ({ row }) => (
          <MiniLabel muted={!hasImage(row.original)} title={hasImage(row.original) ? "Photo ready" : "Missing photo"}>
            <span className={cn("size-1.5 rounded-full", hasImage(row.original) ? "bg-emerald-500" : "bg-muted-foreground/40")} />
            {hasImage(row.original) ? "OK" : "—"}
          </MiniLabel>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: "",
        cell: ({ row }) => {
          const product = row.original;
          return (
            <div className="flex justify-end gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" className="rounded-md text-muted-foreground">
                    <MoreHorizontal className="size-3.5" />
                    <span className="sr-only">More actions</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => openEditModal(product.id)}>
                    <Pencil className="size-4" />
                    Edit product
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleToggleBicycle(product.id, !!product.is_bicycle)}>
                    <BikeIcon
                      iconName={BICYCLE_PRODUCT_ICON}
                      size={16}
                      className="size-4 shrink-0"
                    />
                    {product.is_bicycle ? "Remove bicycle flag" : "Mark as bicycle"}
                  </DropdownMenuItem>
                  {product.is_bicycle ? (
                    <DropdownMenuItem onClick={() => openBikeSpecsSheet(product)}>
                      <BikeIcon
                        iconName={BICYCLE_PRODUCT_ICON}
                        size={16}
                        className="size-4 shrink-0"
                      />
                      Bicycle specifications
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={!product.canonical_product_id} onClick={() => setImageManageProduct(product)}>
                    <ImageIcon className="size-4" />
                    Manage images
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!product.canonical_product_id} onClick={() => handleDiscoverImages(product)}>
                    <Sparkles className="size-4" />
                    Discover images
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ];

  // TanStack Table owns the dense grid structure; server query params still own catalogue sorting/filtering.
  const productTable = useReactTable({
    data: products,
    columns: productColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const tableColSpan = productTable.getAllLeafColumns().length;
  const tableRows = productTable.getRowModel().rows;
  const rowHeight = 48;
  const overscan = 10;
  const virtualStart = Math.max(0, Math.floor(tableViewport.scrollTop / rowHeight) - overscan);
  const virtualEnd = Math.min(
    tableRows.length,
    Math.ceil((tableViewport.scrollTop + tableViewport.height) / rowHeight) + overscan
  );
  const virtualRows = tableRows.slice(virtualStart, virtualEnd);
  const topSpacerHeight = virtualStart * rowHeight;
  const bottomSpacerHeight = Math.max(0, (tableRows.length - virtualEnd) * rowHeight);

  const syncTableViewport = React.useCallback(() => {
    const element = tableViewportRef.current;
    if (!element) return;
    setTableViewport({
      scrollTop: element.scrollTop,
      height: element.clientHeight || 640,
    });
  }, []);

  const handleTableScroll = React.useCallback(() => {
    if (tableScrollFrameRef.current != null) return;
    tableScrollFrameRef.current = window.requestAnimationFrame(() => {
      tableScrollFrameRef.current = null;
      syncTableViewport();
    });
  }, [syncTableViewport]);

  React.useEffect(() => {
    syncTableViewport();
    const element = tableViewportRef.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(syncTableViewport);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
      if (tableScrollFrameRef.current != null) {
        window.cancelAnimationFrame(tableScrollFrameRef.current);
        tableScrollFrameRef.current = null;
      }
    };
  }, [products.length, pagination.pageSize, syncTableViewport]);

  const categoryLabel = categoryFilter || "All categories";
  const brandLabel =
    brandFilter === "__none__" ? "No brand" : brandFilter || "All brands";

  const filterTriggerClassName =
    "h-9 shrink-0 rounded-md border-input bg-white px-2.5 font-normal shadow-none";

  return (
    <FloatingCardPage>
      <FloatingCardPageHeader>
        <FloatingCardPageTitleRow
          title="Products"
          icon={Package}
          actions={
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="group rounded-md">
                    Tools
                    <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-md">
                  <DropdownMenuItem asChild>
                    <Link href="/optimize/variants">
                      <Layers className="size-4" />
                      Review variants
                      {stats?.variantPendingReview ? (
                        <span className="ml-auto rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-800">
                          {stats.variantPendingReview.toLocaleString()}
                        </span>
                      ) : null}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings/uber">
                      <Delivery className="size-4" />
                      Uber Direct
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/optimize">
                      <Wand2 className="size-4" />
                      Product Optimise
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button size="sm" className="rounded-md" onClick={openSellModal}>
                <Plus className="size-4" />
                Add product
              </Button>
            </>
          }
        />
      </FloatingCardPageHeader>

      <FloatingCardPageBody>
        <FloatingCard>
          <div className="flex flex-col gap-2 rounded-t-xl border-b border-border/60 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center md:px-5">
            <div className="relative min-w-0 flex-1 sm:max-w-[360px] lg:max-w-[420px] xl:max-w-[460px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, SKU, brand, category, year, source or status..."
                className="h-9 w-full rounded-md border border-input bg-white pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={cn(filterTriggerClassName, "w-[190px] justify-between gap-1.5")}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Layers className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{categoryLabel}</span>
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto rounded-md">
                  <DropdownMenuRadioGroup
                    value={categoryFilter || "all"}
                    onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}
                  >
                    <DropdownMenuRadioItem value="all" className="gap-2">
                      <Layers className="size-3.5 shrink-0 text-muted-foreground" />
                      All categories
                    </DropdownMenuRadioItem>
                    {categories.map((c) => (
                      <DropdownMenuRadioItem key={c} value={c} className="gap-2 truncate">
                        <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{c}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className={cn(filterTriggerClassName, "w-[160px] justify-between gap-1.5")}>
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Tag className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{brandLabel}</span>
                    </span>
                    <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto rounded-md">
                  <DropdownMenuRadioGroup
                    value={brandFilter || "all"}
                    onValueChange={(v) => setBrandFilter(v === "all" ? "" : v)}
                  >
                    <DropdownMenuRadioItem value="all">All brands</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="__none__">No brand</DropdownMenuRadioItem>
                    {brands.map((b) => (
                      <DropdownMenuRadioItem key={b} value={b} className="truncate">
                        {b}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(filterTriggerClassName, "w-fit gap-1.5")}
                  >
                    <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                    Filters
                    {catalogFilterCount > 0 ? (
                      <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-800">
                        {catalogFilterCount}
                      </span>
                    ) : null}
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 rounded-md">
                  <DropdownMenuLabel>Visibility</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                    <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="active">Active</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="inactive">Hidden</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Stock</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={stockFilter} onValueChange={setStockFilter}>
                    <DropdownMenuRadioItem value="all">Any stock</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="in-stock">In stock</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="low-stock">Low stock</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Images</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={imageFilter} onValueChange={setImageFilter}>
                    <DropdownMenuRadioItem value="all">Any images</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="approved">Approved photos</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="needs-images">Needs photos</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Source</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={sourceFilter} onValueChange={setSourceFilter}>
                    <DropdownMenuRadioItem value="all">All sources</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="lightspeed">Catalogue (Lightspeed)</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="manual">Marketplace listings</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Pricing</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={saleFilter} onValueChange={setSaleFilter}>
                    <DropdownMenuRadioItem value="all">Any pricing</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="on-sale">
                      <span className="flex items-center gap-2">
                        On sale
                        {stats?.onSale ? (
                          <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-800">
                            {stats.onSale.toLocaleString()}
                          </span>
                        ) : null}
                      </span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                  {catalogFilterCount > 0 ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={clearCatalogFilters}>Reset filters</DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-input bg-white px-3">
                <Switch
                  id="needs-optimisation-filter"
                  size="sm"
                  checked={needsOptimisation}
                  onCheckedChange={setNeedsOptimisation}
                />
                <Label htmlFor="needs-optimisation-filter" className="flex cursor-pointer items-center gap-1.5 text-sm font-normal whitespace-nowrap">
                  Needs optimisation
                  {stats != null ? (
                    <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-gray-800">
                      {stats.needsOptimisation.toLocaleString()}
                    </span>
                  ) : null}
                </Label>
              </div>

              {hasFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          <AnimatePresence>
            {selected.size > 0 ? (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
                className="overflow-hidden border-b border-border/60"
              >
                <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 md:px-5">
                  <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
                  <Button size="xs" onClick={openBulkOptimise}>
                    <Wand2 className="size-3.5" />
                    Optimise ({selected.size})
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => handleBulkActive(true)}>
                    <Eye className="size-3.5" />
                    Activate
                  </Button>
                  <Button variant="outline" size="xs" onClick={() => handleBulkActive(false)}>
                    <EyeOff className="size-3.5" />
                    Hide
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="text-destructive hover:text-destructive"
                    onClick={() => openDeleteDialog("selected")}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                  <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => setSelected(new Set())}>
                    Clear
                  </Button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div
            ref={tableViewportRef}
            onScroll={handleTableScroll}
            className="min-h-0 flex-1 overflow-auto"
          >
            <table className="w-full table-fixed border-collapse text-[12px]">
              <thead className="sticky top-0 z-20 bg-gray-50 shadow-[inset_0_-1px_0_0_hsl(var(--border)/0.6)]">
                {productTable.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-border/60">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className={cn(
                          productColumnClassName(header.column.id),
                          "overflow-hidden bg-gray-50 px-2 py-1.5 text-left align-middle text-[11px] font-medium text-muted-foreground"
                        )}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {loading ? (
                  <tr className="border-b border-border/50">
                    <td colSpan={tableColSpan} className="h-64 text-center">
                      <Loader2 className="mx-auto size-7 animate-spin text-muted-foreground" />
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr className="border-b border-border/50">
                    <td colSpan={tableColSpan} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <PackageX className="size-8" />
                        <p className="text-sm font-medium text-foreground">No products found</p>
                        <p className="text-sm">
                          {hasFilters ? "Try adjusting your filters" : "Sync your inventory from Lightspeed"}
                        </p>
                        {hasFilters && <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
                      </div>
                    </td>
                  </tr>
                ) : (
                  <>
                    {topSpacerHeight > 0 ? (
                      <tr aria-hidden="true">
                        <td colSpan={tableColSpan} style={{ height: topSpacerHeight, padding: 0 }} />
                      </tr>
                    ) : null}
                    {virtualRows.map((row) => {
                    const checked = selected.has(row.original.id);
                    const onSale = resolveLivePrice(row.original).onSale;
                    return (
                      <tr
                        key={row.id}
                        data-state={checked ? "selected" : undefined}
                        className={cn(
                          "group border-b border-border/50 transition-colors last:border-0 hover:bg-muted/20 data-[state=selected]:bg-muted/40",
                          onSale ? "bg-amber-50/60 hover:bg-amber-50" : "bg-white",
                        )}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className={cn(
                              productColumnClassName(cell.column.id),
                              "overflow-hidden px-2 py-1.5 align-middle text-muted-foreground"
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                    {bottomSpacerHeight > 0 ? (
                      <tr aria-hidden="true">
                        <td colSpan={tableColSpan} style={{ height: bottomSpacerHeight, padding: 0 }} />
                      </tr>
                    ) : null}
                  </>
                )}
              </tbody>
            </table>
          </div>

        <div className="shrink-0 border-t border-border/60 bg-white px-4 py-3 text-sm md:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">
              {pagination.total > 0 ? (
                <>Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of <span className="font-medium text-foreground">{pagination.total.toLocaleString()}</span> products</>
              ) : "No products"}
            </p>
            <div className="flex items-center gap-2">
              <span className="hidden text-muted-foreground sm:inline">Rows per page</span>
              <Select value={pagination.pageSize.toString()} onValueChange={handlePageSizeChange}>
                <SelectTrigger size="sm" className="w-[72px]"><SelectValue /></SelectTrigger>
                <SelectContent position="popper" align="start" className="w-[var(--radix-select-trigger-width)]">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="350">350</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon-sm" disabled={pagination.page <= 1 || loading} onClick={() => handlePageChange(pagination.page - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="px-2 text-muted-foreground">Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span>
                <Button variant="outline" size="icon-sm" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => handlePageChange(pagination.page + 1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
        </FloatingCard>
      </FloatingCardPageBody>

      {/* Manage images dialog (controlled) */}
      <Dialog open={!!imageManageProduct} onOpenChange={(open: boolean) => !open && setImageManageProduct(null)}>
        <DialogContent className="flex h-[80vh] w-[90vw] max-w-none flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Manage product images</DialogTitle>
            <DialogDescription className="line-clamp-2">{imageManageProduct?.description}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {imageManageProduct && (
              <ImageGallery productId={imageManageProduct.id} canonicalProductId={imageManageProduct.canonical_product_id || undefined} />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Discovery Modal */}
      <AnimatePresence>
        {discoveryModalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-black/50"
              onClick={() => !discovering && setDiscoveryModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number] }}
              className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl bg-card shadow-2xl md:inset-auto md:left-1/2 md:top-1/2 md:h-[80vh] md:w-[90vw] md:max-w-4xl md:-translate-x-1/2 md:-translate-y-1/2"
            >
              <div className="flex-shrink-0 border-b border-border px-6 py-4">
                <h2 className="text-lg font-semibold text-foreground">Discover images with AI</h2>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{discoveringProduct?.description}</p>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {discovering ? (
                  <div className="flex h-full flex-col items-center justify-center">
                    <Loader2 className="mb-4 size-12 animate-spin text-primary" />
                    <p className="mb-2 text-lg font-medium text-foreground">Discovering images…</p>
                    <p className="text-sm text-muted-foreground">This may take 15–25 seconds.</p>
                  </div>
                ) : discoveredImages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center">
                    <AlertCircle className="mb-4 size-12 text-muted-foreground" />
                    <p className="mb-2 text-lg font-medium text-foreground">No images found</p>
                    <p className="text-sm text-muted-foreground">Try a different product or check the product name.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <p className="text-sm font-medium text-foreground">Click images to approve/reject • Click ⭐ to set primary image</p>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      {discoveredImages.map((image) => (
                        <div key={image.id} className="relative">
                          <button
                            onClick={() => handleToggleImageApproval(image.id, image.approval_status)}
                            className={cn(
                              'group relative aspect-square w-full overflow-hidden rounded-lg transition-all hover:scale-105 hover:shadow-lg',
                              image.approval_status === 'approved' && 'ring-4 ring-emerald-500',
                              image.approval_status === 'pending' && 'ring-2 ring-border hover:ring-primary',
                              image.approval_status === 'rejected' && 'opacity-60 ring-4 ring-rose-500'
                            )}
                          >
                            <img src={image.url} alt="" className="size-full object-cover" />
                            <div className="absolute right-2 top-2">
                              {image.approval_status === 'approved' ? (
                                <CheckCircle2 className="size-6 rounded-full bg-white text-emerald-500 drop-shadow-lg" />
                              ) : image.approval_status === 'rejected' ? (
                                <XCircle className="size-6 rounded-full bg-white text-rose-500 drop-shadow-lg" />
                              ) : (
                                <div className="size-6 rounded-full border-2 border-border bg-background/80" />
                              )}
                            </div>
                          </button>
                          {image.approval_status === 'approved' && (
                            <button
                              onClick={(e) => handleSetPrimary(image.id, e)}
                              className={cn(
                                'absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full p-1.5 shadow-lg transition-all',
                                image.is_primary ? 'bg-primary hover:bg-primary/90' : 'border-2 border-border bg-background hover:bg-muted'
                              )}
                              title={image.is_primary ? 'Primary image' : 'Set as primary'}
                            >
                              <Star className={cn('size-4', image.is_primary ? 'fill-primary-foreground text-primary-foreground' : 'text-muted-foreground')} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {!discovering && discoveredImages.length > 0 && (
                <div className="flex flex-shrink-0 items-center justify-between border-t border-border px-6 py-4">
                  <div className="text-sm text-muted-foreground">
                    {discoveredImages.filter(img => img.approval_status === 'approved').length} approved · {discoveredImages.filter(img => img.approval_status === 'pending').length} pending · {discoveredImages.filter(img => img.approval_status === 'rejected').length} rejected
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" size="sm" onClick={() => setDiscoveryModalOpen(false)}>Cancel</Button>
                    <Button
                      size="sm"
                      onClick={handleCompleteSelection}
                      disabled={
                        discoveredImages.filter(img => img.approval_status === 'approved').length === 0 ||
                        !discoveredImages.some(img => img.is_primary && img.approval_status === 'approved')
                      }
                    >
                      <CheckCircle2 className="size-4" />
                      Save selection
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-md bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteMode === "all"
                ? "Delete entire catalogue?"
                : deleteMode === "page"
                  ? "Delete all products on this page?"
                  : "Delete selected products?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === "all"
                ? `This will permanently delete all ${pagination.total} products in your catalogue. This cannot be undone.`
                : `This will permanently delete ${getDeleteCount()} product${getDeleteCount() === 1 ? "" : "s"}. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete permanently"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ProductBikeSpecsSheet
        open={bikeSpecsSheetOpen}
        onOpenChange={setBikeSpecsSheetOpen}
        product={bikeSpecsProduct}
        onUpdate={handleBikeSpecsUpdate}
      />

      <EditProductPanel
        productId={editProductId}
        open={editModalOpen}
        onOpenChange={(isOpen) => {
          setEditModalOpen(isOpen);
          if (!isOpen) setEditProductId(null);
        }}
        onSaved={handleRefreshList}
      />
    </FloatingCardPage>
  );
}
