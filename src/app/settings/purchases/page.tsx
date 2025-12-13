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
  ChevronRight,
  ShoppingBag,
  ExternalLink,
  MessageCircle,
  HelpCircle,
  X,
  CheckCircle2,
  Clock,
  Truck,
  Copy,
  Check,
  Store,
  Shield,
  Mail,
  DollarSign,
  Archive,
  AlertCircle,
  Tag,
  MoreVertical,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type ViewMode = 'buying' | 'selling';
type CategoryFilter = 'all' | 'active' | 'completed' | 'disputes' | 'archived';
type QuickFilter = 'awaiting_shipment' | 'in_transit' | 'pending_confirmation' | null;

// Helpers
function normalizeProduct(product: any): Purchase['product'] | null {
  if (!product) return null;
  if (Array.isArray(product)) return product.length > 0 ? product[0] : null;
  return product;
}

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

function getProductName(product: any): string {
  const p = normalizeProduct(product);
  if (!p) return "Unknown Product";
  return p.description || p.display_name || "Unknown Product";
}

// ============================================================
// Status Config - Yellow/Amber Theme
// ============================================================

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pending", color: "text-amber-700", bg: "bg-amber-50" },
  confirmed: { label: "Confirmed", color: "text-blue-700", bg: "bg-blue-50" },
  paid: { label: "Paid", color: "text-emerald-700", bg: "bg-emerald-50" },
  shipped: { label: "Shipped", color: "text-violet-700", bg: "bg-violet-50" },
  delivered: { label: "Delivered", color: "text-emerald-700", bg: "bg-emerald-50" },
  cancelled: { label: "Cancelled", color: "text-neutral-500", bg: "bg-neutral-100" },
  refunded: { label: "Refunded", color: "text-red-700", bg: "bg-red-50" },
};

// ============================================================
// Navigation Item (Nova Style)
// ============================================================

function NavItem({ 
  icon: Icon, 
  label, 
  count, 
  isActive, 
  onClick 
}: { 
  icon: React.ElementType; 
  label: string; 
  count?: number; 
  isActive: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
        isActive 
          ? "bg-amber-50 text-amber-900 font-medium" 
          : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
      )}
    >
      <Icon className={cn("h-4 w-4", isActive ? "text-amber-600" : "text-neutral-400")} />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cn(
          "text-xs tabular-nums",
          isActive ? "text-amber-600" : "text-neutral-400"
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

// ============================================================
// Quick Filter Chip (Nova Yellow Theme)
// ============================================================

function FilterChip({ 
  label, 
  isActive, 
  onClick 
}: { 
  label: string; 
  isActive: boolean; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
        isActive 
          ? "bg-amber-500 text-white shadow-sm" 
          : "bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50"
      )}
    >
      {label}
    </button>
  );
}

// ============================================================
// Order Card (Nova Style)
// ============================================================

function OrderCard({
  purchase,
  isSelected,
  onClick,
  getSellerName,
  viewMode,
}: {
  purchase: Purchase;
  isSelected: boolean;
  onClick: () => void;
  getSellerName: (seller: Purchase["seller"]) => string;
  viewMode: ViewMode;
}) {
  const status = statusConfig[purchase.status] || statusConfig.pending;
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-xl border transition-all group",
        isSelected 
          ? "bg-amber-50/50 border-amber-200 ring-1 ring-amber-200" 
          : "bg-white border-neutral-200 hover:border-neutral-300 hover:shadow-sm"
      )}
    >
      <div className="flex gap-4">
        {/* Image */}
        <div className="relative h-16 w-16 rounded-lg overflow-hidden bg-neutral-100 flex-shrink-0">
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
              <Package className="h-6 w-6 text-neutral-300" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium text-neutral-900 truncate text-sm">
                {productName}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {viewMode === 'buying' ? getSellerName(purchase.seller) : 'Buyer'} • {formatDate(purchase.purchase_date)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-semibold text-neutral-900 text-sm">
                ${purchase.total_amount.toFixed(2)}
              </p>
            </div>
          </div>
          
          {/* Status Badge */}
          <div className="mt-2 flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
              status.color,
              status.bg
            )}>
              {status.label}
            </span>
            {purchase.funds_status === 'held' && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                <Shield className="h-3 w-3" />
                Protected
              </span>
            )}
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center">
          <ChevronRight className={cn(
            "h-5 w-5 transition-all",
            isSelected ? "text-amber-500" : "text-neutral-300 group-hover:text-neutral-400"
          )} />
        </div>
      </div>
    </button>
  );
}

