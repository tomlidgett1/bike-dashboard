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
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShoppingBag,
  ExternalLink,
  MessageCircle,
  HelpCircle,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Truck,
  CreditCard,
  Copy,
  Check,
  Store,
  Shield,
  PackageCheck,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  funds_status?: 'held' | 'released' | 'auto_released' | 'disputed' | 'refunded' | null;
  funds_release_at?: string | null;
  buyer_confirmed_at?: string | null;
  product: {
    id: string;
    description: string;
    display_name: string | null;
    primary_image_url: string | null;
    cached_image_url: string | null;
    images: Array<{ url: string }> | null;
    price: number;
    marketplace_category: string;
    marketplace_subcategory: string;
    listing_type: string;
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

// Helper to normalize product data
function normalizeProduct(product: any): Purchase['product'] | null {
  if (!product) return null;
  if (Array.isArray(product)) {
    return product.length > 0 ? product[0] : null;
  }
  return product;
}

// Helper to get the best available image URL
function getProductImageUrl(product: any): string | null {
  const p = normalizeProduct(product);
  if (!p) return null;
  if (p.cached_image_url) return p.cached_image_url;
  if (p.primary_image_url) return p.primary_image_url;
  if (p.images && Array.isArray(p.images) && p.images.length > 0) {
    const firstImage = p.images[0];
    if (typeof firstImage === 'string') return firstImage;
    if (firstImage?.url) return firstImage.url;
  }
  return null;
}

// Helper to get product display name
function getProductName(product: any): string {
  const p = normalizeProduct(product);
  if (!p) return "Unknown Product";
  return p.description || p.display_name || "Unknown Product";
}

// ============================================================
// Status Configuration
// ============================================================

const statusConfig: Record<string, { 
  label: string; 
  color: string;
}> = {
  pending: { label: "Pending", color: "text-amber-600" },
  confirmed: { label: "Confirmed", color: "text-blue-600" },
  paid: { label: "Paid", color: "text-emerald-600" },
  shipped: { label: "Shipped", color: "text-violet-600" },
  delivered: { label: "Delivered", color: "text-emerald-600" },
  cancelled: { label: "Cancelled", color: "text-gray-500" },
  refunded: { label: "Refunded", color: "text-red-600" },
};

// ============================================================
// Detail Row Component (Stripe Link Style)
// ============================================================

function DetailRow({ 
  label, 
  value, 
  action,
  muted = false 
}: { 
  label: string; 
  value: React.ReactNode; 
  action?: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-b-0">
      <span className="text-gray-500 text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn("text-sm", muted ? "text-gray-400" : "text-gray-900")}>
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}

// ============================================================
// Purchase Detail Panel (Stripe Link Style)
// ============================================================

interface DetailPanelProps {
  purchase: Purchase | null;
  isOpen: boolean;
  onClose: () => void;
  onViewProduct: (id: string) => void;
  onContactSeller: (id: string) => void;
  onConfirmReceipt: (id: string) => void;
  confirmingId: string | null;
  getSellerName: (seller: Purchase["seller"]) => string;
}

function PurchaseDetailPanel({
  purchase,
  isOpen,
  onClose,
  onViewProduct,
  onContactSeller,
  onConfirmReceipt,
  confirmingId,
  getSellerName,
}: DetailPanelProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    if (!purchase) return;
    navigator.clipboard.writeText(purchase.order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!purchase) return null;

  const status = statusConfig[purchase.status] || statusConfig.pending;
  const canConfirmReceipt = purchase.funds_status === 'held';
  const isConfirming = confirmingId === purchase.id;
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);
  const p = normalizeProduct(purchase.product);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile: Bottom Sheet */}
          <div className="lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-[100]"
              onClick={onClose}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="fixed bottom-0 left-0 right-0 bg-white z-[101] rounded-t-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>
              <div className="flex-1 overflow-y-auto">
                <DetailContent 
                  purchase={purchase}
                  status={status}
                  productImage={productImage}
                  productName={productName}
                  product={p}
                  canConfirmReceipt={canConfirmReceipt}
                  isConfirming={isConfirming}
                  copied={copied}
                  onCopy={handleCopy}
                  onConfirmReceipt={onConfirmReceipt}
                  onViewProduct={onViewProduct}
                  onContactSeller={onContactSeller}
                  onClose={onClose}
                  getSellerName={getSellerName}
                  formatDate={formatDate}
                />
              </div>
            </motion.div>
          </div>

          {/* Desktop: Side Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="hidden lg:block"
          >
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <DetailContent 
                purchase={purchase}
                status={status}
                productImage={productImage}
                productName={productName}
                product={p}
                canConfirmReceipt={canConfirmReceipt}
                isConfirming={isConfirming}
                copied={copied}
                onCopy={handleCopy}
                onConfirmReceipt={onConfirmReceipt}
                onViewProduct={onViewProduct}
                onContactSeller={onContactSeller}
                onClose={onClose}
                getSellerName={getSellerName}
                formatDate={formatDate}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Shared detail content
function DetailContent({
  purchase,
  status,
  productImage,
  productName,
  product,
  canConfirmReceipt,
  isConfirming,
  copied,
  onCopy,
  onConfirmReceipt,
  onViewProduct,
  onContactSeller,
  onClose,
  getSellerName,
  formatDate,
}: {
  purchase: Purchase;
  status: typeof statusConfig[string];
  productImage: string | null;
  productName: string;
  product: Purchase['product'] | null;
  canConfirmReceipt: boolean;
  isConfirming: boolean;
  copied: boolean;
  onCopy: () => void;
  onConfirmReceipt: (id: string) => void;
  onViewProduct: (id: string) => void;
  onContactSeller: (id: string) => void;
  onClose: () => void;
  getSellerName: (seller: Purchase["seller"]) => string;
  formatDate: (date: string) => string;
}) {
  return (
    <div>
      {/* Header with close */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Order Details</h3>
        <button 
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      {/* Product Section */}
      <div className="px-5 py-4 border-b border-gray-100">
        <div className="flex gap-4">
          <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
            {productImage ? (
              <Image
                src={productImage}
                alt={productName}
                fill
                className="object-cover"
                sizes="64px"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Package className="h-6 w-6 text-gray-300" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 line-clamp-2 text-sm">
              {productName}
            </p>
            {product?.marketplace_category && (
              <p className="text-xs text-gray-500 mt-1">
                {product.marketplace_category}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Order Info */}
      <div className="px-5">
        <DetailRow 
          label="Order" 
          value={`#${purchase.order_number}`}
          action={
            <button onClick={onCopy} className="p-1 -mr-1 hover:bg-gray-100 rounded transition-colors">
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 text-gray-400" />
              )}
            </button>
          }
        />
        <DetailRow 
          label="Status" 
          value={
            <span className={cn("font-medium", status.color)}>
              {status.label}
            </span>
          }
        />
        <DetailRow 
          label="Date" 
          value={formatDate(purchase.purchase_date)}
        />
      </div>

      {/* Seller */}
      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Seller</p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100">
              {purchase.seller.account_type === 'bicycle_store' ? (
                <Store className="h-5 w-5 text-gray-500" />
              ) : (
                <span className="text-sm font-medium text-gray-600">
                  {getSellerName(purchase.seller).charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{getSellerName(purchase.seller)}</p>
              {purchase.seller.account_type === 'bicycle_store' && (
                <p className="text-xs text-gray-500">Verified Store</p>
              )}
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-gray-300" />
        </div>
      </div>

      {/* Payment Summary */}
      <div className="px-5 py-4 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Payment</p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Item</span>
            <span className="text-gray-900">${purchase.item_price.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Shipping</span>
            <span className="text-gray-900">
              {purchase.shipping_cost === 0 ? 'Free' : `$${purchase.shipping_cost.toFixed(2)}`}
            </span>
          </div>
          {purchase.tax_amount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">GST</span>
              <span className="text-gray-900">${purchase.tax_amount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <span className="font-medium text-gray-900">Total</span>
            <span className="font-semibold text-gray-900">${purchase.total_amount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Escrow Status */}
      {purchase.funds_status && (
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Shield className="h-5 w-5 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">
                {purchase.funds_status === 'held' ? 'Payment Protected' : 
                 purchase.funds_status === 'released' ? 'Payment Released' :
                 purchase.funds_status === 'auto_released' ? 'Auto Released' :
                 purchase.funds_status === 'disputed' ? 'Under Dispute' : 'Refunded'}
              </p>
              {purchase.funds_status === 'held' && purchase.funds_release_at && (
                <p className="text-xs text-gray-500">
                  Auto-releases {formatDate(purchase.funds_release_at)}
                </p>
              )}
            </div>
            <Info className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      )}

      {/* Confirm Receipt */}
      {canConfirmReceipt && (
        <div className="px-5 py-4 border-t border-gray-100">
          <button
            onClick={() => onConfirmReceipt(purchase.id)}
            disabled={isConfirming}
            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-medium rounded-lg transition-colors"
          >
            {isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {isConfirming ? 'Confirming...' : 'Confirm Receipt'}
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            This will release payment to the seller
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="px-5 py-4 border-t border-gray-100 space-y-2">
        <button
          onClick={() => onViewProduct(purchase.product_id)}
          className="w-full flex items-center justify-between py-3 px-4 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-3">
            <ExternalLink className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-700">View Product</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </button>
        <button
          onClick={() => onContactSeller(purchase.seller_id)}
          className="w-full flex items-center justify-between py-3 px-4 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-3">
            <MessageCircle className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-700">Contact Seller</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </button>
        <button
          className="w-full flex items-center justify-between py-3 px-4 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-3">
            <HelpCircle className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-700">Get Help</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-300" />
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Purchase Row Component (Clean Minimal Style)
// ============================================================

function PurchaseRow({
  purchase,
  isSelected,
  onClick,
  getSellerName,
}: {
  purchase: Purchase;
  isSelected: boolean;
  onClick: () => void;
  getSellerName: (seller: Purchase["seller"]) => string;
}) {
  const status = statusConfig[purchase.status] || statusConfig.pending;
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
    });
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left py-4 px-5 flex items-center gap-4 border-b border-gray-100 hover:bg-gray-50 transition-colors",
        isSelected && "bg-gray-50"
      )}
    >
      {/* Image */}
      <div className="relative h-14 w-14 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
        {productImage ? (
          <Image
            src={productImage}
            alt={productName}
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Package className="h-5 w-5 text-gray-300" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm truncate">
          {productName}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {getSellerName(purchase.seller)} • {formatDate(purchase.purchase_date)}
        </p>
      </div>

      {/* Right side */}
      <div className="text-right flex-shrink-0">
        <p className="font-medium text-gray-900 text-sm">${purchase.total_amount.toFixed(2)}</p>
        <p className={cn("text-xs mt-0.5", status.color)}>{status.label}</p>
      </div>

      <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
    </button>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <ShoppingBag className="h-7 w-7 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">
        No purchases yet
      </h3>
      <p className="text-gray-500 text-sm text-center max-w-xs mb-6">
        When you buy items from the marketplace, they'll appear here.
      </p>
      <button
        onClick={onBrowse}
        className="px-5 py-2.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium rounded-lg transition-colors"
      >
        Browse Marketplace
      </button>
    </div>
  );
}

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
  const [selectedPurchase, setSelectedPurchase] = React.useState<Purchase | null>(null);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch purchases
  const fetchPurchases = React.useCallback(
    async (page: number, isInitialLoad = false) => {
      if (isInitialLoad) setLoading(true);

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          pageSize: pagination.pageSize.toString(),
          search: debouncedSearch,
          status: statusFilter,
        });

        const response = await fetch(`/api/marketplace/purchases?${params}`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error || "Failed to fetch");
        
        setPurchases(data.purchases || []);
        setPagination(data.pagination);
      } catch (error) {
        console.error("Error fetching purchases:", error);
      } finally {
        if (isInitialLoad) setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, statusFilter, pagination.pageSize]
  );

  React.useEffect(() => {
    fetchPurchases(1, loading);
  }, [debouncedSearch, statusFilter, pagination.pageSize]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPurchases(pagination.page);
  };

  const handleViewProduct = (productId: string) => {
    router.push(`/marketplace/product/${productId}`);
  };

  const handleContactSeller = (sellerId: string) => {
    console.log("Contact seller:", sellerId);
  };

  const handleConfirmReceipt = async (purchaseId: string) => {
    if (confirmingId) return;
    
    const confirmed = window.confirm(
      "Are you sure you want to confirm receipt? This will release the payment to the seller."
    );
    if (!confirmed) return;
    
    setConfirmingId(purchaseId);
    
    try {
      const response = await fetch(`/api/marketplace/purchases/${purchaseId}/confirm-receipt`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to confirm receipt');
      }
      
      await fetchPurchases(pagination.page);
      setSelectedPurchase(null);
      alert('Receipt confirmed! Payment has been released to the seller.');
    } catch (error) {
      console.error('Error confirming receipt:', error);
      alert(error instanceof Error ? error.message : 'Failed to confirm receipt');
    } finally {
      setConfirmingId(null);
    }
  };

  const getSellerName = (seller: Purchase["seller"]) => {
    if (seller?.account_type === "bicycle_store" && seller.business_name) {
      return seller.business_name;
    }
    return seller?.name || "Unknown Seller";
  };

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout>
        <div className="min-h-screen bg-gray-50 pt-16 pb-24 sm:pb-8">
          {/* Content */}
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Left: Purchase List */}
              <div className={cn(
                "flex-1 transition-all duration-200",
                selectedPurchase ? "lg:max-w-[55%]" : "lg:max-w-3xl lg:mx-auto"
              )}>
                {/* Header Card */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Title */}
                  <div className="px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <h1 className="text-lg font-semibold text-gray-900">My Purchases</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {pagination.total} order{pagination.total !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <RefreshCw className={cn("h-5 w-5 text-gray-400", refreshing && "animate-spin")} />
                      </button>
                    </div>
                  </div>

                  {/* Search & Filter */}
                  <div className="px-5 py-3 border-b border-gray-100 flex gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search orders..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 border-gray-200 rounded-lg bg-gray-50 focus:bg-white h-10"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[130px] border-gray-200 rounded-lg bg-gray-50 h-10">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* List */}
                  {loading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : purchases.length === 0 ? (
                    <EmptyState onBrowse={() => router.push("/marketplace")} />
                  ) : (
                    <div>
                      {purchases.map((purchase) => (
                        <PurchaseRow
                          key={purchase.id}
                          purchase={purchase}
                          isSelected={selectedPurchase?.id === purchase.id}
                          onClick={() => setSelectedPurchase(
                            selectedPurchase?.id === purchase.id ? null : purchase
                          )}
                          getSellerName={getSellerName}
                        />
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => fetchPurchases(pagination.page - 1)}
                          disabled={pagination.page <= 1}
                          className="p-2 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent rounded-lg transition-colors"
                        >
                          <ChevronLeft className="h-5 w-5 text-gray-600" />
                        </button>
                        <button
                          onClick={() => fetchPurchases(pagination.page + 1)}
                          disabled={pagination.page >= pagination.totalPages}
                          className="p-2 hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-transparent rounded-lg transition-colors"
                        >
                          <ChevronRight className="h-5 w-5 text-gray-600" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Detail Panel (Desktop) */}
              <AnimatePresence mode="wait">
                {selectedPurchase && (
                  <motion.div
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "45%" }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="hidden lg:block sticky top-20 h-fit"
                  >
                    <PurchaseDetailPanel
                      purchase={selectedPurchase}
                      isOpen={true}
                      onClose={() => setSelectedPurchase(null)}
                      onViewProduct={handleViewProduct}
                      onContactSeller={handleContactSeller}
                      onConfirmReceipt={handleConfirmReceipt}
                      confirmingId={confirmingId}
                      getSellerName={getSellerName}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </MarketplaceLayout>

      {/* Mobile Detail Panel */}
      <div className="lg:hidden">
        <PurchaseDetailPanel
          purchase={selectedPurchase}
          isOpen={!!selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          onViewProduct={handleViewProduct}
          onContactSeller={handleContactSeller}
          onConfirmReceipt={handleConfirmReceipt}
          confirmingId={confirmingId}
          getSellerName={getSellerName}
        />
      </div>
    </>
  );
}
