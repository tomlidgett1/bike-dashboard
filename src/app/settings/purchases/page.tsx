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
  ChevronsLeft,
  ChevronsRight,
  ShoppingBag,
  MoreHorizontal,
  ExternalLink,
  MessageCircle,
  HelpCircle,
  X,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Truck,
  MapPin,
  CreditCard,
  Receipt,
  ArrowRight,
  ChevronDown,
  Copy,
  Check,
  Store,
  Calendar,
  Shield,
  PackageCheck,
  CircleDot,
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

// Helper to normalize product data (handles both object and array responses from Supabase)
function normalizeProduct(product: any): Purchase['product'] | null {
  if (!product) return null;
  // If Supabase returns an array, take the first element
  if (Array.isArray(product)) {
    return product.length > 0 ? product[0] : null;
  }
  return product;
}

// Helper to get the best available image URL for a product
function getProductImageUrl(product: any): string | null {
  const p = normalizeProduct(product);
  if (!p) return null;
  
  // Priority: cached_image_url > primary_image_url > first image from images array
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
  // description is the main product name field
  return p.description || p.display_name || "Unknown Product";
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ============================================================
// Status Configuration
// ============================================================

const ORDER_STATUSES = ['pending', 'confirmed', 'paid', 'shipped', 'delivered'] as const;

const statusConfig: Record<string, { 
  label: string; 
  color: string; 
  bgColor: string; 
  borderColor: string;
  icon: React.ElementType;
  step: number;
}> = {
  pending: { 
    label: "Awaiting Confirmation", 
    color: "text-amber-600", 
    bgColor: "bg-amber-50", 
    borderColor: "border-amber-200",
    icon: Clock,
    step: 1 
  },
  confirmed: { 
    label: "Order Confirmed", 
    color: "text-blue-600", 
    bgColor: "bg-blue-50", 
    borderColor: "border-blue-200",
    icon: CheckCircle2,
    step: 2 
  },
  paid: { 
    label: "Payment Received", 
    color: "text-emerald-600", 
    bgColor: "bg-emerald-50", 
    borderColor: "border-emerald-200",
    icon: CreditCard,
    step: 3 
  },
  shipped: { 
    label: "On Its Way", 
    color: "text-violet-600", 
    bgColor: "bg-violet-50", 
    borderColor: "border-violet-200",
    icon: Truck,
    step: 4 
  },
  delivered: { 
    label: "Delivered", 
    color: "text-emerald-600", 
    bgColor: "bg-emerald-50", 
    borderColor: "border-emerald-200",
    icon: PackageCheck,
    step: 5 
  },
  cancelled: { 
    label: "Cancelled", 
    color: "text-gray-500", 
    bgColor: "bg-gray-50", 
    borderColor: "border-gray-200",
    icon: X,
    step: 0 
  },
  refunded: { 
    label: "Refunded", 
    color: "text-red-600", 
    bgColor: "bg-red-50", 
    borderColor: "border-red-200",
    icon: AlertTriangle,
    step: 0 
  },
};

// ============================================================
// Order Progress Timeline
// ============================================================

function OrderTimeline({ status, shippedAt, deliveredAt, purchaseDate }: { 
  status: string; 
  shippedAt: string | null;
  deliveredAt: string | null;
  purchaseDate: string;
}) {
  const currentStep = statusConfig[status]?.step || 0;
  const isCancelled = status === 'cancelled' || status === 'refunded';
  
  const steps = [
    { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
    { key: 'paid', label: 'Paid', icon: CreditCard },
    { key: 'shipped', label: 'Shipped', icon: Truck, date: shippedAt },
    { key: 'delivered', label: 'Delivered', icon: PackageCheck, date: deliveredAt },
  ];

  if (isCancelled) {
    return (
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-md border border-gray-200">
        <div className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full",
          status === 'cancelled' ? "bg-gray-100" : "bg-red-50"
        )}>
          {status === 'cancelled' ? (
            <X className="h-5 w-5 text-gray-500" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-red-500" />
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900">
            {status === 'cancelled' ? 'Order Cancelled' : 'Order Refunded'}
          </p>
          <p className="text-sm text-gray-500">
            {status === 'cancelled' 
              ? 'This order was cancelled' 
              : 'A refund has been issued for this order'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Progress Bar Background */}
      <div className="absolute top-5 left-5 right-5 h-0.5 bg-gray-200" />
      
      {/* Progress Bar Fill */}
      <motion.div 
        className="absolute top-5 left-5 h-0.5 bg-emerald-500"
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, ((currentStep - 2) / 3) * 100)}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      <div className="relative flex justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 2; // Steps start at 2 (confirmed)
          const isCompleted = currentStep >= stepNumber;
          const isCurrent = currentStep === stepNumber;
          const Icon = step.icon;

          return (
            <div key={step.key} className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1, duration: 0.3 }}
                className={cn(
                  "relative z-10 flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300",
                  isCompleted 
                    ? "bg-emerald-500 border-emerald-500" 
                    : isCurrent
                    ? "bg-white border-emerald-500"
                    : "bg-white border-gray-200"
                )}
              >
                {isCompleted ? (
                  <Check className="h-5 w-5 text-white" />
                ) : (
                  <Icon className={cn(
                    "h-5 w-5",
                    isCurrent ? "text-emerald-500" : "text-gray-300"
                  )} />
                )}
                {isCurrent && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-emerald-500"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    style={{ opacity: 0.5 }}
                  />
                )}
              </motion.div>
              <div className="mt-2 text-center">
                <p className={cn(
                  "text-xs font-medium",
                  isCompleted || isCurrent ? "text-gray-900" : "text-gray-400"
                )}>
                  {step.label}
                </p>
                {step.date && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {new Date(step.date).toLocaleDateString('en-AU', { 
                      day: 'numeric', 
                      month: 'short' 
                    })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Payment Breakdown Component
// ============================================================

function PaymentBreakdown({ purchase }: { purchase: Purchase }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Item price</span>
        <span className="font-medium text-gray-900">${purchase.item_price.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Shipping</span>
        <span className="font-medium text-gray-900">
          {purchase.shipping_cost === 0 ? (
            <span className="text-emerald-600">Free</span>
          ) : (
            `$${purchase.shipping_cost.toFixed(2)}`
          )}
        </span>
      </div>
      {purchase.tax_amount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">GST</span>
          <span className="font-medium text-gray-900">${purchase.tax_amount.toFixed(2)}</span>
        </div>
      )}
      <div className="h-px bg-gray-200 my-2" />
      <div className="flex justify-between">
        <span className="font-semibold text-gray-900">Total</span>
        <span className="font-bold text-gray-900 text-lg">${purchase.total_amount.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ============================================================
// Funds Status Badge
// ============================================================

function FundsStatusBadge({ purchase }: { purchase: Purchase }) {
  const funds_status = purchase.funds_status;
  const funds_release_at = purchase.funds_release_at;
  
  if (!funds_status) return null;
  
  const configs: Record<string, { 
    label: string; 
    color: string; 
    bgColor: string;
    icon: React.ElementType;
    description?: string;
  }> = {
    held: {
      label: 'In Escrow',
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      icon: Shield,
      description: funds_release_at 
        ? `Auto-releases ${new Date(funds_release_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`
        : undefined
    },
    released: {
      label: 'Released',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50',
      icon: CheckCircle2,
    },
    auto_released: {
      label: 'Auto Released',
      color: 'text-emerald-700',
      bgColor: 'bg-emerald-50',
      icon: CheckCircle2,
    },
    disputed: {
      label: 'Disputed',
      color: 'text-red-700',
      bgColor: 'bg-red-50',
      icon: AlertTriangle,
    },
    refunded: {
      label: 'Refunded',
      color: 'text-gray-700',
      bgColor: 'bg-gray-100',
      icon: X,
    },
  };

  const config = configs[funds_status];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 rounded-md",
      config.bgColor
    )}>
      <Icon className={cn("h-4 w-4", config.color)} />
      <div>
        <p className={cn("text-sm font-medium", config.color)}>{config.label}</p>
        {config.description && (
          <p className="text-xs text-gray-500">{config.description}</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Purchase Detail Panel
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

  const handleCopyOrderNumber = () => {
    if (!purchase) return;
    navigator.clipboard.writeText(purchase.order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!purchase) return null;

  const status = statusConfig[purchase.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const canConfirmReceipt = purchase.funds_status === 'held';
  const isConfirming = confirmingId === purchase.id;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile: Bottom Sheet */}
          <div className="lg:hidden">
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
              transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              className="fixed bottom-0 left-0 right-0 bg-white z-[101] rounded-t-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto pb-safe">
                <DetailContent 
                  purchase={purchase}
                  status={status}
                  StatusIcon={StatusIcon}
                  canConfirmReceipt={canConfirmReceipt}
                  isConfirming={isConfirming}
                  copied={copied}
                  onCopy={handleCopyOrderNumber}
                  onConfirmReceipt={onConfirmReceipt}
                  onViewProduct={onViewProduct}
                  onContactSeller={onContactSeller}
                  getSellerName={getSellerName}
                />
              </div>
            </motion.div>
          </div>

          {/* Desktop: Side Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            className="hidden lg:block"
          >
            <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden h-full">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <h3 className="font-semibold text-gray-900">Order Details</h3>
                <button 
                  onClick={onClose}
                  className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="overflow-y-auto max-h-[calc(100vh-200px)]">
                <DetailContent 
                  purchase={purchase}
                  status={status}
                  StatusIcon={StatusIcon}
                  canConfirmReceipt={canConfirmReceipt}
                  isConfirming={isConfirming}
                  copied={copied}
                  onCopy={handleCopyOrderNumber}
                  onConfirmReceipt={onConfirmReceipt}
                  onViewProduct={onViewProduct}
                  onContactSeller={onContactSeller}
                  getSellerName={getSellerName}
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Shared detail content for both mobile and desktop
function DetailContent({
  purchase,
  status,
  StatusIcon,
  canConfirmReceipt,
  isConfirming,
  copied,
  onCopy,
  onConfirmReceipt,
  onViewProduct,
  onContactSeller,
  getSellerName,
}: {
  purchase: Purchase;
  status: typeof statusConfig[string];
  StatusIcon: React.ElementType;
  canConfirmReceipt: boolean;
  isConfirming: boolean;
  copied: boolean;
  onCopy: () => void;
  onConfirmReceipt: (id: string) => void;
  onViewProduct: (id: string) => void;
  onContactSeller: (id: string) => void;
  getSellerName: (seller: Purchase["seller"]) => string;
}) {
  return (
    <div className="px-5 py-4 space-y-5">
      {/* Product Info */}
      <div className="flex gap-4">
        <div className="relative h-24 w-24 rounded-md overflow-hidden bg-gray-100 flex-shrink-0 ring-1 ring-gray-200">
          {getProductImageUrl(purchase.product) ? (
            <Image
              src={getProductImageUrl(purchase.product)!}
              alt={getProductName(purchase.product)}
              fill
              className="object-cover"
              sizes="96px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 line-clamp-2">
            {getProductName(purchase.product)}
          </h4>
          {(() => {
            const p = normalizeProduct(purchase.product);
            return p?.marketplace_category ? (
              <p className="text-sm text-gray-500 mt-1">
                {p.marketplace_category}
                {p.marketplace_subcategory && ` • ${p.marketplace_subcategory}`}
              </p>
            ) : null;
          })()}
          <div className="flex items-center gap-2 mt-2">
            <span className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border",
              status.color,
              status.bgColor,
              status.borderColor
            )}>
              <StatusIcon className="h-3.5 w-3.5" />
              {status.label}
            </span>
          </div>
        </div>
      </div>

      {/* Order Number */}
      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-600">Order</span>
          <span className="font-mono text-sm font-medium text-gray-900">
            #{purchase.order_number}
          </span>
        </div>
        <button 
          onClick={onCopy}
          className="p-1.5 rounded-md hover:bg-gray-200 transition-colors"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" />
          ) : (
            <Copy className="h-4 w-4 text-gray-400" />
          )}
        </button>
      </div>

      {/* Order Timeline */}
      <div>
        <h5 className="text-sm font-medium text-gray-700 mb-3">Order Progress</h5>
        <OrderTimeline 
          status={purchase.status}
          shippedAt={purchase.shipped_at}
          deliveredAt={purchase.delivered_at}
          purchaseDate={purchase.purchase_date}
        />
      </div>

      {/* Funds Status */}
      {purchase.funds_status && (
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-2">Payment Protection</h5>
          <FundsStatusBadge purchase={purchase} />
        </div>
      )}

      {/* Confirm Receipt Action */}
      {canConfirmReceipt && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-md border border-emerald-200"
        >
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 flex-shrink-0">
              <PackageCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-emerald-900">Received your item?</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                Confirm receipt to release payment to the seller
              </p>
              <Button
                onClick={() => onConfirmReceipt(purchase.id)}
                disabled={isConfirming}
                className="mt-3 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white"
                size="sm"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirm Receipt
                  </>
                )}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Payment Breakdown */}
      <div>
        <h5 className="text-sm font-medium text-gray-700 mb-3">Payment Summary</h5>
        <div className="p-4 bg-white rounded-md border border-gray-200">
          <PaymentBreakdown purchase={purchase} />
        </div>
      </div>

      {/* Seller Info */}
      <div>
        <h5 className="text-sm font-medium text-gray-700 mb-2">Seller</h5>
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200">
              {purchase.seller.account_type === 'bicycle_store' ? (
                <Store className="h-5 w-5 text-gray-600" />
              ) : (
                <span className="text-sm font-medium text-gray-600">
                  {getSellerName(purchase.seller).charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <p className="font-medium text-gray-900">{getSellerName(purchase.seller)}</p>
              {purchase.seller.account_type === 'bicycle_store' && (
                <p className="text-xs text-gray-500">Verified Store</p>
              )}
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="rounded-md"
            onClick={() => onContactSeller(purchase.seller_id)}
          >
            <MessageCircle className="h-4 w-4 mr-1.5" />
            Message
          </Button>
        </div>
      </div>

      {/* Purchase Date */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Calendar className="h-4 w-4" />
        <span>
          Purchased {new Date(purchase.purchase_date).toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          className="flex-1 rounded-md"
          onClick={() => onViewProduct(purchase.product_id)}
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          View Product
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-md"
          onClick={() => {}}
        >
          <HelpCircle className="h-4 w-4 mr-2" />
          Get Help
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Purchase Card Component
// ============================================================

interface PurchaseCardProps {
  purchase: Purchase;
  isSelected: boolean;
  onClick: () => void;
  formatDate: (date: string) => string;
  getSellerName: (seller: Purchase["seller"]) => string;
  index: number;
}

function PurchaseCard({
  purchase,
  isSelected,
  onClick,
  formatDate,
  getSellerName,
  index,
}: PurchaseCardProps) {
  const status = statusConfig[purchase.status] || statusConfig.pending;
  const StatusIcon = status.icon;

  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ 
        delay: Math.min(index * 0.05, 0.3), 
        duration: 0.4,
        ease: [0.04, 0.62, 0.23, 0.98]
      }}
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 rounded-md border transition-all duration-200 group",
        isSelected 
          ? "bg-gray-50 border-gray-300 ring-1 ring-gray-300" 
          : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
      )}
    >
      <div className="flex gap-4">
        {/* Product Image */}
        <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-md overflow-hidden bg-gray-100 flex-shrink-0 ring-1 ring-gray-200">
          {getProductImageUrl(purchase.product) ? (
            <Image
              src={getProductImageUrl(purchase.product)!}
              alt={getProductName(purchase.product)}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 80px, 96px"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 line-clamp-2 group-hover:text-gray-800">
                {getProductName(purchase.product)}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">
                From {getSellerName(purchase.seller)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-semibold text-gray-900">${purchase.total_amount.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatDate(purchase.purchase_date)}</p>
            </div>
          </div>

          {/* Status & Order Number */}
          <div className="flex items-center gap-2 mt-3">
            <span className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-md border",
              status.color,
              status.bgColor,
              status.borderColor
            )}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </span>
            <span className="text-xs text-gray-400">#{purchase.order_number}</span>
          </div>

          {/* Escrow Indicator */}
          {purchase.funds_status === 'held' && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
              <Shield className="h-3 w-3" />
              <span>Protected • Confirm when received</span>
            </div>
          )}
        </div>

        {/* Chevron */}
        <div className="hidden sm:flex items-center">
          <ChevronRight className={cn(
            "h-5 w-5 text-gray-300 transition-all duration-200",
            isSelected ? "text-gray-500 translate-x-0.5" : "group-hover:text-gray-400"
          )} />
        </div>
      </div>
    </motion.button>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-16 sm:py-24 px-4"
    >
      {/* Illustration */}
      <div className="relative mb-6">
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
          className="relative"
        >
          {/* Background circles */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-32 h-32 rounded-full bg-gray-100" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="w-24 h-24 rounded-full bg-gray-50"
            />
          </div>
          
          {/* Icon */}
          <div className="relative flex items-center justify-center w-32 h-32">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-white shadow-sm border border-gray-200">
              <ShoppingBag className="h-8 w-8 text-gray-400" />
            </div>
          </div>
        </motion.div>

        {/* Floating elements */}
        <motion.div
          animate={{ y: [-5, 5, -5] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"
        >
          <Package className="h-4 w-4 text-emerald-500" />
        </motion.div>
        <motion.div
          animate={{ y: [5, -5, 5] }}
          transition={{ duration: 3.5, repeat: Infinity }}
          className="absolute -bottom-1 -left-3 w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center"
        >
          <Truck className="h-3 w-3 text-violet-500" />
        </motion.div>
      </div>

      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        No purchases yet
      </h3>
      <p className="text-gray-500 text-center max-w-sm mb-6">
        When you buy items from the marketplace, they'll appear here so you can track your orders.
      </p>

      <Button
        onClick={onBrowse}
        className="rounded-md bg-gray-900 hover:bg-gray-800 text-white px-6"
      >
        <ShoppingBag className="h-4 w-4 mr-2" />
        Browse Marketplace
      </Button>
    </motion.div>
  );
}

// ============================================================
// Filters Component
// ============================================================

function FiltersBar({
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
}) {
  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          type="text"
          placeholder="Search purchases..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 rounded-md bg-white"
        />
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
          <SelectTrigger className="flex-1 sm:w-[160px] sm:flex-none rounded-md bg-white">
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

        <Button
          variant="outline"
          size="icon"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-md bg-white"
        >
          <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
        </Button>
      </div>

      {/* Results Count */}
      <p className="text-sm text-gray-500">
        {purchasesCount === totalPurchases 
          ? `${totalPurchases} purchase${totalPurchases === 1 ? '' : 's'}`
          : `Showing ${purchasesCount} of ${totalPurchases}`
        }
      </p>
    </div>
  );
}

// ============================================================
// Pagination Component
// ============================================================

function Pagination({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: PaginationInfo;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: string) => void;
}) {
  const canGoPrevious = pagination.page > 1;
  const canGoNext = pagination.page < pagination.totalPages;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4">
      {/* Page Size - Hidden on mobile */}
      <div className="hidden sm:flex items-center gap-2">
        <span className="text-sm text-gray-600">Show:</span>
        <Select
          value={pagination.pageSize.toString()}
          onValueChange={onPageSizeChange}
        >
          <SelectTrigger className="w-[70px] rounded-md bg-white h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Page Controls */}
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
        const data = await response.json();

        if (!response.ok) {
          console.error("Purchases API error:", data);
          throw new Error(data.error || "Failed to fetch purchases");
        }
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

  const handleViewProduct = (productId: string) => {
    router.push(`/marketplace/product/${productId}`);
  };

  const handleContactSeller = (sellerId: string) => {
    console.log("Contact seller:", sellerId);
    // router.push(`/messages?user=${sellerId}`);
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
        <div className="min-h-screen bg-gray-50 pt-16 sm:pt-16 pb-24 sm:pb-8">
          {/* Page Header */}
          <div className="bg-white border-b border-gray-200">
            <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
              <div className="flex items-center gap-4">
                <div className="flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 shadow-lg">
                  <ShoppingBag className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                    My Purchases
                  </h1>
                  <p className="text-sm sm:text-base text-gray-500 mt-0.5">
                    Track and manage your orders
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="px-4 sm:px-6 lg:px-8 py-6">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">Loading your purchases...</p>
                </div>
              </div>
            ) : purchases.length === 0 && !search && statusFilter === 'all' ? (
              <EmptyState onBrowse={() => router.push("/marketplace")} />
            ) : (
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Purchase List */}
                <div className={cn(
                  "flex-1 transition-all duration-300",
                  selectedPurchase ? "lg:w-[55%]" : "lg:w-full"
                )}>
                  {/* Filters */}
                  <div className="mb-4">
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
                  </div>

                  {/* Purchase Cards */}
                  {purchases.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500">No purchases found matching your filters</p>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setSearch("");
                          setStatusFilter("all");
                        }}
                        className="mt-2 text-gray-600"
                      >
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {purchases.map((purchase, index) => (
                        <PurchaseCard
                          key={purchase.id}
                          purchase={purchase}
                          isSelected={selectedPurchase?.id === purchase.id}
                          onClick={() => setSelectedPurchase(
                            selectedPurchase?.id === purchase.id ? null : purchase
                          )}
                          formatDate={formatDate}
                          getSellerName={getSellerName}
                          index={index}
                        />
                      ))}
                    </div>
                  )}

                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <Pagination
                      pagination={pagination}
                      onPageChange={(page) => fetchPurchases(page)}
                      onPageSizeChange={handlePageSizeChange}
                    />
                  )}
                </div>

                {/* Detail Panel (Desktop) */}
                <AnimatePresence mode="wait">
                  {selectedPurchase && (
                    <motion.div
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "45%" }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
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
            )}
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
