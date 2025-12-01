"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Search,
  Package,
  Loader2,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ShoppingBag,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";

// ============================================================
// Types
// ============================================================

interface Purchase {
  id: string;
  order_number: string;
  buyer_id: string;
  seller_id: string;
  product_id: string;
  item_price: number;
  shipping_cost: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  payment_status: string;
  purchase_date: string;
  shipped_at: string | null;
  delivered_at: string | null;
  product: {
    id: string;
    description: string;
    display_name: string | null;
    primary_image_url: string | null;
    price: number;
    marketplace_category: string;
    marketplace_subcategory: string;
  };
  seller: {
    user_id: string;
    name: string;
    business_name: string;
    account_type: string;
  };
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ============================================================
// Animation Variants
// ============================================================

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

// ============================================================
// Filters Bar Component
// ============================================================

const FiltersBar = React.memo(({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  refreshing,
  onRefresh,
  purchasesCount,
  totalPurchases,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  purchasesCount: number;
  totalPurchases: number;
}) => {
  return (
    <div className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by product name..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 rounded-md"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-[160px] rounded-md">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="refunded">Refunded</SelectItem>
            </SelectContent>
          </Select>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-md"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </Button>
        </div>
      </div>

      {/* Results Count */}
      <div className="mt-3 text-sm text-gray-600">
        Showing {purchasesCount} of {totalPurchases} purchases
      </div>
    </div>
  );
});

FiltersBar.displayName = "FiltersBar";

// ============================================================
// Pagination Component
// ============================================================

const PaginationFooter = React.memo(({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: string) => void;
}) => {
  const canGoPrevious = pagination.page > 1;
  const canGoNext = pagination.page < pagination.totalPages;

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Page Size Selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Rows per page:</span>
          <Select
            value={pagination.pageSize.toString()}
            onValueChange={onPageSizeChange}
          >
            <SelectTrigger className="w-[80px] rounded-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(1)}
              disabled={!canGoPrevious}
              className="h-8 w-8 rounded-md"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={!canGoPrevious}
              className="h-8 w-8 rounded-md"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={!canGoNext}
              className="h-8 w-8 rounded-md"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(pagination.totalPages)}
              disabled={!canGoNext}
              className="h-8 w-8 rounded-md"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

PaginationFooter.displayName = "PaginationFooter";

// ============================================================
// Main Page Component
// ============================================================

export default function PurchasesPage() {
  const [purchases, setPurchases] = React.useState<Purchase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [pagination, setPagination] = React.useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch purchases
  const fetchPurchases = React.useCallback(
    async (page: number, isInitialLoad = false) => {
      if (isInitialLoad) {
        setLoading(true);
      }

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          pageSize: pagination.pageSize.toString(),
          search: debouncedSearch,
          status: statusFilter,
        });

        const response = await fetch(`/api/marketplace/purchases?${params}`);

        if (!response.ok) {
          throw new Error("Failed to fetch purchases");
        }

        const data = await response.json();
        setPurchases(data.purchases || []);
        setPagination(data.pagination);
      } catch (error) {
        console.error("Error fetching purchases:", error);
      } finally {
        if (isInitialLoad) {
          setLoading(false);
        }
        setRefreshing(false);
      }
    },
    [debouncedSearch, statusFilter, pagination.pageSize]
  );

  // Initial fetch
  React.useEffect(() => {
    fetchPurchases(1, loading);
  }, [debouncedSearch, statusFilter, pagination.pageSize]);

  const handlePageSizeChange = React.useCallback((newPageSize: string) => {
    setPagination((prev) => ({ ...prev, pageSize: parseInt(newPageSize), page: 1 }));
  }, []);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchPurchases(pagination.page);
  }, [fetchPurchases, pagination.page]);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; className: string }> = {
      pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
      confirmed: { label: "Confirmed", className: "bg-blue-100 text-blue-800" },
      paid: { label: "Paid", className: "bg-green-100 text-green-800" },
      shipped: { label: "Shipped", className: "bg-purple-100 text-purple-800" },
      delivered: { label: "Delivered", className: "bg-green-100 text-green-800" },
      cancelled: { label: "Cancelled", className: "bg-gray-100 text-gray-800" },
      refunded: { label: "Refunded", className: "bg-red-100 text-red-800" },
    };

    const config = statusConfig[status] || { label: status, className: "bg-gray-100 text-gray-800" };

    return (
      <Badge className={cn("rounded-md font-medium", config.className)}>
        {config.label}
      </Badge>
    );
  };

  const getSellerName = (seller: Purchase["seller"]) => {
    if (seller.account_type === "bicycle_store" && seller.business_name) {
      return seller.business_name;
    }
    return seller.name || "Unknown Seller";
  };

  return (
    <>
      <MarketplaceHeader />

      <MarketplaceLayout>
        <div className="min-h-screen bg-gray-50 pt-16">
          {/* Page Header */}
          <div className="border-b border-gray-200 bg-white">
            <div className="max-w-[1920px] mx-auto px-6 py-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-md bg-gray-100">
                  <ShoppingBag className="h-6 w-6 text-gray-700" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">My Purchases</h1>
                  <p className="text-sm text-gray-600">
                    View and manage your purchase history
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <FiltersBar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            purchasesCount={purchases.length}
            totalPurchases={pagination.total}
          />

          {/* Table */}
          <div className="max-w-[1920px] mx-auto">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : purchases.length === 0 ? (
              <div className="flex items-center justify-center py-24">
                <div className="text-center">
                  <div className="rounded-md bg-gray-100 p-6 mb-4 inline-block">
                    <ShoppingBag className="h-12 w-12 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No purchases yet
                  </h3>
                  <p className="text-sm text-gray-600">
                    When you buy items from the marketplace, they'll appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">Image</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Order #</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        {/* Product Image */}
                        <TableCell>
                          <div className="relative h-14 w-14 rounded-md overflow-hidden bg-gray-100">
                            {purchase.product?.primary_image_url ? (
                              <Image
                                src={purchase.product.primary_image_url}
                                alt={purchase.product.display_name || purchase.product.description}
                                fill
                                className="object-cover"
                                sizes="56px"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Package className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* Product Name */}
                        <TableCell>
                          <div className="max-w-xs">
                            <p className="font-medium text-gray-900 truncate">
                              {purchase.product?.display_name || purchase.product?.description || "Unknown Product"}
                            </p>
                            <p className="text-xs text-gray-600 truncate">
                              {purchase.product?.marketplace_category} › {purchase.product?.marketplace_subcategory}
                            </p>
                          </div>
                        </TableCell>

                        {/* Order Number */}
                        <TableCell>
                          <span className="text-sm font-mono text-gray-700">
                            {purchase.order_number}
                          </span>
                        </TableCell>

                        {/* Seller */}
                        <TableCell>
                          <span className="text-sm text-gray-900">
                            {getSellerName(purchase.seller)}
                          </span>
                        </TableCell>

                        {/* Purchase Date */}
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar className="h-4 w-4" />
                            {formatDate(purchase.purchase_date)}
                          </div>
                        </TableCell>

                        {/* Amount */}
                        <TableCell className="text-right">
                          <span className="font-semibold text-gray-900">
                            ${purchase.total_amount.toFixed(2)}
                          </span>
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          {getStatusBadge(purchase.status)}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-md"
                            onClick={() => {
                              // Navigate to order details (to be implemented)
                              console.log("View order:", purchase.id);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {!loading && purchases.length > 0 && (
              <PaginationFooter
                pagination={pagination}
                onPageChange={(page) => fetchPurchases(page)}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </div>
        </div>
      </MarketplaceLayout>
    </>
  );
}

