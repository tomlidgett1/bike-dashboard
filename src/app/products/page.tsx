"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  Package,
  Image as ImageIcon,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
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
  Plus,
  ListFilter,
  PackageX,
  TriangleAlert,
  X,
} from "lucide-react";
import Image from "next/image";
import NextDynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PageBody,
  PageContainer,
  PageHeader,
  StatCard,
  StatusBadge,
  type StatusTone,
} from "@/components/dashboard";
import type { MarketplaceReadiness } from "@/lib/marketplace/product-readiness";

// Dialog (lazy — avoids SSR issues)
const Dialog = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.Dialog), { ssr: false });
const DialogContent = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.DialogContent), { ssr: false });
const DialogDescription = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.DialogDescription), { ssr: false });
const DialogHeader = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.DialogHeader), { ssr: false });
const DialogTitle = NextDynamic(() => import("@/components/ui/dialog").then((m) => m.DialogTitle), { ssr: false });
const ImageGallery = NextDynamic(() => import("@/components/products/image-gallery").then((m) => m.ImageGallery), { ssr: false });

interface Product {
  id: string;
  lightspeed_item_id: string;
  system_sku: string | null;
  custom_sku: string | null;
  description: string;
  category_name: string | null;
  full_category_path: string | null;
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
  lowStock: number;
  needsImages: number;
}

// ── Row helpers ──────────────────────────────────────────────────────────────

function hasImage(p: Product) {
  return !!(p.resolved_image_url || p.primary_image_url);
}

function deriveStatus(p: Product): { label: string; tone: StatusTone } {
  if (!p.is_active) return { label: "Hidden", tone: "neutral" };
  if (!hasImage(p)) return { label: "Needs images", tone: "warning" };
  if (p.listing_status === "draft") return { label: "Draft", tone: "neutral" };
  return { label: "Live", tone: "success" };
}

function isExternal(url: string | null | undefined) {
  if (!url) return false;
  return !url.includes("res.cloudinary.com") && !url.includes("supabase.co");
}

function ProductThumb({ product, onDiscover }: { product: Product; onDiscover: (p: Product) => void }) {
  const src = product.resolved_image_url || product.primary_image_url;

  if (src) {
    return (
      <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
        <Image
          src={src}
          alt={product.description}
          width={40}
          height={40}
          className="size-full object-cover"
          unoptimized={isExternal(product.resolved_image_url) && isExternal(product.primary_image_url)}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onDiscover(product)}
      disabled={!product.canonical_product_id}
      title={product.canonical_product_id ? "Discover images with AI" : "Needs catalog match first"}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors",
        product.canonical_product_id && "hover:border-primary hover:text-primary"
      )}
    >
      <ImageOff className="size-4" />
    </button>
  );
}

function StockCell({ qoh, reorder }: { qoh: number; reorder: number }) {
  if (qoh <= 0) {
    return <span className="font-medium text-rose-600 dark:text-rose-400">Out of stock</span>;
  }
  if (qoh <= reorder) {
    return <span className="font-medium text-amber-600 dark:text-amber-400">{qoh} · Low</span>;
  }
  return (
    <span className="font-medium text-foreground">
      {qoh}
      <span className="ml-1 font-normal text-muted-foreground">in stock</span>
    </span>
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
        "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground",
        align === "right" && "ml-auto flex-row-reverse"
      )}
    >
      {label}
      <Icon className={cn("size-3", active ? "opacity-100" : "opacity-40")} />
    </button>
  );
}

