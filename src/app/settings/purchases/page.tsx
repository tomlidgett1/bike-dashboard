"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
  MoreHorizontal,
  ExternalLink,
  MessageCircle,
  HelpCircle,
  X,
  Filter,
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
// Mobile Action Sheet Component
// ============================================================

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: Purchase | null;
  onViewDetails: (id: string) => void;
  onViewProduct: (id: string) => void;
  onContactSeller: (id: string) => void;
  onGetHelp: (id: string) => void;
  getSellerName: (seller: Purchase["seller"]) => string;
  getStatusBadge: (status: string) => React.ReactNode;
}

function MobileActionSheet({
  isOpen,
  onClose,
  purchase,
  onViewDetails,
  onViewProduct,
  onContactSeller,
  onGetHelp,
  getSellerName,
  getStatusBadge,
}: ActionSheetProps) {
  if (!purchase) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[100]"
            onClick={onClose}
          />
          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="fixed bottom-0 left-0 right-0 bg-white z-[101] rounded-t-xl shadow-2xl"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* Purchase Info */}
            <div className="px-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="relative h-14 w-14 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
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
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {purchase.product?.display_name || purchase.product?.description || "Unknown Product"}
                  </p>
                  <p className="text-sm font-semibold text-gray-700">
                    ${purchase.total_amount.toFixed(2)}
                  </p>
                  <div className="mt-1">
                    {getStatusBadge(purchase.status)}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
              <button
                onClick={() => {
                  onViewDetails(purchase.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Eye className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">View Order Details</span>
              </button>

              <button
                onClick={() => {
                  onViewProduct(purchase.product_id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <ExternalLink className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">View Product</span>
              </button>

              <button
                onClick={() => {
                  onContactSeller(purchase.seller_id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <MessageCircle className="h-5 w-5 text-gray-500" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">Contact Seller</span>
                  <p className="text-xs text-gray-500">{getSellerName(purchase.seller)}</p>
                </div>
              </button>

              <div className="my-2 mx-4 h-px bg-gray-100" />

              <button
                onClick={() => {
                  onGetHelp(purchase.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <HelpCircle className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Get Help</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// Mobile Purchase Card Component
// ============================================================

interface PurchaseCardProps {
  purchase: Purchase;
  onActionClick: (purchase: Purchase) => void;
  onViewDetails: (id: string) => void;
  formatDate: (date: string) => string;
  getStatusBadge: (status: string) => React.ReactNode;
  getSellerName: (seller: Purchase["seller"]) => string;
}

function MobilePurchaseCard({
  purchase,
  onActionClick,
  onViewDetails,
  formatDate,
  getStatusBadge,
  getSellerName,
}: PurchaseCardProps) {
  return (
    <div className="bg-white border-b border-gray-100 last:border-b-0">
      <div className="p-4">
        <div className="flex gap-3">
          {/* Image */}
          <button
            onClick={() => onViewDetails(purchase.id)}
            className="flex-shrink-0 h-20 w-20 rounded-md bg-gray-100 overflow-hidden"
          >
            {purchase.product?.primary_image_url ? (
              <Image
                src={purchase.product.primary_image_url}
                alt={purchase.product.display_name || purchase.product.description}
                width={80}
                height={80}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Package className="h-8 w-8 text-gray-400" />
              </div>
            )}
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => onViewDetails(purchase.id)}
                  className="text-left"
                >
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">
                    {purchase.product?.display_name || purchase.product?.description || "Unknown Product"}
                  </p>
                </button>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  ${purchase.total_amount.toFixed(2)}
                </p>
              </div>

              {/* More Actions Button */}
              <button
                onClick={() => onActionClick(purchase)}
                className="p-2 -mr-2 -mt-1 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <MoreHorizontal className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Meta Info */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {getStatusBadge(purchase.status)}
              <span className="text-xs text-gray-500">
                #{purchase.order_number}
              </span>
            </div>

            {/* Footer Row */}
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>From {getSellerName(purchase.seller)}</span>
              <span>{formatDate(purchase.purchase_date)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Mobile Filters Component
// ============================================================

interface MobileFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
}

function MobileFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  refreshing,
  onRefresh,
}: MobileFiltersProps) {
  const [showFilters, setShowFilters] = React.useState(false);

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3">
      {/* Search Row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search purchases..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 rounded-md h-10"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className={cn("rounded-md h-10 w-10", statusFilter !== "all" && "border-gray-900")}
        >
          <Filter className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-md h-10 w-10"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Filters Row */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              <Select value={statusFilter} onValueChange={onStatusFilterChange}>
                <SelectTrigger className="w-full rounded-md">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Desktop Filters Bar Component
// ============================================================

const DesktopFiltersBar = React.memo(({
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

DesktopFiltersBar.displayName = "DesktopFiltersBar";

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
    <div className="border-t border-gray-200 bg-white px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Page Size Selector - Hidden on mobile */}
        <div className="hidden sm:flex items-center gap-2">
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
  const router = useRouter();
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
  const [actionSheetOpen, setActionSheetOpen] = React.useState(false);
  const [selectedPurchase, setSelectedPurchase] = React.useState<Purchase | null>(null);

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

  const handleMobileActionClick = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setActionSheetOpen(true);
  };

  const handleViewDetails = (id: string) => {
    console.log("View order details:", id);
    // router.push(`/settings/purchases/${id}`);
  };

  const handleViewProduct = (productId: string) => {
    router.push(`/marketplace/product/${productId}`);
  };

  const handleContactSeller = (sellerId: string) => {
    console.log("Contact seller:", sellerId);
    // router.push(`/messages?user=${sellerId}`);
  };

  const handleGetHelp = (orderId: string) => {
    console.log("Get help for order:", orderId);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return "Today";
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
      });
    }
  };

  const formatDateFull = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; dotColor: string }> = {
      pending: { label: "Pending", dotColor: "bg-yellow-500" },
      confirmed: { label: "Confirmed", dotColor: "bg-blue-500" },
      paid: { label: "Paid", dotColor: "bg-green-500" },
      shipped: { label: "Shipped", dotColor: "bg-purple-500" },
      delivered: { label: "Delivered", dotColor: "bg-green-500" },
      cancelled: { label: "Cancelled", dotColor: "bg-gray-400" },
      refunded: { label: "Refunded", dotColor: "bg-red-500" },
    };

    const config = statusConfig[status] || { label: status, dotColor: "bg-gray-400" };

    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md">
        <span className={cn("h-1.5 w-1.5 rounded-full", config.dotColor)} />
        {config.label}
      </span>
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
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout>
        <div className="min-h-screen bg-gray-50 pt-16 sm:pt-16 pb-44 sm:pb-8">
          {/* Page Header */}
          <div className="border-b border-gray-200 bg-white">
            <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-md bg-gray-100 flex-shrink-0">
                  <ShoppingBag className="h-6 w-6 text-gray-700" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Purchases</h1>
                  <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                    View and manage your purchase history
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Filters */}
          <div className="sm:hidden">
            <MobileFilters
              search={search}
              onSearchChange={setSearch}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />
          </div>

          {/* Desktop Filters */}
          <div className="hidden sm:block">
            <DesktopFiltersBar
              search={search}
              onSearchChange={setSearch}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              refreshing={refreshing}
              onRefresh={handleRefresh}
              purchasesCount={purchases.length}
              totalPurchases={pagination.total}
            />
          </div>

          {/* Content */}
          <div className="max-w-[1920px] mx-auto">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : purchases.length === 0 ? (
              <div className="flex items-center justify-center py-16 sm:py-24 px-4">
                <div className="text-center">
                  <div className="rounded-md bg-gray-100 p-5 sm:p-6 mb-4 inline-block">
                    <ShoppingBag className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400" />
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2">
                    No purchases yet
                  </h3>
                  <p className="text-sm text-gray-600 max-w-md mx-auto">
                    When you buy items from the marketplace, they'll appear here.
                  </p>
                  <Button
                    onClick={() => router.push("/marketplace")}
                    className="mt-6 rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                  >
                    Browse Marketplace
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Mobile Results Count */}
                <div className="sm:hidden px-4 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
                  Showing {purchases.length} of {pagination.total} purchases
                </div>

                {/* Mobile Card View */}
                <div className="sm:hidden bg-white">
                  {purchases.map((purchase) => (
                    <MobilePurchaseCard
                      key={purchase.id}
                      purchase={purchase}
                      onActionClick={handleMobileActionClick}
                      onViewDetails={handleViewDetails}
                      formatDate={formatDate}
                      getStatusBadge={getStatusBadge}
                      getSellerName={getSellerName}
                    />
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden sm:block bg-white">
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
                              {formatDateFull(purchase.purchase_date)}
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
                              onClick={() => handleViewDetails(purchase.id)}
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

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <PaginationFooter
                    pagination={pagination}
                    onPageChange={(page) => fetchPurchases(page)}
                    onPageSizeChange={handlePageSizeChange}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </MarketplaceLayout>

      {/* Mobile Action Sheet */}
      <MobileActionSheet
        isOpen={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        purchase={selectedPurchase}
        onViewDetails={handleViewDetails}
        onViewProduct={handleViewProduct}
        onContactSeller={handleContactSeller}
        onGetHelp={handleGetHelp}
        getSellerName={getSellerName}
        getStatusBadge={getStatusBadge}
      />
    </>
  );
}
