"use client";

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
import dynamic from "next/dynamic";

// Dynamically import Dialog components to avoid SSR issues
const Dialog = dynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.Dialog),
  { ssr: false }
);
const DialogContent = dynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogContent),
  { ssr: false }
);
const DialogDescription = dynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogDescription),
  { ssr: false }
);
const DialogHeader = dynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogHeader),
  { ssr: false }
);
const DialogTitle = dynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogTitle),
  { ssr: false }
);
const DialogTrigger = dynamic(
  () => import("@/components/ui/dialog").then((mod) => mod.DialogTrigger),
  { ssr: false }
);

// Dynamically import ImageGallery to avoid SSR issues
const ImageGallery = dynamic(
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
                          <div className="flex-shrink-0 h-10 w-10 rounded-md bg-gray-100 dark:bg-gray-800 overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700">
                            {product.resolved_image_url || product.primary_image_url ? (
                              <Image
                                src={product.resolved_image_url || product.primary_image_url || ''}
                                alt={product.description}
                                width={40}
                                height={40}
                                className="object-cover w-full h-full"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                          </div>
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
                          {product.lightspeed_item_id && (
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
                          )}
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
    </div>
  );
}