export default function ProductsPage() {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [stats, setStats] = React.useState<ProductStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [pagination, setPagination] = React.useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [categories, setCategories] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const [categoryFilter, setCategoryFilter] = React.useState<string>('');
  const [stockFilter, setStockFilter] = React.useState<string>('all');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [sortBy, setSortBy] = React.useState<string>('created_at');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [imageManageProduct, setImageManageProduct] = React.useState<Product | null>(null);

  // Image discovery state
  const [discoveryModalOpen, setDiscoveryModalOpen] = React.useState(false);
  const [discoveringProduct, setDiscoveringProduct] = React.useState<Product | null>(null);
  const [discoveredImages, setDiscoveredImages] = React.useState<DiscoveredImage[]>([]);
  const [discovering, setDiscovering] = React.useState(false);

  // Refs to access current values without re-renders
  const paginationRef = React.useRef(pagination);
  const sortByRef = React.useRef(sortBy);
  const sortOrderRef = React.useRef(sortOrder);

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

  // Fetch products
  const fetchProducts = React.useCallback(async (page: number = 1, isInitialLoad: boolean = false) => {
    if (isInitialLoad) setLoading(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pagination.pageSize.toString(),
        search: debouncedSearch,
        category: categoryFilter,
        stock: stockFilter,
        status: statusFilter,
        sortBy: sortBy,
        sortOrder: sortOrder,
      });

      const response = await fetch(`/api/products?${params}`);
      if (!response.ok) throw new Error('Failed to fetch products');

      const data = await response.json();
      setProducts(data.products || []);
      setPagination(data.pagination);
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      if (isInitialLoad) setLoading(false);
      setRefreshing(false);
    }
  }, [pagination.pageSize, debouncedSearch, categoryFilter, stockFilter, statusFilter, sortBy, sortOrder]);

  // Initial + filter-change fetch
  React.useEffect(() => {
    fetchProducts(1, loading);
  }, [debouncedSearch, categoryFilter, stockFilter, statusFilter, sortBy, sortOrder, pagination.pageSize, fetchProducts, loading]);

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

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
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
      if (!response.ok) throw new Error('Failed to update product status');
      fetchProducts(paginationRef.current.page);
      fetchStats();
    } catch (error) {
      console.error('Error toggling product status:', error);
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, is_active: currentStatus } : p));
    }
  };

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

  const handleToggleImageApproval = async (imageId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'approved' : currentStatus === 'approved' ? 'rejected' : 'pending';
    setDiscoveredImages(prev => prev.map(img => img.id === imageId ? { ...img, approval_status: newStatus } : img));
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { error } = await supabase.from('product_images').update({ approval_status: newStatus }).eq('id', imageId).select();
      if (error) throw error;
    } catch (error) {
      console.error('[APPROVE] Error updating image:', error);
      setDiscoveredImages(prev => prev.map(img => img.id === imageId ? { ...img, approval_status: currentStatus as any } : img));
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

  const hasFilters = search !== '' || categoryFilter !== '' || stockFilter !== 'all' || statusFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setStockFilter('all');
    setStatusFilter('all');
  };

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Products"
        description="Your synced inventory from Lightspeed."
        actions={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            Sync
          </Button>
        }
      />

      <PageBody>
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Total products" value={(stats?.total ?? pagination.total).toLocaleString()} icon={Package} hint={`${categories.length} categories`} />
          <StatCard label="Live on marketplace" value={(stats?.live ?? 0).toLocaleString()} icon={Eye} hint={stats ? `${Math.round((stats.live / Math.max(stats.total, 1)) * 100)}% of catalogue` : undefined} />
          <StatCard label="Low stock" value={(stats?.lowStock ?? 0).toLocaleString()} icon={TriangleAlert} hint="at or below reorder point" />
          <StatCard label="Needs images" value={(stats?.needsImages ?? 0).toLocaleString()} icon={ImageOff} hint="hidden from marketplace" />
        </div>

        {/* Table card */}
        <Card className="gap-0 py-0">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 border-b border-border/60 p-4 lg:flex-row lg:items-center">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or SKU…"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
                <SelectTrigger size="sm" className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger size="sm" className="w-[130px]"><SelectValue placeholder="Stock" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stock</SelectItem>
                  <SelectItem value="in-stock">In stock</SelectItem>
                  <SelectItem value="low-stock">Low stock</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger size="sm" className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>

              {hasFilters ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="size-4" />
                  Clear
                </Button>
              ) : (
                <Button variant="outline" size="icon-sm" disabled>
                  <ListFilter className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Bulk bar */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 border-b border-border/60 bg-primary/5 px-4 py-2.5">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="xs" onClick={() => handleBulkActive(true)}>
                  <Eye className="size-3.5" />
                  Set active
                </Button>
                <Button variant="outline" size="xs" onClick={() => handleBulkActive(false)}>
                  <EyeOff className="size-3.5" />
                  Set inactive
                </Button>
              </div>
              <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead><SortButton label="Product" column="description" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
                  <TableHead className="hidden md:table-cell"><SortButton label="Category" column="category_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
                  <TableHead className="hidden lg:table-cell"><SortButton label="Brand" column="manufacturer_name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} /></TableHead>
                  <TableHead className="text-right"><SortButton label="Price" column="price" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" /></TableHead>
                  <TableHead className="text-right"><SortButton label="Stock" column="qoh" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSort} align="right" /></TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead className="w-10 pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="h-64 text-center">
                      <Loader2 className="mx-auto size-7 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : products.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="h-64 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <PackageX className="size-8" />
                        <p className="text-sm font-medium text-foreground">No products found</p>
                        <p className="text-sm">
                          {hasFilters ? "Try adjusting your filters" : "Sync your inventory from Lightspeed"}
                        </p>
                        {hasFilters && <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {products.map((product) => {
                      const status = deriveStatus(product);
                      const checked = selected.has(product.id);
                      return (
                        <motion.tr
                          key={product.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          data-state={checked ? "selected" : undefined}
                          className="group border-b border-border/50 transition-colors hover:bg-muted/40 data-[state=selected]:bg-muted/50"
                        >
                          <TableCell className="pl-4">
                            <Checkbox checked={checked} onCheckedChange={() => toggleOne(product.id)} aria-label={`Select ${product.description}`} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <ProductThumb product={product} onDiscover={handleDiscoverImages} />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{product.description}</p>
                                <p className="font-mono text-xs text-muted-foreground">{product.custom_sku || product.system_sku || "—"}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">{product.category_name || "—"}</TableCell>
                          <TableCell className="hidden text-muted-foreground lg:table-cell">{product.manufacturer_name || "—"}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">${product.price.toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums"><StockCell qoh={product.qoh} reorder={product.reorder_point} /></TableCell>
                          <TableCell><StatusBadge label={status.label} tone={status.tone} /></TableCell>
                          <TableCell className="pr-4">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
                                  <MoreHorizontal className="size-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem disabled={!product.canonical_product_id} onClick={() => setImageManageProduct(product)}>
                                  <ImageIcon className="size-4" />
                                  Manage images
                                </DropdownMenuItem>
                                <DropdownMenuItem disabled={!product.canonical_product_id} onClick={() => handleDiscoverImages(product)}>
                                  <Sparkles className="size-4" />
                                  Discover images
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleToggleActive(product.id, product.is_active)}>
                                  {product.is_active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                  {product.is_active ? "Set inactive" : "Set active"}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination footer */}
          <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-muted-foreground">
              {pagination.total > 0 ? (
                <>Showing <span className="font-medium text-foreground">{rangeStart}–{rangeEnd}</span> of <span className="font-medium text-foreground">{pagination.total.toLocaleString()}</span> products</>
              ) : "No products"}
            </p>
            <div className="flex items-center gap-2">
              <span className="hidden text-muted-foreground sm:inline">Rows per page</span>
              <Select value={pagination.pageSize.toString()} onValueChange={handlePageSizeChange}>
                <SelectTrigger size="sm" className="w-[72px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
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
        </Card>
      </PageBody>

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
    </PageContainer>
  );
}
