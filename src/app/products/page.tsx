"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Filter,
  Package,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  RefreshCw,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sparkles,
  CheckCircle2,
  XCircle,
  Star,
} from "lucide-react";
import { Header } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { cn } from "@/lib/utils";
import Image from "next/image";
import NextDynamic from "next/dynamic";

// Dynamically import Dialog components to avoid SSR issues
const Dialog = NextDynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.Dialog),
  { ssr: false }
);
const DialogContent = NextDynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogContent),
  { ssr: false }
);
const DialogDescription = NextDynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogDescription),
  { ssr: false }
);
const DialogHeader = NextDynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogHeader),
  { ssr: false }
);
const DialogTitle = NextDynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogTitle),
  { ssr: false }
);
const DialogTrigger = NextDynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogTrigger),
  { ssr: false }
);

// Dynamically import ImageGallery to avoid SSR issues
const ImageGallery = NextDynamic(
  () => import("@/components/products/image-gallery").then((mod) => mod.ImageGallery),
  { ssr: false }
);

interface Product {
  id: string;
  lightspeed_item_id: string;
  system_sku: string | null;
  custom_sku: string | null;
  description: string;
  category_name: string | null;
  full_category_path: string | null;
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

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number],
    },
  },
};

// Memoized Filters Bar Component
const FiltersBar = React.memo(({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  stockFilter,
  onStockFilterChange,
  statusFilter,
  onStatusFilterChange,
  categories,
  refreshing,
  onRefresh,
  productsCount,
  totalProducts,
  currentPage,
  totalPages
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  stockFilter: string;
  onStockFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  categories: string[];
  refreshing: boolean;
  onRefresh: () => void;
  productsCount: number;
  totalProducts: number;
  currentPage: number;
  totalPages: number;
}) => {
  return (
    <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-white dark:bg-gray-950">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-3"
      >
        <motion.div variants={itemVariants}>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search products by name or SKU..."
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 rounded-md h-9"
              />
            </div>

            {/* Category Filter */}
            <Select value={categoryFilter || "all"} onValueChange={(value) => onCategoryFilterChange(value === "all" ? "" : value)}>
              <SelectTrigger className="w-full sm:w-[180px] rounded-md h-9">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Stock Filter */}
            <Select value={stockFilter} onValueChange={onStockFilterChange}>
              <SelectTrigger className="w-full sm:w-[140px] rounded-md h-9">
                <SelectValue placeholder="All Stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stock</SelectItem>
                <SelectItem value="in-stock">In Stock</SelectItem>
                <SelectItem value="low-stock">Low Stock</SelectItem>
              </SelectContent>
            </Select>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="w-full sm:w-[140px] rounded-md h-9">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="inactive">Inactive Only</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh Button */}
            <Button
              variant="outline"
              size="icon"
              onClick={onRefresh}
              disabled={refreshing}
              className="rounded-md h-9 w-9"
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
          </div>
        </motion.div>

        {/* Results Info */}
        <motion.div variants={itemVariants}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {productsCount} of {totalProducts} products
            </span>
            {totalPages > 1 && (
              <span>
                Page {currentPage} of {totalPages}
              </span>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
});

FiltersBar.displayName = 'FiltersBar';

// Memoized Table Header Component
const ProductTableHeader = React.memo(({
  sortBy,
  sortOrder,
  onSort
}: {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  onSort: (column: string) => void;
}) => {
  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
  };

  return (
    <TableHeader className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm border-b border-border">
      <TableRow className="hover:bg-transparent">
        <TableHead className="h-10 px-6 font-semibold" style={{ maxWidth: '8cm' }}>
          <button
            onClick={() => onSort('description')}
            className="flex items-center gap-1.5 text-xs uppercase tracking-wider hover:text-foreground transition-colors"
          >
            Product
            <SortIcon column="description" />
          </button>
        </TableHead>
        <TableHead className="h-10 px-4 font-semibold">
          <button
            onClick={() => onSort('custom_sku')}
            className="flex items-center gap-1.5 text-xs uppercase tracking-wider hover:text-foreground transition-colors"
          >
            SKU
            <SortIcon column="custom_sku" />
          </button>
        </TableHead>
        <TableHead className="h-10 px-4 font-semibold">
          <button
            onClick={() => onSort('category_name')}
            className="flex items-center gap-1.5 text-xs uppercase tracking-wider hover:text-foreground transition-colors"
          >
            Category
            <SortIcon column="category_name" />
          </button>
        </TableHead>
        <TableHead className="h-10 px-4 text-right font-semibold">
          <button
            onClick={() => onSort('price')}
            className="flex items-center gap-1.5 ml-auto text-xs uppercase tracking-wider hover:text-foreground transition-colors"
          >
            Price
            <SortIcon column="price" />
          </button>
        </TableHead>
        <TableHead className="h-10 px-4 text-right font-semibold">
          <button
            onClick={() => onSort('default_cost')}
            className="flex items-center gap-1.5 ml-auto text-xs uppercase tracking-wider hover:text-foreground transition-colors"
          >
            Cost
            <SortIcon column="default_cost" />
          </button>
        </TableHead>
        <TableHead className="h-10 px-4 text-right font-semibold">
          <button
            onClick={() => onSort('qoh')}
            className="flex items-center gap-1.5 ml-auto text-xs uppercase tracking-wider hover:text-foreground transition-colors"
          >
            Stock
            <SortIcon column="qoh" />
          </button>
        </TableHead>
        <TableHead className="h-10 px-4 font-semibold">
          <span className="text-xs uppercase tracking-wider">
            Source
          </span>
        </TableHead>
        <TableHead className="h-10 px-4 text-center font-semibold">
          <button
            onClick={() => onSort('is_active')}
            className="flex items-center gap-1.5 mx-auto text-xs uppercase tracking-wider hover:text-foreground transition-colors"
          >
            Status
            <SortIcon column="is_active" />
          </button>
        </TableHead>
        <TableHead className="h-10 px-6 text-center font-semibold">
          <span className="text-xs uppercase tracking-wider">
            Actions
          </span>
        </TableHead>
      </TableRow>
    </TableHeader>
  );
});