// ============================================================
// Detail Panel (Nova Style with Yellow Accents)
// ============================================================

function DetailPanel({
  purchase,
  isOpen,
  onClose,
  onViewProduct,
  onContactSeller,
  onConfirmReceipt,
  confirmingId,
  getSellerName,
  viewMode,
}: {
  purchase: Purchase | null;
  isOpen: boolean;
  onClose: () => void;
  onViewProduct: (id: string) => void;
  onContactSeller: (id: string) => void;
  onConfirmReceipt: (id: string) => void;
  confirmingId: string | null;
  getSellerName: (seller: Purchase["seller"]) => string;
  viewMode: ViewMode;
}) {
  const [copied, setCopied] = React.useState(false);

  if (!purchase) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(purchase.order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const status = statusConfig[purchase.status] || statusConfig.pending;
  const canConfirmReceipt = purchase.funds_status === 'held' && viewMode === 'buying';
  const isConfirming = confirmingId === purchase.id;
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);
  const p = normalizeProduct(purchase.product);

  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  const content = (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-neutral-900">Order Details</h3>
        <button 
          onClick={onClose} 
          className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
        >
          <X className="h-4 w-4 text-neutral-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Product */}
        <div className="p-5 border-b border-neutral-100">
          <div className="flex gap-4">
            <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-neutral-100 flex-shrink-0">
              {productImage ? (
                <Image src={productImage} alt={productName} fill className="object-cover" sizes="80px" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-8 w-8 text-neutral-300" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-neutral-900 line-clamp-2">{productName}</p>
              {p?.marketplace_category && (
                <p className="text-sm text-neutral-500 mt-1">{p.marketplace_category}</p>
              )}
              <div className="mt-2">
                <span className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
                  status.color, status.bg
                )}>
                  {status.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Order Info */}
        <div className="p-5 border-b border-neutral-100 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">Order number</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-neutral-900">#{purchase.order_number}</span>
              <button onClick={handleCopy} className="p-1 hover:bg-neutral-100 rounded transition-colors">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-neutral-400" />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">Date</span>
            <span className="text-sm text-neutral-900">{formatDate(purchase.purchase_date)}</span>
          </div>
        </div>

        {/* Seller/Buyer */}
        <div className="p-5 border-b border-neutral-100">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">
            {viewMode === 'buying' ? 'Seller' : 'Buyer'}
          </p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center">
              {purchase.seller.account_type === 'bicycle_store' ? (
                <Store className="h-5 w-5 text-neutral-500" />
              ) : (
                <span className="text-sm font-medium text-neutral-600">
                  {getSellerName(purchase.seller).charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-900">{getSellerName(purchase.seller)}</p>
              {purchase.seller.account_type === 'bicycle_store' && (
                <p className="text-xs text-neutral-500">Verified Store</p>
              )}
            </div>
            <button className="p-2 hover:bg-neutral-100 rounded-lg transition-colors">
              <MessageCircle className="h-4 w-4 text-neutral-500" />
            </button>
          </div>
        </div>

        {/* Payment */}
        <div className="p-5 border-b border-neutral-100">
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-wider mb-3">Payment</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Item</span>
              <span className="text-neutral-900">${purchase.item_price.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Shipping</span>
              <span className="text-neutral-900">
                {purchase.shipping_cost === 0 ? 'Free' : `$${purchase.shipping_cost.toFixed(2)}`}
              </span>
            </div>
            {purchase.tax_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">GST</span>
                <span className="text-neutral-900">${purchase.tax_amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-neutral-100">
              <span className="text-sm font-medium text-neutral-900">Total</span>
              <span className="font-semibold text-neutral-900">${purchase.total_amount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Escrow */}
        {purchase.funds_status && (
          <div className="p-5 border-b border-neutral-100">
            <div className={cn(
              "flex items-center gap-3 p-3 rounded-lg",
              purchase.funds_status === 'held' ? "bg-amber-50" : "bg-neutral-50"
            )}>
              <Shield className={cn(
                "h-5 w-5",
                purchase.funds_status === 'held' ? "text-amber-500" : "text-neutral-400"
              )} />
              <div className="flex-1">
                <p className={cn(
                  "text-sm font-medium",
                  purchase.funds_status === 'held' ? "text-amber-900" : "text-neutral-700"
                )}>
                  {purchase.funds_status === 'held' ? 'Payment Protected' : 
                   purchase.funds_status === 'released' ? 'Payment Released' :
                   purchase.funds_status === 'auto_released' ? 'Auto Released' :
                   purchase.funds_status === 'disputed' ? 'Under Dispute' : 'Refunded'}
                </p>
                {purchase.funds_status === 'held' && purchase.funds_release_at && (
                  <p className="text-xs text-amber-700">
                    Auto-releases {formatDate(purchase.funds_release_at)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Confirm Receipt CTA */}
        {canConfirmReceipt && (
          <div className="p-5 border-b border-neutral-100">
            <button
              onClick={() => onConfirmReceipt(purchase.id)}
              disabled={isConfirming}
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-medium rounded-xl transition-colors"
            >
              {isConfirming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {isConfirming ? 'Confirming...' : 'Confirm Receipt'}
            </button>
            <p className="text-xs text-neutral-500 text-center mt-2">
              This will release payment to the seller
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="p-5 space-y-1">
          <button
            onClick={() => onViewProduct(purchase.product_id)}
            className="w-full flex items-center justify-between py-3 px-3 hover:bg-neutral-50 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3">
              <ArrowUpRight className="h-4 w-4 text-neutral-400" />
              <span className="text-sm text-neutral-700">View Product</span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-300" />
          </button>
          <button
            onClick={() => onContactSeller(purchase.seller_id)}
            className="w-full flex items-center justify-between py-3 px-3 hover:bg-neutral-50 rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3">
              <MessageCircle className="h-4 w-4 text-neutral-400" />
              <span className="text-sm text-neutral-700">
                {viewMode === 'buying' ? 'Contact Seller' : 'Contact Buyer'}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-300" />
          </button>
          <button className="w-full flex items-center justify-between py-3 px-3 hover:bg-neutral-50 rounded-lg transition-colors">
            <div className="flex items-center gap-3">
              <HelpCircle className="h-4 w-4 text-neutral-400" />
              <span className="text-sm text-neutral-700">Get Help</span>
            </div>
            <ChevronRight className="h-4 w-4 text-neutral-300" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile */}
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
              className="fixed bottom-0 left-0 right-0 bg-white z-[101] rounded-t-2xl max-h-[90vh] overflow-hidden"
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-neutral-200 rounded-full" />
              </div>
              {content}
            </motion.div>
          </div>

          {/* Desktop */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="hidden lg:block bg-white rounded-xl border border-neutral-200 overflow-hidden h-[calc(100vh-8rem)]"
          >
            {content}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState({ viewMode, onAction }: { viewMode: ViewMode; onAction: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        {viewMode === 'selling' ? (
          <Tag className="h-7 w-7 text-amber-500" />
        ) : (
          <ShoppingBag className="h-7 w-7 text-amber-500" />
        )}
      </div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-1">
        {viewMode === 'selling' ? 'No sales yet' : 'No purchases yet'}
      </h3>
      <p className="text-neutral-500 text-sm text-center max-w-xs mb-6">
        {viewMode === 'selling' 
          ? "When you sell items, they'll appear here."
          : "When you buy items, they'll appear here."}
      </p>
      <button
        onClick={onAction}
        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl transition-colors"
      >
        {viewMode === 'selling' ? 'List an Item' : 'Browse Marketplace'}
      </button>
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function PurchasesPage() {
  const router = useRouter();
  
  const [viewMode, setViewMode] = React.useState<ViewMode>('buying');
  const [category, setCategory] = React.useState<CategoryFilter>('all');
  const [quickFilter, setQuickFilter] = React.useState<QuickFilter>(null);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  
  const [purchases, setPurchases] = React.useState<Purchase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [pagination, setPagination] = React.useState<PaginationInfo>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [selectedPurchase, setSelectedPurchase] = React.useState<Purchase | null>(null);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState({ all: 0, active: 0, completed: 0, disputes: 0, archived: 0 });

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const getStatusFilter = () => {
    if (quickFilter === 'awaiting_shipment') return 'paid';
    if (quickFilter === 'in_transit') return 'shipped';
    if (quickFilter === 'pending_confirmation') return 'delivered';
    if (category === 'active') return 'active';
    if (category === 'completed') return 'completed';
    if (category === 'disputes') return 'disputed';
    return 'all';
  };

  const fetchPurchases = React.useCallback(async (page: number, isInitialLoad = false) => {
    if (isInitialLoad) setLoading(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pagination.pageSize.toString(),
        search: debouncedSearch,
        status: getStatusFilter(),
        mode: viewMode,
      });

      const response = await fetch(`/api/marketplace/purchases?${params}`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to fetch");
      
      setPurchases(data.purchases || []);
      setPagination(data.pagination);
      if (data.counts) setCounts(data.counts);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      if (isInitialLoad) setLoading(false);
      setRefreshing(false);
    }
  }, [debouncedSearch, category, quickFilter, viewMode, pagination.pageSize]);

  React.useEffect(() => {
    fetchPurchases(1, true);
  }, [debouncedSearch, category, quickFilter, viewMode]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPurchases(pagination.page);
  };

  const handleConfirmReceipt = async (purchaseId: string) => {
    if (confirmingId) return;
    if (!window.confirm("Confirm receipt? This releases payment to the seller.")) return;
    
    setConfirmingId(purchaseId);
    try {
      const response = await fetch(`/api/marketplace/purchases/${purchaseId}/confirm-receipt`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed');
      await fetchPurchases(pagination.page);
      setSelectedPurchase(null);
    } catch (error) {
      alert('Failed to confirm receipt');
    } finally {
      setConfirmingId(null);
    }
  };

  const getSellerName = (seller: Purchase["seller"]) => {
    if (seller?.account_type === "bicycle_store" && seller.business_name) return seller.business_name;
    return seller?.name || "Unknown";
  };

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout>
        <div className="min-h-screen bg-neutral-50 pt-16 pb-24 sm:pb-8">
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex gap-6">
              
              {/* Sidebar */}
              <div className="hidden lg:block w-60 flex-shrink-0">
                <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden sticky top-20">
                  {/* Search */}
                  <div className="p-4 border-b border-neutral-100">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                      <Input
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 border-neutral-200 rounded-lg h-9 text-sm"
                      />
                    </div>
                  </div>

                  {/* Sell/Buy Toggle */}
                  <div className="p-2 border-b border-neutral-100">
                    <div className="flex p-1 bg-neutral-100 rounded-lg">
                      <button
                        onClick={() => { setViewMode('selling'); setCategory('all'); }}
                        className={cn(
                          "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                          viewMode === 'selling' 
                            ? "bg-white text-neutral-900 shadow-sm" 
                            : "text-neutral-500 hover:text-neutral-700"
                        )}
                      >
                        Sell
                      </button>
                      <button
                        onClick={() => { setViewMode('buying'); setCategory('all'); }}
                        className={cn(
                          "flex-1 py-1.5 text-sm font-medium rounded-md transition-all",
                          viewMode === 'buying' 
                            ? "bg-white text-neutral-900 shadow-sm" 
                            : "text-neutral-500 hover:text-neutral-700"
                        )}
                      >
                        Buy
                      </button>
                    </div>
                  </div>

                  {/* Nav Items */}
                  <div className="p-2 space-y-0.5">
                    <NavItem icon={Mail} label="All" count={counts.all} isActive={category === 'all'} onClick={() => { setCategory('all'); setQuickFilter(null); }} />
                    <NavItem icon={Package} label="Active Orders" count={counts.active} isActive={category === 'active'} onClick={() => { setCategory('active'); setQuickFilter(null); }} />
                    <NavItem icon={DollarSign} label="Completed" count={counts.completed} isActive={category === 'completed'} onClick={() => { setCategory('completed'); setQuickFilter(null); }} />
                    <NavItem icon={AlertCircle} label="Disputes" count={counts.disputes} isActive={category === 'disputes'} onClick={() => { setCategory('disputes'); setQuickFilter(null); }} />
                    <NavItem icon={Archive} label="Archived" count={counts.archived} isActive={category === 'archived'} onClick={() => { setCategory('archived'); setQuickFilter(null); }} />
                  </div>
                </div>
              </div>

              {/* Main */}
              <div className="flex-1 min-w-0">
                {/* Mobile Header */}
                <div className="lg:hidden mb-4 bg-white rounded-xl border border-neutral-200 p-4">
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                    <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-10" />
                  </div>
                  <div className="flex p-1 bg-neutral-100 rounded-lg mb-3">
                    <button onClick={() => setViewMode('selling')} className={cn("flex-1 py-1.5 text-sm font-medium rounded-md", viewMode === 'selling' ? "bg-white shadow-sm" : "text-neutral-500")}>Sell</button>
                    <button onClick={() => setViewMode('buying')} className={cn("flex-1 py-1.5 text-sm font-medium rounded-md", viewMode === 'buying' ? "bg-white shadow-sm" : "text-neutral-500")}>Buy</button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(['all', 'active', 'completed', 'disputes'] as const).map((c) => (
                      <button key={c} onClick={() => setCategory(c)} className={cn("px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap", category === c ? "bg-amber-500 text-white" : "bg-neutral-100 text-neutral-600")}>{c.charAt(0).toUpperCase() + c.slice(1)}</button>
                    ))}
                  </div>
                </div>

                {/* Quick Filters */}
                <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1">
                  <FilterChip label="Awaiting Shipment" isActive={quickFilter === 'awaiting_shipment'} onClick={() => setQuickFilter(quickFilter === 'awaiting_shipment' ? null : 'awaiting_shipment')} />
                  <FilterChip label="In Transit" isActive={quickFilter === 'in_transit'} onClick={() => setQuickFilter(quickFilter === 'in_transit' ? null : 'in_transit')} />
                  <FilterChip label="Pending Confirmation" isActive={quickFilter === 'pending_confirmation'} onClick={() => setQuickFilter(quickFilter === 'pending_confirmation' ? null : 'pending_confirmation')} />
                  <div className="flex-1" />
                  <button onClick={handleRefresh} disabled={refreshing} className="p-2 bg-white border border-neutral-200 rounded-lg hover:bg-neutral-50">
                    <RefreshCw className={cn("h-4 w-4 text-neutral-500", refreshing && "animate-spin")} />
                  </button>
                </div>

                {/* Content */}
                <div className={cn("flex gap-6", selectedPurchase && "lg:flex-row")}>
                  <div className={cn("flex-1 min-w-0", selectedPurchase && "lg:max-w-[55%]")}>
                    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
                      <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
                        <div>
                          <h1 className="font-semibold text-neutral-900">
                            {viewMode === 'buying' ? 'My Purchases' : 'My Sales'}
                          </h1>
                          <p className="text-sm text-neutral-500">{pagination.total} {viewMode === 'buying' ? 'order' : 'sale'}{pagination.total !== 1 ? 's' : ''}</p>
                        </div>
                      </div>

                      {loading ? (
                        <div className="flex items-center justify-center py-16">
                          <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                        </div>
                      ) : purchases.length === 0 ? (
                        <EmptyState viewMode={viewMode} onAction={() => router.push(viewMode === 'selling' ? '/marketplace/sell' : '/marketplace')} />
                      ) : (
                        <div className="p-3 space-y-2">
                          {purchases.map((p) => (
                            <OrderCard
                              key={p.id}
                              purchase={p}
                              isSelected={selectedPurchase?.id === p.id}
                              onClick={() => setSelectedPurchase(selectedPurchase?.id === p.id ? null : p)}
                              getSellerName={getSellerName}
                              viewMode={viewMode}
                            />
                          ))}
                        </div>
                      )}

                      {pagination.totalPages > 1 && (
                        <div className="px-5 py-3 border-t border-neutral-100 flex items-center justify-between">
                          <span className="text-sm text-neutral-500">Page {pagination.page} of {pagination.totalPages}</span>
                          <div className="flex gap-1">
                            <button onClick={() => fetchPurchases(pagination.page - 1)} disabled={pagination.page <= 1} className="p-2 hover:bg-neutral-100 disabled:opacity-50 rounded-lg"><ChevronRight className="h-4 w-4 rotate-180" /></button>
                            <button onClick={() => fetchPurchases(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages} className="p-2 hover:bg-neutral-100 disabled:opacity-50 rounded-lg"><ChevronRight className="h-4 w-4" /></button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Desktop Detail */}
                  <AnimatePresence mode="wait">
                    {selectedPurchase && (
                      <motion.div
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "45%" }}
                        exit={{ opacity: 0, width: 0 }}
                        transition={{ duration: 0.2 }}
                        className="hidden lg:block"
                      >
                        <div className="sticky top-20">
                          <DetailPanel
                            purchase={selectedPurchase}
                            isOpen={true}
                            onClose={() => setSelectedPurchase(null)}
                            onViewProduct={(id) => router.push(`/marketplace/product/${id}`)}
                            onContactSeller={(id) => console.log(id)}
                            onConfirmReceipt={handleConfirmReceipt}
                            confirmingId={confirmingId}
                            getSellerName={getSellerName}
                            viewMode={viewMode}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MarketplaceLayout>

      {/* Mobile Detail */}
      <div className="lg:hidden">
        <DetailPanel
          purchase={selectedPurchase}
          isOpen={!!selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
          onViewProduct={(id) => router.push(`/marketplace/product/${id}`)}
          onContactSeller={(id) => console.log(id)}
          onConfirmReceipt={handleConfirmReceipt}
          confirmingId={confirmingId}
          getSellerName={getSellerName}
          viewMode={viewMode}
        />
      </div>
    </>
  );
}