ProductTableHeader.displayName = 'ProductTableHeader';

// Memoized Pagination Component
const PaginationFooter = React.memo(({ 
  pagination, 
  loading,
  onPageSizeChange,
  onPageChange 
}: {
  pagination: PaginationInfo;
  loading: boolean;
  onPageSizeChange: (value: string) => void;
  onPageChange: (page: number) => void;
}) => {
  return (
    <div className="flex-shrink-0 px-6 py-3 border-t border-border bg-white dark:bg-gray-950">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Show:</span>
          <Select 
            value={pagination.pageSize.toString()} 
            onValueChange={onPageSizeChange}
          >
            <SelectTrigger className="w-[70px] h-8 rounded-md text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">per page</span>
        </div>

        {/* Page Navigation */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(1)}
            disabled={pagination.page === 1 || loading}
            className="rounded-md h-8 w-8"
          >
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(pagination.page - 1)}
            disabled={pagination.page === 1 || loading}
            className="rounded-md h-8 w-8"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          
          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-1">
              {[...Array(Math.min(5, pagination.totalPages))].map((_, idx) => {
                let pageNum: number;
                
                if (pagination.totalPages <= 5) {
                  pageNum = idx + 1;
                } else if (pagination.page <= 3) {
                  pageNum = idx + 1;
                } else if (pagination.page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + idx;
                } else {
                  pageNum = pagination.page - 2 + idx;
                }
                
                return (
                  <Button
                    key={pageNum}
                    variant={pagination.page === pageNum ? "default" : "outline"}
                    size="icon"
                    onClick={() => onPageChange(pageNum)}
                    disabled={loading}
                    className={cn(
                      "rounded-md h-8 w-8 text-xs font-medium",
                      pagination.page === pageNum
                        ? "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                        : "hover:bg-gray-100 dark:hover:bg-gray-800"
                    )}
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
          )}
          
          {pagination.totalPages > 1 && (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages || loading}
                className="rounded-md h-8 w-8"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => onPageChange(pagination.totalPages)}
                disabled={pagination.page === pagination.totalPages || loading}
                className="rounded-md h-8 w-8"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>

        {/* Page Info */}
        <div className="text-xs text-muted-foreground tabular-nums">
          {(pagination.page - 1) * pagination.pageSize + 1}-
          {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
          {pagination.total}
        </div>
      </div>
    </div>
  );
});

PaginationFooter.displayName = 'PaginationFooter';

export default function ProductsPage() {
  const [products, setProducts] = React.useState<Product[]>([]);
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
  const [sortBy, setSortBy] = React.useState<string>('last_synced_at');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('desc');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  
  // Image discovery state
  const [discoveryModalOpen, setDiscoveryModalOpen] = React.useState(false);
  const [discoveringProduct, setDiscoveringProduct] = React.useState<Product | null>(null);
  const [discoveredImages, setDiscoveredImages] = React.useState<DiscoveredImage[]>([]);
  const [discovering, setDiscovering] = React.useState(false);
  
  // Use refs to access current values without causing re-renders
  const paginationRef = React.useRef(pagination);
  const sortByRef = React.useRef(sortBy);
  const sortOrderRef = React.useRef(sortOrder);
  
  React.useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);
  
  React.useEffect(() => {
    sortByRef.current = sortBy;
  }, [sortBy]);
  
  React.useEffect(() => {
    sortOrderRef.current = sortOrder;
  }, [sortOrder]);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch products
  const fetchProducts = React.useCallback(async (page: number = 1, isInitialLoad: boolean = false) => {
    // Only show full loading state on initial load
    if (isInitialLoad) {
      setLoading(true);
    }
    
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
      
      if (!response.ok) {
        throw new Error('Failed to fetch products');
      }

      const data = await response.json();
      setProducts(data.products || []);
      setPagination(data.pagination);
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, [pagination.pageSize, debouncedSearch, categoryFilter, stockFilter, statusFilter, sortBy, sortOrder]);

  // Initial fetch
  React.useEffect(() => {
    fetchProducts(1, loading);
  }, [debouncedSearch, categoryFilter, stockFilter, statusFilter, sortBy, sortOrder, pagination.pageSize, fetchProducts, loading]);

  const handlePageSizeChange = React.useCallback((newPageSize: string) => {
    setPagination(prev => ({ ...prev, pageSize: parseInt(newPageSize), page: 1 }));
  }, []);

  const handleSort = React.useCallback((column: string) => {
    if (sortByRef.current === column) {
      // Toggle sort order
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortBy(column);
      setSortOrder('asc');
    }
  }, []);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchProducts(paginationRef.current.page);
  }, [fetchProducts]);

  const handlePageChange = React.useCallback((newPage: number) => {
    fetchProducts(newPage);
  }, [fetchProducts]);

  // Memoized filter setters
  const handleSearchChange = React.useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleCategoryFilterChange = React.useCallback((value: string) => {
    setCategoryFilter(value);
  }, []);

  const handleStockFilterChange = React.useCallback((value: string) => {
    setStockFilter(value);
  }, []);

  const handleStatusFilterChange = React.useCallback((value: string) => {
    setStatusFilter(value);
  }, []);

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    try {
      // Optimistic update
      setProducts(prev => 
        prev.map(p => 
          p.id === productId ? { ...p, is_active: !currentStatus } : p
        )
      );

      const response = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update product status');
      }

      // If status filter is set to active/inactive only, refresh to remove from view
      if (statusFilter !== 'all') {
        fetchProducts(pagination.page);
      }
    } catch (error) {
      console.error('Error toggling product status:', error);
      // Revert optimistic update on error
      setProducts(prev => 
        prev.map(p => 
          p.id === productId ? { ...p, is_active: currentStatus } : p
        )
      );
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
      // Clean product name and prepend "cycling"
      const cleanedName = product.description.trim();
      const searchQuery = `cycling ${cleanedName}`;

      console.log(`[DISCOVER] Starting discovery for: ${searchQuery}`);

      const response = await fetch('/api/admin/images/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          canonicalProductId: product.canonical_product_id,
          customSearchQuery: searchQuery
        }),
      });

      if (!response.ok) {
        throw new Error('Discovery failed');
      }

      const result = await response.json();
      console.log('[DISCOVER] Result:', result);
      console.log('[DISCOVER] Canonical Product ID:', product.canonical_product_id);

      // Poll for images
      let pollCount = 0;
      const maxPolls = 20;
      const pollInterval = setInterval(async () => {
        pollCount++;
        console.log(`[DISCOVER] Polling ${pollCount}/${maxPolls} for canonical_product_id:`, product.canonical_product_id);

        const { data, error } = await (await import('@/lib/supabase/client')).createClient()
          .from('product_images')
          .select('id, external_url, cloudinary_url, card_url, is_primary, approval_status')
          .eq('canonical_product_id', product.canonical_product_id)
          .eq('approval_status', 'pending')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[DISCOVER] Polling error:', error);
        }

        if (!error && data && data.length > 0) {
          console.log(`[DISCOVER] ✅ Found ${data.length} pending images:`, data);
          const mappedImages = data.map(img => ({
            id: img.id,
            url: img.card_url || img.cloudinary_url || img.external_url || '',
            is_primary: img.is_primary || false,
            approval_status: img.approval_status as 'pending' | 'approved' | 'rejected'
          }));
          console.log('[DISCOVER] Mapped images:', mappedImages);
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

  // Handle image approval/rejection
  const handleToggleImageApproval = async (imageId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'pending' ? 'approved' : currentStatus === 'approved' ? 'rejected' : 'pending';
    
    console.log(`[APPROVE] Changing image ${imageId} from ${currentStatus} to ${newStatus}`);
    
    // Optimistic update
    setDiscoveredImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, approval_status: newStatus } : img
    ));

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      
      const { error, data } = await supabase
        .from('product_images')
        .update({ approval_status: newStatus })
        .eq('id', imageId)
        .select();

      if (error) throw error;
      console.log(`[APPROVE] ✅ Updated image ${imageId} to ${newStatus}`, data);
    } catch (error) {
      console.error('[APPROVE] ❌ Error updating image:', error);
      // Revert on error
      setDiscoveredImages(prev => prev.map(img => 
        img.id === imageId ? { ...img, approval_status: currentStatus as any } : img
      ));
    }
  };

  // Handle setting primary image
  const handleSetPrimary = async (imageId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!discoveringProduct?.canonical_product_id) return;

    console.log(`[PRIMARY] Setting image ${imageId} as primary for canonical product ${discoveringProduct.canonical_product_id}`);

    // Optimistic update
    setDiscoveredImages(prev => prev.map(img => ({
      ...img,
      is_primary: img.id === imageId
    })));

    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      
      // Unset all primaries
      console.log('[PRIMARY] Unsetting all primaries for canonical product');
      await supabase
        .from('product_images')
        .update({ is_primary: false })
        .eq('canonical_product_id', discoveringProduct.canonical_product_id);

      // Set this one as primary
      console.log('[PRIMARY] Setting new primary image');
      const { error, data } = await supabase
        .from('product_images')
        .update({ is_primary: true })
        .eq('id', imageId)
        .select();

      if (error) throw error;
      console.log('[PRIMARY] ✅ Successfully set primary image', data);
    } catch (error) {
      console.error('[PRIMARY] ❌ Error setting primary:', error);
      alert('Failed to set primary image');
    }
  };

  // Handle completing image selection
  const handleCompleteSelection = async () => {
    const approvedImages = discoveredImages.filter(img => img.approval_status === 'approved');
    const hasPrimary = approvedImages.some(img => img.is_primary);

    console.log('[COMPLETE] Starting image selection completion');
    console.log('[COMPLETE] Approved images:', approvedImages.length);
    console.log('[COMPLETE] Has primary:', hasPrimary);

    if (approvedImages.length === 0) {
      alert('Please approve at least one image');
      return;
    }

    if (!hasPrimary) {
      alert('Please select a primary image (click the ⭐ star)');
      return;
    }

    // Delete non-approved images
    const nonApprovedIds = discoveredImages
      .filter(img => img.approval_status !== 'approved')
      .map(img => img.id);

    console.log('[COMPLETE] Will delete', nonApprovedIds.length, 'non-approved images');

    if (nonApprovedIds.length > 0) {
      try {
        const { createClient } = await import('@/lib/supabase/client');
        const supabase = createClient();
        
        const { error, data } = await supabase
          .from('product_images')
          .delete()
          .in('id', nonApprovedIds)
          .select();

        if (error) {
          console.error('[COMPLETE] ❌ Error deleting rejected images:', error);
        } else {
          console.log('[COMPLETE] ✅ Deleted', data?.length || 0, 'rejected images');
        }
      } catch (error) {
        console.error('[COMPLETE] ❌ Exception deleting rejected images:', error);
      }
    }

    console.log('[COMPLETE] ✅ Image selection complete! Refreshing products...');
    console.log('[COMPLETE] Canonical Product ID:', discoveringProduct?.canonical_product_id);
    console.log('[COMPLETE] Trigger should have updated cached_image_url for all products with this canonical_product_id');

    // Close modal and refresh products
    setDiscoveryModalOpen(false);
    setDiscoveredImages([]);
    setDiscoveringProduct(null);
    fetchProducts(pagination.page);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        title="Products"
        description="Manage your synced inventory from Lightspeed"
      />

      {/* Full-width container with no padding */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters Bar - with horizontal padding only */}
        <FiltersBar
          search={search}
          onSearchChange={handleSearchChange}
          categoryFilter={categoryFilter}
          onCategoryFilterChange={handleCategoryFilterChange}
          stockFilter={stockFilter}
          onStockFilterChange={handleStockFilterChange}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          categories={categories}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          productsCount={products.length}
          totalProducts={pagination.total}
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
        />

        {/* Table Container - Full width, scrollable */}
        <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
          {loading && !refreshing ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No products found</h3>
                <p className="text-sm text-muted-foreground">
                  Try syncing your inventory from Lightspeed
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <ProductTableHeader
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSort={handleSort}
              />
              <TableBody>
                <AnimatePresence mode="popLayout">
                  {products.map((product) => (
                    <motion.tr
                      key={product.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="group border-b border-border/50 hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors"
                    >
                      {/* Product Column */}
                      <TableCell className="py-2.5 px-6" style={{ maxWidth: '8cm' }}>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => product.resolved_image_url || product.primary_image_url ? null : handleDiscoverImages(product)}
                            disabled={!!product.resolved_image_url || !!product.primary_image_url}
                            className={cn(
                              "flex-shrink-0 h-10 w-10 rounded-md overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700 transition-all",
                              (!product.resolved_image_url && !product.primary_image_url) && "cursor-pointer hover:ring-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950",
                              (product.resolved_image_url || product.primary_image_url) && "bg-gray-100 dark:bg-gray-800"
                            )}
                            title={(!product.resolved_image_url && !product.primary_image_url) ? "Click to discover images with AI" : ""}
                          >
                            {product.resolved_image_url || product.primary_image_url ? (
                              <Image
                                src={product.resolved_image_url || product.primary_image_url || ''}
                                alt={product.description}
                                width={40}
                                height={40}
                                className="object-cover w-full h-full"
                                unoptimized={
                                  // Use unoptimized for external URLs not from our configured domains
                                  !product.resolved_image_url?.includes('res.cloudinary.com') &&
                                  !product.resolved_image_url?.includes('supabase.co') &&
                                  !product.primary_image_url?.includes('res.cloudinary.com') &&
                                  !product.primary_image_url?.includes('supabase.co')
                                }
                                onError={(e) => {
                                  // Fallback to placeholder on error
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  target.parentElement!.innerHTML = '<div class="h-full w-full flex items-center justify-center"><svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>';
                                }}
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center group-hover:text-blue-500">
                                <Sparkles className="h-5 w-5 text-muted-foreground transition-colors" />
                              </div>
                            )}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">
                              {product.description}
                            </p>
                            {product.canonical_product_id && product.resolved_image_url && (
                              <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5">
                                <span className="inline-block w-1 h-1 rounded-full bg-green-600 dark:bg-green-400"></span>
                                Image uploaded
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* SKU Column */}
                      <TableCell className="py-2.5 px-4">
                        <span className="text-sm font-mono text-foreground/80">
                          {product.custom_sku || product.system_sku || '-'}
                        </span>
                      </TableCell>

                      {/* Category Column */}
                      <TableCell className="py-2.5 px-4">
                        {product.category_name ? (
                          <Badge variant="secondary" className="rounded-md text-xs font-medium">
                            {product.category_name}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>

                      {/* Price Column */}
                      <TableCell className="py-2.5 px-4 text-right">
                        <span className="text-sm font-semibold text-foreground">
                          ${product.price.toFixed(2)}
                        </span>
                      </TableCell>

                      {/* Cost Column */}
                      <TableCell className="py-2.5 px-4 text-right">
                        <span className="text-sm text-muted-foreground">
                          ${product.default_cost.toFixed(2)}
                        </span>
                      </TableCell>

                        {/* Stock Column */}
                        <TableCell className="py-2.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <span
                              className={cn(
                                "inline-block w-1.5 h-1.5 rounded-full",
                                product.qoh > product.reorder_point
                                  ? "bg-green-500"
                                  : product.qoh > 0
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                              )}
                            />
                            <span
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                product.qoh > product.reorder_point
                                  ? "text-green-600 dark:text-green-400"
                                  : product.qoh > 0
                                  ? "text-yellow-600 dark:text-yellow-400"
                                  : "text-red-600 dark:text-red-400"
                              )}
                            >
                              {product.qoh}
                            </span>
                          </div>
                        </TableCell>

                        {/* Source Column */}
                        <TableCell className="py-2.5 px-4">
                          {product.listing_source === "lightspeed" ? (
                            <div className="flex items-center gap-1.5">
                              <div className="flex-shrink-0 h-4 w-4 rounded bg-white dark:bg-gray-800 ring-1 ring-gray-200 dark:ring-gray-700 overflow-hidden">
                                <Image
                                  src="/ls.png"
                                  alt="Lightspeed"
                                  width={16}
                                  height={16}
                                  className="object-contain w-full h-full"
                                />
                              </div>
                              <span className="text-xs text-muted-foreground font-medium">
                                Lightspeed
                              </span>
                            </div>
                          ) : product.listing_source === "manual" ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground font-medium">
                                Manual
                              </span>
                            </div>
                          ) : null}
                        </TableCell>

                        {/* Status Column */}
                        <TableCell className="py-2.5 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={product.is_active}
                            onCheckedChange={() => handleToggleActive(product.id, product.is_active)}
                            className="data-[state=checked]:bg-green-600"
                          />
                          <span className="text-xs text-muted-foreground font-medium min-w-[50px]">
                            {product.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </TableCell>

                      {/* Actions Column */}
                      <TableCell className="py-2.5 px-6">
                        <div className="flex items-center justify-center">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="gap-1.5 rounded-md h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                disabled={!product.canonical_product_id}
                              >
                                <ImageIcon className="h-3.5 w-3.5" />
                                Images
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[90vw] h-[80vh] max-w-none flex flex-col animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out">
                              <DialogHeader className="flex-shrink-0">
                                <DialogTitle>Manage Product Images</DialogTitle>
                                <DialogDescription className="line-clamp-2">
                                  {product.description}
                                </DialogDescription>
                              </DialogHeader>
                              
                              <div className="flex-1 overflow-y-auto min-h-0">
                                <ImageGallery
                                  productId={product.id}
                                  canonicalProductId={product.canonical_product_id || undefined}
                                />
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </div>

        {/* Pagination Footer - with horizontal padding only */}
        {!loading && products.length > 0 && (
          <PaginationFooter
            pagination={pagination}
            loading={loading}
            onPageSizeChange={handlePageSizeChange}
            onPageChange={handlePageChange}
          />
        )}
      </div>

      {/* Image Discovery Modal */}
      <AnimatePresence>
        {discoveryModalOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-50"
              onClick={() => !discovering && setDiscoveryModalOpen(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] as [number, number, number, number] }}
              className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[90vw] md:max-w-4xl md:h-[80vh] bg-white dark:bg-gray-950 rounded-md shadow-2xl z-50 flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Discover Images with AI
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-1">
                  {discoveringProduct?.description}
                </p>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {discovering ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
                    <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Discovering images...
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      This may take 15-25 seconds. Searching for "cycling {discoveringProduct?.description}"
                    </p>
                  </div>
                ) : discoveredImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      No images found
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Try a different product or check the product name
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                      <p className="text-sm text-blue-900 dark:text-blue-100 font-medium">
                        Click images to approve/reject • Click ⭐ to set primary image
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      {discoveredImages.map((image) => (
                        <div key={image.id} className="relative">
                          <button
                            onClick={() => handleToggleImageApproval(image.id, image.approval_status)}
                            className={cn(
                              'relative aspect-square rounded-md overflow-hidden transition-all group w-full',
                              'hover:scale-105 hover:shadow-lg',
                              image.approval_status === 'approved' && 'ring-4 ring-green-500',
                              image.approval_status === 'pending' && 'ring-2 ring-gray-300 hover:ring-blue-400',
                              image.approval_status === 'rejected' && 'ring-4 ring-red-500 opacity-60'
                            )}
                          >
                            <img
                              src={image.url}
                              alt=""
                              className="w-full h-full object-cover"
                            />

                            {/* Status Indicator */}
                            <div className="absolute top-2 right-2">
                              {image.approval_status === 'approved' ? (
                                <CheckCircle2 className="h-6 w-6 text-green-500 drop-shadow-lg bg-white rounded-full" />
                              ) : image.approval_status === 'rejected' ? (
                                <XCircle className="h-6 w-6 text-red-500 drop-shadow-lg bg-white rounded-full" />
                              ) : (
                                <div className="h-6 w-6 rounded-full bg-white/80 border-2 border-gray-300" />
                              )}
                            </div>

                            {/* Hover Overlay */}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <span className="text-white font-medium opacity-0 group-hover:opacity-100 transition-opacity text-sm">
                                {image.approval_status === 'approved' 
                                  ? 'Click to Reject' 
                                  : image.approval_status === 'rejected'
                                  ? 'Click to Re-approve'
                                  : 'Click to Approve'}
                              </span>
                            </div>
                          </button>

                          {/* Primary Star Button - Only show for approved images */}
                          {image.approval_status === 'approved' && (
                            <button
                              onClick={(e) => handleSetPrimary(image.id, e)}
                              className={cn(
                                'absolute -bottom-3 left-1/2 -translate-x-1/2 z-10',
                                'p-1.5 rounded-full transition-all shadow-lg',
                                image.is_primary 
                                  ? 'bg-yellow-400 hover:bg-yellow-500' 
                                  : 'bg-white hover:bg-gray-100 border-2 border-gray-300'
                              )}
                              title={image.is_primary ? 'Primary image' : 'Set as primary'}
                            >
                              <Star 
                                className={cn(
                                  'h-4 w-4',
                                  image.is_primary ? 'text-yellow-900 fill-yellow-900' : 'text-gray-600'
                                )} 
                              />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              {!discovering && discoveredImages.length > 0 && (
                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {discoveredImages.filter(img => img.approval_status === 'approved').length} approved • 
                    {discoveredImages.filter(img => img.approval_status === 'pending').length} pending • 
                    {discoveredImages.filter(img => img.approval_status === 'rejected').length} rejected
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setDiscoveryModalOpen(false)}
                      className="rounded-md"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCompleteSelection}
                      className="rounded-md bg-green-600 hover:bg-green-700 text-white"
                      disabled={
                        discoveredImages.filter(img => img.approval_status === 'approved').length === 0 ||
                        !discoveredImages.some(img => img.is_primary && img.approval_status === 'approved')
                      }
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Save Selection
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

