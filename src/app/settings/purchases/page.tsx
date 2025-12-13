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
  Truck,
  Copy,
  Check,
  Store,
  Shield,
  MoreHorizontal,
  Tag,
  FileText,
  Eye,
  Edit3,
  Trash2,
  Archive,
  Plus,
  Filter,
  Clock,
  DollarSign,
  AlertCircle,
  LifeBuoy,
  CreditCard,
  MapPin,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import Image from "next/image";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { EditProductDrawer } from "@/components/marketplace/edit-product-drawer";
import { OrderHelpWizard, TicketCard, MobileTicketCard, TicketDetailSheet, TicketStatusBadge } from "@/components/support";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ============================================================
// Types
// ============================================================

interface ShippingAddress {
  name?: string;
  phone?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

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
  shipping_address?: ShippingAddress | null;
  shipping_method?: string | null;
  tracking_number?: string | null;
  buyer_phone?: string | null;
  buyer_email?: string | null;
  seller_notes?: string | null;
  product: any;
  seller: any;
  buyer?: any;
}

interface OrderEvent {
  id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  event_data: Record<string, any> | null;
  triggered_by: string | null;
  triggered_by_role: string | null;
  created_at: string;
}

interface Listing {
  id: string;
  description: string;
  display_name: string | null;
  price: number;
  primary_image_url: string | null;
  cached_image_url?: string | null;
  images?: any[];
  listing_status: string;
  created_at: string;
  sold_at: string | null;
  marketplace_category: string;
}

interface Draft {
  id: string;
  draft_name: string | null;
  form_data: any;
  current_step: number;
  last_saved_at: string;
  completed: boolean;
}

interface SupportTicket {
  id: string;
  ticket_number: string;
  purchase_id: string;
  category: string;
  subcategory?: string;
  status: string;
  priority: string;
  subject: string;
  description: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  messageCount?: number;
  purchases?: {
    id: string;
    order_number: string;
    product?: {
      id: string;
      display_name?: string;
      description?: string;
      primary_image_url?: string;
      cached_image_url?: string;
    };
  };
  purchase?: {
    id: string;
    order_number: string;
    product?: {
      id: string;
      display_name?: string;
      description?: string;
      primary_image_url?: string;
      cached_image_url?: string;
    };
  };
  product?: {
    id: string;
    display_name?: string;
    description?: string;
    primary_image_url?: string;
    cached_image_url?: string;
  };
}

type MainTab = 'orders' | 'listings' | 'drafts' | 'claims';
type OrderMode = 'all' | 'buying' | 'selling';

// Extended purchase with order type for 'all' view
interface CombinedOrder extends Purchase {
  orderType: 'buying' | 'selling';
}

// ============================================================
// Helpers
// ============================================================

function normalizeProduct(product: any): any {
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

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function formatDateFull(date: string): string {
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getListingImage(listing: Listing): string | null {
  if (listing.cached_image_url) return listing.cached_image_url;
  if (listing.primary_image_url) return listing.primary_image_url;
  if (listing.images && listing.images.length > 0) {
    const img = listing.images[0];
    if (typeof img === 'string') return img;
    if (img?.url) return img.url;
  }
  return null;
}

function getEventDisplay(event: OrderEvent): { icon: React.ComponentType<{ className?: string }>; label: string; color: string } {
  const eventConfig: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
    created: { 
      icon: ShoppingBag, 
      label: 'Order Created', 
      color: 'bg-gray-500' 
    },
    status_changed: { 
      icon: (() => {
        if (event.new_status === 'paid') return CreditCard;
        if (event.new_status === 'shipped') return Truck;
        if (event.new_status === 'delivered') return Package;
        if (event.new_status === 'cancelled') return XCircle;
        return Clock;
      })(),
      label: (() => {
        if (event.new_status === 'paid') return 'Payment Received';
        if (event.new_status === 'shipped') return 'Order Shipped';
        if (event.new_status === 'delivered') return 'Order Delivered';
        if (event.new_status === 'cancelled') return 'Order Cancelled';
        if (event.new_status === 'refunded') return 'Order Refunded';
        return `Status: ${event.new_status}`;
      })(),
      color: (() => {
        if (event.new_status === 'paid') return 'bg-green-500';
        if (event.new_status === 'shipped') return 'bg-blue-500';
        if (event.new_status === 'delivered') return 'bg-green-600';
        if (event.new_status === 'cancelled') return 'bg-red-500';
        return 'bg-gray-500';
      })()
    },
    tracking_added: { 
      icon: MapPin, 
      label: 'Tracking Number Added', 
      color: 'bg-blue-500' 
    },
    receipt_confirmed: { 
      icon: CheckCircle2, 
      label: 'Receipt Confirmed', 
      color: 'bg-green-600' 
    },
    funds_auto_released: { 
      icon: Shield, 
      label: 'Funds Auto-Released', 
      color: 'bg-green-600' 
    },
  };

  const config = eventConfig[event.event_type];
  if (config) return config;

  // Default fallback
  return { 
    icon: Clock, 
    label: event.event_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), 
    color: 'bg-gray-500' 
  };
}

// ============================================================
// Status Badge Component
// ============================================================

function StatusBadge({ 
  status, 
  type = 'order',
  fundsStatus,
  shippedAt,
}: { 
  status: string; 
  type?: 'order' | 'listing';
  fundsStatus?: string | null;
  shippedAt?: string | null;
}) {
  // For delivered orders or orders where funds have been released - show "Received ✓"
  if (type === 'order' && (status === 'delivered' || fundsStatus === 'released' || fundsStatus === 'auto_released')) {
    return (
      <Badge variant="default" className="rounded-md bg-green-600 hover:bg-green-600 text-white gap-1">
        <Check className="h-3 w-3" />
        Received
      </Badge>
    );
  }

  // For orders with held funds that are shipped - show "Confirm Receipt"
  if (type === 'order' && fundsStatus === 'held' && status === 'shipped') {
    return <Badge variant="default" className="rounded-md bg-amber-500 hover:bg-amber-500">Confirm Receipt</Badge>;
  }

  // For paid orders that haven't shipped yet - show "Waiting Shipment"
  if (type === 'order' && status === 'paid' && !shippedAt) {
    return <Badge variant="default" className="rounded-md bg-amber-500 hover:bg-amber-500 text-white">Waiting Shipment</Badge>;
  }

  const orderVariants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    pending: { label: "Pending", variant: "secondary" },
    confirmed: { label: "Confirmed", variant: "secondary" },
    paid: { label: "Paid", variant: "default" },
    shipped: { label: "Shipped", variant: "default", className: "bg-blue-600 hover:bg-blue-600 text-white" },
    delivered: { label: "Delivered", variant: "default", className: "bg-green-600 hover:bg-green-600 text-white" },
    cancelled: { label: "Cancelled", variant: "outline" },
    refunded: { label: "Refunded", variant: "destructive" },
  };

  const listingVariants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
    active: { label: "Active", variant: "default" },
    sold: { label: "Sold", variant: "secondary" },
    archived: { label: "Archived", variant: "outline" },
    draft: { label: "Draft", variant: "outline" },
  };

  const variants = type === 'listing' ? listingVariants : orderVariants;
  const config = variants[status] || { label: status, variant: "outline" as const };
  
  return <Badge variant={config.variant} className={cn("rounded-md", config.className)}>{config.label}</Badge>;
}

// ============================================================
// Mobile Bottom Navigation
// ============================================================

function MobileBottomNav({ 
  activeTab, 
  onTabChange,
  orderCount,
  listingCount,
  draftCount,
  claimsCount,
}: { 
  activeTab: MainTab; 
  onTabChange: (tab: MainTab) => void;
  orderCount: number;
  listingCount: number;
  draftCount: number;
  claimsCount: number;
}) {
  // Only show Orders and Claims on mobile
  const tabs = [
    { id: 'orders' as MainTab, label: 'Orders', icon: ShoppingBag, count: orderCount },
    { id: 'claims' as MainTab, label: 'Claims', icon: LifeBuoy, count: claimsCount },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border sm:hidden safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors cursor-pointer",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {tab.count > 0 && (
                  <span className="absolute -top-1 -right-2 bg-primary text-primary-foreground text-[10px] font-medium rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    {tab.count > 99 ? '99+' : tab.count}
                  </span>
                )}
              </div>
              <span className="text-[11px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Mobile Order Card
// ============================================================

// Mobile Combined Order Card (for 'all' view)
function MobileCombinedOrderCard({
  order,
  onClick,
  accentColor = 'border-l-gray-400',
}: {
  order: CombinedOrder;
  onClick: () => void;
  accentColor?: string;
}) {
  const productImage = getProductImageUrl(order.product);
  const productName = getProductName(order.product);
  const otherParty = order.orderType === 'buying' 
    ? (order.seller?.business_name || order.seller?.name || 'Seller')
    : (order.buyer?.name || 'Buyer');

  // Determine what action the user needs to take
  // If funds are released, no action needed - order is complete
  const isComplete = order.funds_status === 'released' || order.funds_status === 'auto_released';
  
  const actionText = isComplete
    ? null
    : order.orderType === 'selling' && order.status === 'paid' && !order.shipped_at
    ? 'Ship this order'
    : order.orderType === 'buying' && order.status === 'shipped' && order.funds_status === 'held'
    ? 'Confirm receipt'
    : order.orderType === 'buying' && order.status === 'paid' && !order.shipped_at
    ? 'Waiting for shipment'
    : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left bg-card rounded-md border border-border p-3 active:bg-accent transition-colors cursor-pointer",
        "border-l-4",
        accentColor
      )}
    >
      <div className="flex gap-3">
        {/* Image */}
        <div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {productImage ? (
            <Image src={productImage} alt={productName} fill className="object-cover" sizes="48px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-medium text-sm line-clamp-1 flex-1">{productName}</p>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">
              {order.orderType === 'buying' ? 'Buying' : 'Selling'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {otherParty} · {formatDate(order.purchase_date)}
          </p>
          <div className="flex items-center justify-between mt-1.5">
            {actionText ? (
              <span className="text-xs text-muted-foreground">
                {actionText}
              </span>
            ) : (
              <StatusBadge status={order.status} fundsStatus={order.funds_status} shippedAt={order.shipped_at} />
            )}
            <span className="font-semibold text-sm">${order.total_amount.toFixed(2)}</span>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 text-muted-foreground self-center flex-shrink-0" />
      </div>
    </button>
  );
}

function MobileOrderCard({
  purchase,
  onClick,
  orderMode,
}: {
  purchase: Purchase;
  onClick: () => void;
  orderMode: OrderMode;
}) {
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);
  const otherParty = orderMode === 'buying' 
    ? (purchase.seller?.business_name || purchase.seller?.name || 'Seller')
    : (purchase.buyer?.name || 'Buyer');

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card rounded-md border border-border p-3 active:bg-accent transition-colors cursor-pointer"
    >
      <div className="flex gap-3">
        {/* Image */}
        <div className="relative h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {productImage ? (
            <Image src={productImage} alt={productName} fill className="object-cover" sizes="64px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm line-clamp-1">{productName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {otherParty} · {formatDate(purchase.purchase_date)}
          </p>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5">
              <StatusBadge status={purchase.status} fundsStatus={purchase.funds_status} shippedAt={purchase.shipped_at} />
              {orderMode === 'buying' && (
                <>
                  {purchase.status === 'paid' && !purchase.shipped_at && 
                   purchase.funds_status !== 'released' && purchase.funds_status !== 'auto_released' && (
                    <Clock className="h-4 w-4 text-amber-600" />
                  )}
                  {purchase.status === 'shipped' && 
                   purchase.funds_status !== 'released' && purchase.funds_status !== 'auto_released' && (
                    <Truck className="h-4 w-4 text-blue-600" />
                  )}
                </>
              )}
            </div>
            <span className="font-semibold text-sm">${purchase.total_amount.toFixed(2)}</span>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 text-muted-foreground self-center flex-shrink-0" />
      </div>
    </button>
  );
}

// ============================================================
// Mobile Listing Card
// ============================================================

function MobileListingCard({
  listing,
  onClick,
  onEdit,
  onArchive,
  onDelete,
}: {
  listing: Listing;
  onClick: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const imageUrl = getListingImage(listing);
  const status = listing.sold_at ? 'sold' : (listing.listing_status || 'active');

  return (
    <div className="bg-card rounded-md border border-border p-3">
      <div className="flex gap-3">
        <button onClick={onClick} className="relative h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0 cursor-pointer">
          {imageUrl ? (
            <Image src={imageUrl} alt={listing.description} fill className="object-cover" sizes="64px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Tag className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </button>

        <button onClick={onClick} className="flex-1 min-w-0 text-left cursor-pointer">
          <p className="font-medium text-sm line-clamp-1">{listing.display_name || listing.description}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {listing.marketplace_category} · {formatDate(listing.created_at)}
          </p>
          <div className="flex items-center justify-between mt-2">
            <StatusBadge status={status} type="listing" />
            <span className="font-semibold text-sm">${listing.price.toFixed(2)}</span>
          </div>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="self-center flex-shrink-0">
              <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onClick}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}><Edit3 className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="h-4 w-4 mr-2" />
              {listing.listing_status === 'archived' ? 'Unarchive' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" />Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ============================================================
// Mobile Draft Card
// ============================================================

function MobileDraftCard({
  draft,
  onContinue,
  onDelete,
}: {
  draft: Draft;
  onContinue: () => void;
  onDelete: () => void;
}) {
  const imageUrl = draft.form_data?.images?.[0]?.url || draft.form_data?.primaryImage;
  const title = draft.draft_name || draft.form_data?.title || 'Untitled Draft';
  const progress = Math.round((draft.current_step / 5) * 100);

  return (
    <div className="bg-card rounded-md border border-border p-3">
      <div className="flex gap-3">
        <div className="relative h-14 w-14 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {imageUrl ? (
            <Image src={imageUrl} alt={title} fill className="object-cover" sizes="56px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm line-clamp-1">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last edited {formatDate(draft.last_saved_at)}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <Button size="sm" className="flex-1 h-9" onClick={onContinue}>
          <Edit3 className="h-4 w-4 mr-1.5" />
          Continue
        </Button>
        <Button size="sm" variant="outline" className="h-9" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Order Detail Sheet Content
// ============================================================

function OrderDetailContent({
  purchase,
  orderMode,
  onViewProduct,
  onConfirmReceipt,
  onMessage,
  confirmingId,
  onGetHelp,
  onRefresh,
}: {
  purchase: Purchase;
  orderMode: OrderMode;
  onViewProduct: (id: string) => void;
  onConfirmReceipt: (id: string) => void;
  onMessage: () => void;
  confirmingId: string | null;
  onGetHelp?: () => void;
  onRefresh?: () => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const [trackingNumber, setTrackingNumber] = React.useState(purchase.tracking_number || '');
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [events, setEvents] = React.useState<OrderEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);
  const canConfirm = purchase.funds_status === 'held' && orderMode === 'buying';
  const isConfirming = confirmingId === purchase.id;

  // Fetch order events
  React.useEffect(() => {
    const fetchEvents = async () => {
      setLoadingEvents(true);
      try {
        const response = await fetch(`/api/marketplace/purchases/${purchase.id}/events`);
        if (response.ok) {
          const data = await response.json();
          setEvents(data.events || []);
        }
      } catch (error) {
        console.error('Failed to fetch order events:', error);
      } finally {
        setLoadingEvents(false);
      }
    };
    fetchEvents();
  }, [purchase.id]);

  // Parse shipping address if it's a string
  const shippingAddress = React.useMemo(() => {
    if (!purchase.shipping_address) return null;
    
    // If it's already an object, return it
    if (typeof purchase.shipping_address === 'object') {
      return purchase.shipping_address as ShippingAddress;
    }
    
    // If it's a string, try to parse it
    if (typeof purchase.shipping_address === 'string') {
      try {
        return JSON.parse(purchase.shipping_address) as ShippingAddress;
      } catch (e) {
        console.error('Failed to parse shipping address:', e);
        return null;
      }
    }
    
    return null;
  }, [purchase.shipping_address]);

  const handleCopy = () => {
    navigator.clipboard.writeText(purchase.order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStatusUpdate = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const response = await fetch(`/api/marketplace/purchases?id=${purchase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status: newStatus,
          tracking_number: trackingNumber || null
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      onRefresh?.();
    } catch (e) {
      console.error('Error updating status:', e);
      alert('Failed to update order status. Please try again.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const otherParty = orderMode === 'buying'
    ? (purchase.seller?.business_name || purchase.seller?.name || 'Seller')
    : (purchase.buyer?.name || 'Buyer');

  return (
    <div className="space-y-6 pb-6">
      {/* Product */}
      <div className="flex gap-4">
        <div className="relative h-20 w-20 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {productImage ? (
            <Image src={productImage} alt={productName} fill className="object-cover" sizes="80px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium">{productName}</p>
          <StatusBadge status={purchase.status} fundsStatus={purchase.funds_status} shippedAt={purchase.shipped_at} />
        </div>
      </div>

      <Separator />

      {/* Order Info */}
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Order #</span>
          <div className="flex items-center gap-2">
            <code className="text-sm">{purchase.order_number}</code>
            <Button variant="ghost" size="icon-sm" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">Date</span>
          <span className="text-sm">{formatDateFull(purchase.purchase_date)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-muted-foreground">{orderMode === 'buying' ? 'Seller' : 'Buyer'}</span>
          <span className="text-sm">{otherParty}</span>
        </div>
      </div>

      <Separator />

      {/* Payment */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment</h4>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Item</span>
          <span>${purchase.item_price.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Shipping</span>
          <span>{purchase.shipping_cost === 0 ? 'Free' : `$${purchase.shipping_cost.toFixed(2)}`}</span>
        </div>
        {purchase.tax_amount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">GST</span>
            <span>${purchase.tax_amount.toFixed(2)}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>${purchase.total_amount.toFixed(2)}</span>
        </div>
      </div>

      {/* Shipping Address - For Sellers */}
      {orderMode === 'selling' && shippingAddress && (
        <>
          <Separator />
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shipping Address</h4>
            <div className="p-3 bg-white rounded-md border border-gray-200 text-sm space-y-1">
              {shippingAddress.name && (
                <p className="font-medium text-gray-900">{shippingAddress.name}</p>
              )}
              {shippingAddress.phone && (
                <p className="text-gray-600">{shippingAddress.phone}</p>
              )}
              {shippingAddress.line1 && <p className="text-gray-700">{shippingAddress.line1}</p>}
              {shippingAddress.line2 && <p className="text-gray-700">{shippingAddress.line2}</p>}
              {(shippingAddress.city || shippingAddress.state || shippingAddress.postal_code) && (
                <p className="text-gray-700">
                  {[shippingAddress.city, shippingAddress.state, shippingAddress.postal_code]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              )}
              {shippingAddress.country && (
                <p className="text-gray-700">{shippingAddress.country}</p>
              )}
            </div>
            {purchase.buyer_email && (
              <div className="pt-2">
                <p className="text-xs text-muted-foreground mb-1">Buyer Email</p>
                <p className="text-sm font-medium">{purchase.buyer_email}</p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Order Status Management - For Sellers */}
      {orderMode === 'selling' && ['paid', 'shipped'].includes(purchase.status) && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Order Management</h4>
            
            {/* Tracking Number Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Tracking Number</label>
              <Input
                placeholder="Enter tracking number (optional)"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                disabled={updatingStatus}
              />
            </div>

            {/* Status Update Buttons */}
            <div className="space-y-2">
              {purchase.status === 'paid' && (
                <Button
                  onClick={() => handleStatusUpdate('shipped')}
                  disabled={updatingStatus}
                  className="w-full"
                >
                  {updatingStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Truck className="h-4 w-4 mr-2" />}
                  Mark as Shipped
                </Button>
              )}
              {purchase.status === 'shipped' && (
                <Button
                  onClick={() => handleStatusUpdate('delivered')}
                  disabled={updatingStatus}
                  className="w-full"
                >
                  {updatingStatus ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Mark as Delivered
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Waiting Shipment - For Buyers (Paid but not shipped, and not yet confirmed receipt) */}
      {orderMode === 'buying' && purchase.status === 'paid' && !purchase.shipped_at && 
       purchase.funds_status !== 'released' && purchase.funds_status !== 'auto_released' && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shipping Status</h4>
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-md border border-amber-100">
              <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900">Waiting Shipment</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Seller is preparing your order for shipment
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Shipping Status - For Buyers (Shipped/Delivered) */}
      {orderMode === 'buying' && ['shipped', 'delivered'].includes(purchase.status) && (
        <>
          <Separator />
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Shipping Information</h4>
            
            {/* Shipped Status */}
            {purchase.shipped_at && (
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-md border border-blue-100">
                <Truck className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">
                    {purchase.status === 'delivered' ? 'Delivered' : 'Order Shipped'}
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Shipped on {formatDateFull(purchase.shipped_at)}
                  </p>
                  {purchase.status === 'delivered' && purchase.delivered_at && (
                    <p className="text-xs text-blue-700 mt-0.5">
                      Delivered on {formatDateFull(purchase.delivered_at)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Tracking Number */}
            {purchase.tracking_number && (
              <div className="p-3 bg-white rounded-md border border-gray-200">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tracking Number</p>
                <div className="flex items-center justify-between">
                  <code className="text-sm font-medium">{purchase.tracking_number}</code>
                  <Button 
                    variant="ghost" 
                    size="icon-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(purchase.tracking_number || '');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            {/* Shipping Method */}
            {purchase.shipping_method && (
              <div className="text-sm">
                <span className="text-muted-foreground">Shipping Method: </span>
                <span className="font-medium">{purchase.shipping_method}</span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Escrow */}
      {purchase.funds_status === 'held' && (
        <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Payment Protected</p>
            {purchase.funds_release_at && (
              <p className="text-xs text-muted-foreground">
                Auto-releases {formatDateFull(purchase.funds_release_at)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Order Timeline */}
      <Separator />
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Order Timeline</h4>
        {loadingEvents ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No events recorded</p>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-gray-200" />
            
            <div className="space-y-4">
              {events.map((event, index) => {
                const { icon: EventIcon, label, color } = getEventDisplay(event);
                const isLast = index === events.length - 1;
                
                return (
                  <div key={event.id} className="relative flex gap-3">
                    {/* Timeline dot */}
                    <div className={cn(
                      "relative z-10 flex h-4 w-4 items-center justify-center rounded-full",
                      isLast ? color : "bg-gray-300"
                    )}>
                      <EventIcon className="h-2.5 w-2.5 text-white" />
                    </div>
                    
                    {/* Event content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <p className="text-sm font-medium text-gray-900">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateFull(event.created_at)}
                      </p>
                      {event.event_data?.tracking_number && (
                        <p className="text-xs text-gray-600 mt-0.5">
                          Tracking: {event.event_data.tracking_number}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      {canConfirm && (
        <Button className="w-full" onClick={() => onConfirmReceipt(purchase.id)} disabled={isConfirming}>
          {isConfirming ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {isConfirming ? 'Confirming...' : 'Confirm Receipt'}
        </Button>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => onViewProduct(purchase.product_id)}>
          <ExternalLink className="h-4 w-4 mr-2" />
          View Product
        </Button>
        <Button variant="outline" onClick={onMessage}>
          <MessageCircle className="h-4 w-4 mr-2" />
          Message
        </Button>
      </div>

      {/* Get Help Button (for buyers) */}
      {orderMode === 'buying' && onGetHelp && (
        <Button 
          variant="outline" 
          className="w-full mt-2 border-amber-300 text-amber-700 hover:bg-amber-50"
          onClick={onGetHelp}
        >
          <HelpCircle className="h-4 w-4 mr-2" />
          Get Help with This Order
        </Button>
      )}
    </div>
  );
}

// ============================================================
// Desktop Orders Table
// ============================================================

function DesktopOrdersTable({
  orders,
  orderMode,
  onRowClick,
  onViewProduct,
  onMessage,
  onGetHelp,
  loading,
}: {
  orders: Purchase[];
  orderMode: OrderMode;
  onRowClick: (order: Purchase) => void;
  onViewProduct: (productId: string) => void;
  onMessage: (order: Purchase) => void;
  onGetHelp: (order: Purchase) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-medium">No orders yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          {orderMode === 'buying' ? "Orders you've made will appear here" : "Orders you receive will appear here"}
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12"><Checkbox /></TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Product</TableHead>
          <TableHead>{orderMode === 'buying' ? 'Seller' : 'Buyer'}</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => {
          const productImage = getProductImageUrl(order.product);
          const productName = getProductName(order.product);
          const otherParty = orderMode === 'buying'
            ? (order.seller?.business_name || order.seller?.name || 'Seller')
            : (order.buyer?.name || 'Buyer');

          return (
            <TableRow key={order.id} className="cursor-pointer" onClick={() => onRowClick(order)}>
              <TableCell onClick={(e) => e.stopPropagation()}><Checkbox /></TableCell>
              <TableCell className="font-mono text-sm">#{order.order_number}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted">
                    {productImage ? (
                      <Image src={productImage} alt={productName} fill className="object-cover" sizes="40px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Package className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <span className="font-medium truncate max-w-[200px]">{productName}</span>
                </div>
              </TableCell>
              <TableCell>{otherParty}</TableCell>
              <TableCell>{formatDate(order.purchase_date)}</TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <StatusBadge status={order.status} fundsStatus={order.funds_status} shippedAt={order.shipped_at} />
                  {orderMode === 'buying' && (
                    <>
                      {order.status === 'paid' && !order.shipped_at && 
                       order.funds_status !== 'released' && order.funds_status !== 'auto_released' && (
                        <Clock className="h-4 w-4 text-amber-600" />
                      )}
                      {order.status === 'shipped' && 
                       order.funds_status !== 'released' && order.funds_status !== 'auto_released' && (
                        <Truck className="h-4 w-4 text-blue-600" />
                      )}
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">${order.total_amount.toFixed(2)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRowClick(order)}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onViewProduct(order.product_id)}><ExternalLink className="h-4 w-4 mr-2" />View Product</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onMessage(order)}><MessageCircle className="h-4 w-4 mr-2" />Message</DropdownMenuItem>
                    {orderMode === 'buying' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onGetHelp(order)}>
                          <HelpCircle className="h-4 w-4 mr-2" />Get Help
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ============================================================
// Desktop Listings Table
// ============================================================

function DesktopListingsTable({
  listings,
  onRowClick,
  onEdit,
  onArchive,
  onDelete,
  loading,
}: {
  listings: Listing[];
  onRowClick: (listing: Listing) => void;
  onEdit: (listing: Listing) => void;
  onArchive: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Tag className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-medium">No listings yet</p>
        <p className="text-sm text-muted-foreground mt-1">Start selling by creating your first listing</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12"><Checkbox /></TableHead>
          <TableHead>Product</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {listings.map((listing) => {
          const imageUrl = getListingImage(listing);
          const status = listing.sold_at ? 'sold' : (listing.listing_status || 'active');

          return (
            <TableRow key={listing.id} className="cursor-pointer" onClick={() => onRowClick(listing)}>
              <TableCell onClick={(e) => e.stopPropagation()}><Checkbox /></TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted">
                    {imageUrl ? (
                      <Image src={imageUrl} alt={listing.description} fill className="object-cover" sizes="40px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <span className="font-medium truncate max-w-[250px]">{listing.display_name || listing.description}</span>
                </div>
              </TableCell>
              <TableCell>{listing.marketplace_category || '—'}</TableCell>
              <TableCell>{formatDate(listing.created_at)}</TableCell>
              <TableCell><StatusBadge status={status} type="listing" /></TableCell>
              <TableCell className="text-right font-medium">${listing.price.toFixed(2)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onRowClick(listing)}><Eye className="h-4 w-4 mr-2" />View</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(listing)}><Edit3 className="h-4 w-4 mr-2" />Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onArchive(listing)}>
                      <Archive className="h-4 w-4 mr-2" />
                      {listing.listing_status === 'archived' ? 'Unarchive' : 'Archive'}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => onDelete(listing)}><Trash2 className="h-4 w-4 mr-2" />Delete</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ============================================================
// Grouped Orders View (for "All" mode)
// ============================================================

function GroupedOrdersView({
  groups,
  loading,
  onOrderClick,
  onViewProduct,
  onMessage,
  onGetHelp,
}: {
  groups: {
    key: string;
    label: string;
    icon: React.ElementType;
    accentColor: string;
    orders: CombinedOrder[];
  }[];
  loading: boolean;
  onOrderClick: (order: Purchase) => void;
  onViewProduct: (productId: string) => void;
  onMessage: (order: Purchase) => void;
  onGetHelp: (order: Purchase) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Package className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-medium">No orders yet</p>
        <p className="text-sm text-muted-foreground mt-1">Your buying and selling orders will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {groups.map((group) => {
        const IconComponent = group.icon;
        return (
          <div key={group.key}>
            {/* Group Header - Clean, minimal design */}
            <div className="flex items-center gap-2 mb-3">
              <IconComponent className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{group.label}</span>
              <span className="text-xs text-muted-foreground">({group.orders.length})</span>
            </div>

            {/* Order Cards */}
            <div className="space-y-2">
              {group.orders.map((order) => {
                const productImage = getProductImageUrl(order.product);
                const productName = getProductName(order.product);
                const otherParty = order.orderType === 'buying'
                  ? (order.seller?.business_name || order.seller?.name || 'Seller')
                  : (order.buyer?.name || 'Buyer');
                
                // Determine what action the user needs to take
                // If funds are released, no action needed - order is complete
                const isComplete = order.funds_status === 'released' || order.funds_status === 'auto_released';
                
                const actionText = isComplete
                  ? null
                  : order.orderType === 'selling' && order.status === 'paid' && !order.shipped_at
                  ? 'Ship this order'
                  : order.orderType === 'buying' && order.status === 'shipped' && order.funds_status === 'held'
                  ? 'Confirm receipt'
                  : order.orderType === 'buying' && order.status === 'paid' && !order.shipped_at
                  ? 'Waiting for shipment'
                  : null;

                return (
                  <div
                    key={order.id}
                    onClick={() => onOrderClick(order)}
                    className={cn(
                      "flex items-center gap-4 p-3 rounded-md border border-border bg-card hover:bg-accent/50 transition-colors cursor-pointer group",
                      "border-l-4",
                      group.accentColor
                    )}
                  >
                    {/* Product Image */}
                    <div className="relative h-12 w-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                      {productImage ? (
                        <Image src={productImage} alt={productName} fill className="object-cover" sizes="48px" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    {/* Order Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-sm truncate">{productName}</span>
                        {/* Order Type Badge - Subtle */}
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">
                          {order.orderType === 'buying' ? 'Buying' : 'Selling'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="font-mono">#{order.order_number}</span>
                        <span>·</span>
                        <span className="truncate">{otherParty}</span>
                        <span>·</span>
                        <span>{formatDate(order.purchase_date)}</span>
                      </div>
                      {actionText && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {actionText}
                        </p>
                      )}
                    </div>

                    {/* Price & Actions */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-semibold text-sm">${order.total_amount.toFixed(2)}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOrderClick(order); }}>
                            <Eye className="h-4 w-4 mr-2" />View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onViewProduct(order.product_id); }}>
                            <ExternalLink className="h-4 w-4 mr-2" />View Product
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMessage(order); }}>
                            <MessageCircle className="h-4 w-4 mr-2" />Message
                          </DropdownMenuItem>
                          {order.orderType === 'buying' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onGetHelp(order); }}>
                                <HelpCircle className="h-4 w-4 mr-2" />Get Help
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Desktop Drafts Table
// ============================================================

function DesktopDraftsTable({
  drafts,
  onContinue,
  onDelete,
  loading,
}: {
  drafts: Draft[];
  onContinue: (id: string) => void;
  onDelete: (id: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="font-medium">No drafts</p>
        <p className="text-sm text-muted-foreground mt-1">Incomplete listings will appear here</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Draft</TableHead>
          <TableHead>Progress</TableHead>
          <TableHead>Last Edited</TableHead>
          <TableHead className="w-32"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {drafts.map((draft) => {
          const title = draft.draft_name || draft.form_data?.title || 'Untitled Draft';
          const progress = Math.round((draft.current_step / 5) * 100);
          const imageUrl = draft.form_data?.images?.[0]?.url;

          return (
            <TableRow key={draft.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted">
                    {imageUrl ? (
                      <Image src={imageUrl} alt={title} fill className="object-cover" sizes="40px" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <span className="font-medium">{title}</span>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-[100px]">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-sm text-muted-foreground">{progress}%</span>
                </div>
              </TableCell>
              <TableCell>{formatDate(draft.last_saved_at)}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => onContinue(draft.id)}>Continue</Button>
                  <Button size="sm" variant="ghost" onClick={() => onDelete(draft.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ============================================================
// Main Page Component
// ============================================================

export default function OrderManagementPage() {
  const router = useRouter();

  // State
  const [activeTab, setActiveTab] = React.useState<MainTab>('orders');
  const [orderMode, setOrderMode] = React.useState<OrderMode>('buying');
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');

  // Data
  const [orders, setOrders] = React.useState<Purchase[]>([]);
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [drafts, setDrafts] = React.useState<Draft[]>([]);

  // Loading states
  const [ordersLoading, setOrdersLoading] = React.useState(true);
  const [listingsLoading, setListingsLoading] = React.useState(true);
  const [draftsLoading, setDraftsLoading] = React.useState(true);

  // Sheet state
  const [selectedOrder, setSelectedOrder] = React.useState<Purchase | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  
  // Confirm receipt dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = React.useState(false);
  const [orderToConfirm, setOrderToConfirm] = React.useState<string | null>(null);

  // Edit listing drawer state
  const [editingListing, setEditingListing] = React.useState<Listing | null>(null);
  const [isEditDrawerOpen, setIsEditDrawerOpen] = React.useState(false);
  
  // Listings filter state
  const [listingsFilter, setListingsFilter] = React.useState<'all' | 'active' | 'sold' | 'archived'>('all');

  // Claims/Tickets state
  const [tickets, setTickets] = React.useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = React.useState(true);
  const [ticketsFilter, setTicketsFilter] = React.useState<'all' | 'active' | 'resolved' | 'closed'>('all');
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(null);
  const [ticketDetailOpen, setTicketDetailOpen] = React.useState(false);

  // Help Wizard state
  const [helpWizardOpen, setHelpWizardOpen] = React.useState(false);
  const [orderForHelp, setOrderForHelp] = React.useState<Purchase | null>(null);

  // Combined orders for 'all' view
  const [buyingOrders, setBuyingOrders] = React.useState<Purchase[]>([]);
  const [sellingOrders, setSellingOrders] = React.useState<Purchase[]>([]);

  // Fetch orders
  const fetchOrders = React.useCallback(async () => {
    setOrdersLoading(true);
    try {
      if (orderMode === 'all') {
        // Fetch both buying and selling orders in parallel
        const [buyingRes, sellingRes] = await Promise.all([
          fetch(`/api/marketplace/purchases?mode=buying&status=${statusFilter}&pageSize=50`),
          fetch(`/api/marketplace/purchases?mode=selling&status=${statusFilter}&pageSize=50`),
        ]);
        const [buyingData, sellingData] = await Promise.all([buyingRes.json(), sellingRes.json()]);
        setBuyingOrders(buyingData.purchases || []);
        setSellingOrders(sellingData.purchases || []);
        setOrders([]); // Clear single-mode orders
      } else {
        const params = new URLSearchParams({
          mode: orderMode,
          status: statusFilter,
          pageSize: '50',
        });
        const res = await fetch(`/api/marketplace/purchases?${params}`);
        const data = await res.json();
        setOrders(data.purchases || []);
        setBuyingOrders([]);
        setSellingOrders([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setOrdersLoading(false);
    }
  }, [orderMode, statusFilter]);

  // Fetch listings
  const fetchListings = React.useCallback(async () => {
    setListingsLoading(true);
    try {
      const params = new URLSearchParams();
      if (listingsFilter !== 'all') {
        params.set('status', listingsFilter);
      }
      const res = await fetch(`/api/marketplace/listings?${params}`);
      const data = await res.json();
      setListings(data.listings || []);
    } catch (e) {
      console.error(e);
    } finally {
      setListingsLoading(false);
    }
  }, [listingsFilter]);

  // Fetch drafts
  const fetchDrafts = React.useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await fetch('/api/marketplace/drafts');
      const data = await res.json();
      setDrafts(data.drafts || []);
    } catch (e) {
      console.error(e);
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  // Fetch tickets/claims
  const fetchTickets = React.useCallback(async () => {
    setTicketsLoading(true);
    try {
      const params = new URLSearchParams();
      if (ticketsFilter !== 'all') {
        params.set('status', ticketsFilter);
      }
      const res = await fetch(`/api/support/tickets?${params}`);
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (e) {
      console.error(e);
    } finally {
      setTicketsLoading(false);
    }
  }, [ticketsFilter]);

  // Initial fetch
  React.useEffect(() => {
    fetchOrders();
    fetchListings();
    fetchDrafts();
    fetchTickets();
  }, []);

  // Refetch orders when mode/filter changes
  React.useEffect(() => {
    fetchOrders();
  }, [orderMode, statusFilter]);

  // Refetch listings when filter changes
  React.useEffect(() => {
    fetchListings();
  }, [listingsFilter]);

  // Refetch tickets when filter changes
  React.useEffect(() => {
    fetchTickets();
  }, [ticketsFilter]);

  // Handlers
  const handleGetHelp = (order: Purchase) => {
    setOrderForHelp(order);
    setHelpWizardOpen(true);
    setSheetOpen(false);
  };

  const handleTicketClick = (ticket: SupportTicket) => {
    setSelectedTicketId(ticket.id);
    setTicketDetailOpen(true);
  };

  const handleTicketCreated = () => {
    fetchTickets();
    setActiveTab('claims');
  };
  // Track the order type for the detail view when in 'all' mode
  const [detailOrderType, setDetailOrderType] = React.useState<'buying' | 'selling' | null>(null);

  const handleOrderClick = (order: Purchase | CombinedOrder) => {
    setSelectedOrder(order);
    // If it's a combined order with orderType, track it for the detail view
    if ('orderType' in order) {
      setDetailOrderType(order.orderType);
    } else {
      setDetailOrderType(null);
    }
    setSheetOpen(true);
  };

  // Get the effective order mode for the detail view
  const effectiveOrderMode = detailOrderType || (orderMode === 'all' ? 'buying' : orderMode);

  // Handle messaging - find existing conversation or create new one
  const handleMessage = async (order: Purchase | CombinedOrder) => {
    // Determine if this is a buying or selling order
    const isBuying = 'orderType' in order ? order.orderType === 'buying' : orderMode === 'buying';
    const recipientId = isBuying ? order.seller_id : order.buyer_id;
    const productName = getProductName(order.product);
    
    try {
      // Try to create/find a conversation about this product
      const response = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: order.product_id,
          recipientUserId: recipientId,
          initialMessage: `Hi, I have a question about order #${order.order_number} for "${productName}".`,
        }),
      });

      const data = await response.json();

      if (response.status === 409 && data.conversationId) {
        // Conversation already exists - navigate to it
        router.push(`/messages?conversation=${data.conversationId}`);
        setSheetOpen(false);
      } else if (response.ok && data.conversation?.id) {
        // New conversation created - navigate to it
        router.push(`/messages?conversation=${data.conversation.id}`);
        setSheetOpen(false);
      } else {
        console.error('Failed to create/find conversation:', data.error);
        alert('Failed to start conversation. Please try again.');
      }
    } catch (e) {
      console.error('Error handling message:', e);
      alert('Failed to start conversation. Please try again.');
    }
  };

  const handleConfirmReceipt = (id: string) => {
    setOrderToConfirm(id);
    setConfirmDialogOpen(true);
  };

  const executeConfirmReceipt = async () => {
    if (!orderToConfirm || confirmingId) return;
    
    setConfirmingId(orderToConfirm);
    setConfirmDialogOpen(false);
    
    try {
      await fetch(`/api/marketplace/purchases/${orderToConfirm}/confirm-receipt`, { method: 'POST' });
      fetchOrders();
      setSheetOpen(false);
    } catch (e) {
      alert('Failed to confirm receipt. Please try again.');
    } finally {
      setConfirmingId(null);
      setOrderToConfirm(null);
    }
  };

  const handleContinueDraft = (id: string) => {
    router.push(`/marketplace/sell?draft=${id}`);
  };

  const handleDeleteDraft = async (id: string) => {
    if (!confirm('Delete this draft?')) return;
    try {
      await fetch(`/api/marketplace/drafts/${id}`, { method: 'DELETE' });
      fetchDrafts();
    } catch (e) {
      console.error(e);
    }
  };

  // Listing handlers
  const handleEditListing = (listing: Listing) => {
    setEditingListing(listing);
    setIsEditDrawerOpen(true);
  };

  const handleArchiveListing = async (listing: Listing) => {
    const isArchived = listing.listing_status === 'archived';
    const action = isArchived ? 'unarchive' : 'archive';
    
    try {
      const res = await fetch(`/api/marketplace/listings/${listing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          listing_status: isArchived ? 'active' : 'archived' 
        }),
      });
      
      if (!res.ok) throw new Error('Failed to update');
      fetchListings();
    } catch (e) {
      alert(`Failed to ${action} listing`);
    }
  };

  const handleDeleteListing = async (listing: Listing) => {
    if (!confirm('Are you sure you want to delete this listing? This action cannot be undone.')) return;
    
    try {
      const res = await fetch(`/api/marketplace/listings/${listing.id}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Failed to delete');
      fetchListings();
    } catch (e) {
      alert('Failed to delete listing');
    }
  };

  const handleListingUpdate = (updatedProduct: MarketplaceProduct) => {
    // Update the listing in the local state
    setListings(prev => prev.map(l => 
      l.id === updatedProduct.id 
        ? { ...l, ...updatedProduct, display_name: (updatedProduct as any).display_name } 
        : l
    ));
  };

  // Combine and group orders for 'all' view
  const combinedOrders = React.useMemo((): CombinedOrder[] => {
    if (orderMode !== 'all') return [];
    
    const buying: CombinedOrder[] = buyingOrders.map(o => ({ ...o, orderType: 'buying' as const }));
    const selling: CombinedOrder[] = sellingOrders.map(o => ({ ...o, orderType: 'selling' as const }));
    
    // Sort by purchase date descending
    return [...buying, ...selling].sort((a, b) => 
      new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime()
    );
  }, [orderMode, buyingOrders, sellingOrders]);

  // Group orders by status for 'all' view
  const groupedOrders = React.useMemo(() => {
    const statusGroups = [
      { 
        key: 'needs_action', 
        label: 'Action Required', 
        icon: AlertCircle,
        accentColor: 'border-l-amber-500',
        orders: [] as CombinedOrder[],
      },
      { 
        key: 'in_transit', 
        label: 'In Transit', 
        icon: Truck,
        accentColor: 'border-l-blue-500',
        orders: [] as CombinedOrder[],
      },
      { 
        key: 'completed', 
        label: 'Completed', 
        icon: CheckCircle2,
        accentColor: 'border-l-green-500',
        orders: [] as CombinedOrder[],
      },
      { 
        key: 'other', 
        label: 'Other', 
        icon: Package,
        accentColor: 'border-l-gray-400',
        orders: [] as CombinedOrder[],
      },
    ];

    combinedOrders.forEach(order => {
      // PRIORITY 1: If buyer confirmed receipt (funds released), it's completed - trumps everything
      if (order.funds_status === 'released' || order.funds_status === 'auto_released') {
        statusGroups[2].orders.push(order); // Completed
      }
      // Needs Action: Seller needs to ship, or Buyer needs to confirm receipt
      else if (
        (order.orderType === 'selling' && order.status === 'paid' && !order.shipped_at) ||
        (order.orderType === 'buying' && order.status === 'shipped' && order.funds_status === 'held')
      ) {
        statusGroups[0].orders.push(order);
      }
      // In Transit: Shipped but not delivered
      else if (order.status === 'shipped') {
        statusGroups[1].orders.push(order);
      }
      // Completed: Delivered
      else if (order.status === 'delivered') {
        statusGroups[2].orders.push(order);
      }
      // Waiting: Buyer waiting for shipment
      else if (order.orderType === 'buying' && order.status === 'paid' && !order.shipped_at) {
        statusGroups[0].orders.push(order); // Show in Needs Action but as "waiting"
      }
      // Other: Everything else
      else {
        statusGroups[3].orders.push(order);
      }
    });

    return statusGroups.filter(g => g.orders.length > 0);
  }, [combinedOrders]);

  // Filter orders based on search
  const filteredOrders = React.useMemo(() => {
    if (!search.trim()) return orders;
    
    const searchLower = search.toLowerCase();
    return orders.filter(order => {
      const productName = getProductName(order.product).toLowerCase();
      const orderNumber = order.order_number.toLowerCase();
      const otherParty = orderMode === 'buying'
        ? (order.seller?.business_name || order.seller?.name || '').toLowerCase()
        : (order.buyer?.name || '').toLowerCase();
      
      return (
        productName.includes(searchLower) ||
        orderNumber.includes(searchLower) ||
        otherParty.includes(searchLower)
      );
    });
  }, [orders, search, orderMode]);

  // Filter combined orders based on search for 'all' view
  const filteredGroupedOrders = React.useMemo(() => {
    if (!search.trim()) return groupedOrders;
    
    const searchLower = search.toLowerCase();
    return groupedOrders.map(group => ({
      ...group,
      orders: group.orders.filter(order => {
        const productName = getProductName(order.product).toLowerCase();
        const orderNumber = order.order_number.toLowerCase();
        const otherParty = order.orderType === 'buying'
          ? (order.seller?.business_name || order.seller?.name || '').toLowerCase()
          : (order.buyer?.name || '').toLowerCase();
        
        return (
          productName.includes(searchLower) ||
          orderNumber.includes(searchLower) ||
          otherParty.includes(searchLower)
        );
      }),
    })).filter(g => g.orders.length > 0);
  }, [groupedOrders, search]);

  // Counts
  const activeOrderCount = orders.filter(o => ['pending', 'paid', 'shipped'].includes(o.status)).length;
  const activeListingCount = listings.filter(l => !l.sold_at && l.listing_status !== 'archived').length;
  const activeClaimsCount = tickets.filter(t => ['open', 'awaiting_response', 'in_review', 'escalated'].includes(t.status)).length;

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout>
        <div className="min-h-screen bg-background pt-16 pb-20 sm:pb-8">
          <div className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 sm:mb-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Order Management</h1>
                <p className="text-sm text-muted-foreground hidden sm:block">Manage your orders, listings, and drafts</p>
              </div>
              <Button onClick={() => router.push('/marketplace/sell')} className="hidden sm:flex">
                <Plus className="h-4 w-4 mr-2" />
                New Listing
              </Button>
            </div>

            {/* Desktop Tabs */}
            <div className="hidden sm:block">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as MainTab)}>
                <div className="flex items-center justify-between mb-4">
                  {/* Custom styled tabs matching the All/Buying/Selling design */}
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                    <button
                      onClick={() => setActiveTab('orders')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
                        activeTab === 'orders'
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      <ShoppingBag size={15} />
                      Orders
                      {activeOrderCount > 0 && (
                        <span className="text-xs text-muted-foreground">({activeOrderCount})</span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('listings')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
                        activeTab === 'listings'
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      <Tag size={15} />
                      My Listings
                      <span className="text-xs text-muted-foreground">({activeListingCount})</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('claims')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
                        activeTab === 'claims'
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      <LifeBuoy size={15} />
                      Claims
                      {activeClaimsCount > 0 && (
                        <span className="text-xs text-amber-600 font-semibold">({activeClaimsCount})</span>
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('drafts')}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
                        activeTab === 'drafts'
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      <FileText size={15} />
                      Drafts
                      {drafts.length > 0 && (
                        <span className="text-xs text-muted-foreground">({drafts.length})</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Orders Tab */}
                <TabsContent value="orders">
                  <div className="bg-card rounded-md border">
                    {/* Toolbar */}
                    <div className="p-4 border-b flex flex-wrap gap-3 items-center">
                      <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                        <button
                          onClick={() => setOrderMode('all')}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
                            orderMode === 'all'
                              ? "text-gray-800 bg-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-200/70"
                          )}
                        >
                          <Package size={15} />
                          All
                        </button>
                        <button
                          onClick={() => setOrderMode('buying')}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
                            orderMode === 'buying'
                              ? "text-gray-800 bg-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-200/70"
                          )}
                        >
                          <ShoppingBag size={15} />
                          Buying
                        </button>
                        <button
                          onClick={() => setOrderMode('selling')}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer",
                            orderMode === 'selling'
                              ? "text-gray-800 bg-white shadow-sm"
                              : "text-gray-600 hover:bg-gray-200/70"
                          )}
                        >
                          <Store size={15} />
                          Selling
                        </button>
                      </div>

                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search orders..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
                      </div>

                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="disputed">Disputed</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button variant="outline" size="icon" onClick={fetchOrders}>
                        <RefreshCw className={cn("h-4 w-4", ordersLoading && "animate-spin")} />
                      </Button>
                    </div>

                    {/* Show grouped view for 'all' mode, table for specific modes */}
                    {orderMode === 'all' ? (
                      <GroupedOrdersView
                        groups={filteredGroupedOrders}
                        loading={ordersLoading}
                        onOrderClick={handleOrderClick}
                        onViewProduct={(productId) => router.push(`/marketplace/product/${productId}?fromPurchase=true`)}
                        onMessage={handleMessage}
                        onGetHelp={handleGetHelp}
                      />
                    ) : (
                      <DesktopOrdersTable 
                        orders={filteredOrders} 
                        orderMode={orderMode} 
                        onRowClick={handleOrderClick} 
                        onViewProduct={(productId) => router.push(`/marketplace/product/${productId}?fromPurchase=true`)}
                        onMessage={handleMessage}
                        onGetHelp={handleGetHelp} 
                        loading={ordersLoading} 
                      />
                    )}
                  </div>
                </TabsContent>

                {/* Listings Tab */}
                <TabsContent value="listings">
                  <div className="bg-card rounded-md border">
                    <div className="p-4 border-b flex flex-wrap gap-3 items-center">
                      <div className="relative flex-1 max-w-xs">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search listings..." className="pl-8" />
                      </div>
                      
                      <Select value={listingsFilter} onValueChange={(v) => setListingsFilter(v as any)}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Listings</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="sold">Sold</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Button variant="outline" size="icon" onClick={fetchListings}>
                        <RefreshCw className={cn("h-4 w-4", listingsLoading && "animate-spin")} />
                      </Button>
                    </div>

                    <DesktopListingsTable 
                      listings={listings} 
                      onRowClick={(listing) => {
                        const isSold = listing.sold_at || listing.listing_status === 'sold';
                        const url = `/marketplace/product/${listing.id}${isSold ? '?fromPurchase=true' : ''}`;
                        router.push(url);
                      }}
                      onEdit={handleEditListing}
                      onArchive={handleArchiveListing}
                      onDelete={handleDeleteListing}
                      loading={listingsLoading} 
                    />
                  </div>
                </TabsContent>

                {/* Claims Tab */}
                <TabsContent value="claims">
                  <div className="bg-card rounded-md border">
                    <div className="p-4 border-b flex flex-wrap gap-3 items-center">
                      <Select value={ticketsFilter} onValueChange={(v) => setTicketsFilter(v as any)}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Claims</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>

                      <div className="flex-1" />

                      <Button variant="outline" size="icon" onClick={fetchTickets}>
                        <RefreshCw className={cn("h-4 w-4", ticketsLoading && "animate-spin")} />
                      </Button>
                    </div>

                    {ticketsLoading ? (
                      <div className="flex items-center justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : tickets.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="rounded-full bg-muted p-4 mb-4">
                          <LifeBuoy className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="font-medium">No support tickets</p>
                        <p className="text-sm text-muted-foreground mt-1">Support tickets for your orders will appear here</p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ticket</TableHead>
                            <TableHead>Product</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Last Updated</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tickets.map((ticket) => {
                            const product = ticket.product || ticket.purchases?.product || ticket.purchase?.product;
                            const productImage = product?.cached_image_url || product?.primary_image_url;
                            const productName = product?.display_name || product?.description || 'Product';
                            const categoryLabels: Record<string, string> = {
                              item_not_received: 'Not Received',
                              item_not_as_described: 'Not as Described',
                              damaged: 'Damaged',
                              wrong_item: 'Wrong Item',
                              refund_request: 'Refund',
                              shipping_issue: 'Shipping',
                              general_question: 'Question',
                            };

                            return (
                              <TableRow key={ticket.id} className="cursor-pointer" onClick={() => handleTicketClick(ticket)}>
                                <TableCell className="font-mono text-sm">{ticket.ticket_number}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted">
                                      {productImage ? (
                                        <Image src={productImage} alt={productName} fill className="object-cover" sizes="40px" />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                          <Package className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                      )}
                                    </div>
                                    <span className="font-medium truncate max-w-[200px]">{productName}</span>
                                  </div>
                                </TableCell>
                                <TableCell>{categoryLabels[ticket.category] || ticket.category}</TableCell>
                                <TableCell><TicketStatusBadge status={ticket.status} /></TableCell>
                                <TableCell>{formatDate(ticket.created_at)}</TableCell>
                                <TableCell>{formatDate(ticket.updated_at)}</TableCell>
                                <TableCell onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon-sm">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleTicketClick(ticket)}><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                                      <DropdownMenuItem><MessageCircle className="h-4 w-4 mr-2" />Reply</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                </TabsContent>

                {/* Drafts Tab */}
                <TabsContent value="drafts">
                  <div className="bg-card rounded-md border">
                    <div className="p-4 border-b flex gap-3 items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {drafts.length} draft{drafts.length !== 1 ? 's' : ''}
                      </p>
                      <Button variant="outline" size="icon" onClick={fetchDrafts}>
                        <RefreshCw className={cn("h-4 w-4", draftsLoading && "animate-spin")} />
                      </Button>
                    </div>

                    <DesktopDraftsTable drafts={drafts} onContinue={handleContinueDraft} onDelete={handleDeleteDraft} loading={draftsLoading} />
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* Mobile Content */}
            <div className="sm:hidden space-y-4">
              {/* Mobile Header for Orders */}
              {activeTab === 'orders' && (
                <div className="space-y-3">
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-full">
                    <button
                      onClick={() => setOrderMode('all')}
                      className={cn(
                        "flex items-center gap-1 px-2 py-2 text-sm font-medium rounded-md transition-colors flex-1 justify-center cursor-pointer",
                        orderMode === 'all'
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      <Package size={14} />
                      All
                    </button>
                    <button
                      onClick={() => setOrderMode('buying')}
                      className={cn(
                        "flex items-center gap-1 px-2 py-2 text-sm font-medium rounded-md transition-colors flex-1 justify-center cursor-pointer",
                        orderMode === 'buying'
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      <ShoppingBag size={14} />
                      Buying
                    </button>
                    <button
                      onClick={() => setOrderMode('selling')}
                      className={cn(
                        "flex items-center gap-1 px-2 py-2 text-sm font-medium rounded-md transition-colors flex-1 justify-center cursor-pointer",
                        orderMode === 'selling'
                          ? "text-gray-800 bg-white shadow-sm"
                          : "text-gray-600 hover:bg-gray-200/70"
                      )}
                    >
                      <Store size={14} />
                      Selling
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search orders..." 
                        className="pl-8 h-10" 
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <Button variant="outline" size="icon" className="h-10 w-10">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Mobile Orders */}
              {activeTab === 'orders' && (
                <div className="space-y-2">
                  {ordersLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : orderMode === 'all' ? (
                    // Grouped view for 'all' mode
                    filteredGroupedOrders.length === 0 ? (
                      <div className="text-center py-12">
                        <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="font-medium">{search ? 'No orders found' : 'No orders yet'}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {search ? 'Try a different search term' : 'Your buying and selling orders will appear here'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {filteredGroupedOrders.map((group) => {
                          const IconComponent = group.icon;
                          return (
                            <div key={group.key}>
                              {/* Group Header - Clean, minimal */}
                              <div className="flex items-center gap-2 mb-2 px-1">
                                <IconComponent className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-medium text-foreground">{group.label}</span>
                                <span className="text-xs text-muted-foreground">({group.orders.length})</span>
                              </div>
                              {/* Orders */}
                              <div className="space-y-2">
                                {group.orders.map((order) => (
                                  <MobileCombinedOrderCard 
                                    key={order.id} 
                                    order={order} 
                                    onClick={() => handleOrderClick(order)}
                                    accentColor={group.accentColor}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-12">
                      <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-medium">{search ? 'No orders found' : 'No orders yet'}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {search ? 'Try a different search term' : (orderMode === 'buying' ? 'Start shopping' : 'List something to sell')}
                      </p>
                    </div>
                  ) : (
                    filteredOrders.map((order) => (
                      <MobileOrderCard key={order.id} purchase={order} onClick={() => handleOrderClick(order)} orderMode={orderMode} />
                    ))
                  )}
                </div>
              )}

              {/* Mobile Listings */}
              {activeTab === 'listings' && (
                <div className="space-y-2">
                  <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search listings..." className="pl-8 h-10" />
                    </div>
                    <Button onClick={() => router.push('/marketplace/sell')} className="h-10">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Filter chips */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {(['all', 'active', 'sold', 'archived'] as const).map((f) => (
                      <Button 
                        key={f} 
                        variant={listingsFilter === f ? 'secondary' : 'outline'} 
                        size="sm" 
                        onClick={() => setListingsFilter(f)}
                        className="flex-shrink-0"
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </Button>
                    ))}
                  </div>

                  {listingsLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : listings.length === 0 ? (
                    <div className="text-center py-12">
                      <Tag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-medium">No listings yet</p>
                      <p className="text-sm text-muted-foreground mt-1">Create your first listing</p>
                      <Button className="mt-4" onClick={() => router.push('/marketplace/sell')}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Listing
                      </Button>
                    </div>
                  ) : (
                    listings.map((listing) => {
                      const isSold = listing.sold_at || listing.listing_status === 'sold';
                      const url = `/marketplace/product/${listing.id}${isSold ? '?fromPurchase=true' : ''}`;
                      return (
                        <MobileListingCard 
                          key={listing.id} 
                          listing={listing} 
                          onClick={() => router.push(url)}
                          onEdit={() => handleEditListing(listing)}
                          onArchive={() => handleArchiveListing(listing)}
                          onDelete={() => handleDeleteListing(listing)}
                        />
                      );
                    })
                  )}
                </div>
              )}

              {/* Mobile Claims */}
              {activeTab === 'claims' && (
                <div className="space-y-2">
                  {/* Filter chips */}
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {(['all', 'active', 'resolved', 'closed'] as const).map((f) => (
                      <Button 
                        key={f} 
                        variant={ticketsFilter === f ? 'secondary' : 'outline'} 
                        size="sm" 
                        onClick={() => setTicketsFilter(f)}
                        className="flex-shrink-0"
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </Button>
                    ))}
                  </div>

                  {ticketsLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : tickets.length === 0 ? (
                    <div className="text-center py-12">
                      <LifeBuoy className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-medium">No support tickets</p>
                      <p className="text-sm text-muted-foreground mt-1">Support tickets for your orders will appear here</p>
                    </div>
                  ) : (
                    tickets.map((ticket) => (
                      <MobileTicketCard
                        key={ticket.id}
                        ticket={ticket}
                        onClick={() => handleTicketClick(ticket)}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Mobile Drafts */}
              {activeTab === 'drafts' && (
                <div className="space-y-2">
                  {draftsLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : drafts.length === 0 ? (
                    <div className="text-center py-12">
                      <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-medium">No drafts</p>
                      <p className="text-sm text-muted-foreground mt-1">Incomplete listings will appear here</p>
                    </div>
                  ) : (
                    drafts.map((draft) => (
                      <MobileDraftCard
                        key={draft.id}
                        draft={draft}
                        onContinue={() => handleContinueDraft(draft.id)}
                        onDelete={() => handleDeleteDraft(draft.id)}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </MarketplaceLayout>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        orderCount={activeOrderCount}
        listingCount={activeListingCount}
        draftCount={drafts.length}
        claimsCount={activeClaimsCount}
      />

      {/* Confirm Receipt Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className="rounded-md animate-in slide-in-from-bottom-4 zoom-in-95 duration-300">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Receipt</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                By confirming receipt, you acknowledge that:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>You have received the item</li>
                <li>The item matches the listing description</li>
                <li>You are satisfied with your purchase</li>
              </ul>
              <p className="font-medium text-foreground">
                This action is irreversible and will release payment to the seller.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-md">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={executeConfirmReceipt}
              className="rounded-md"
              disabled={confirmingId !== null}
            >
              {confirmingId ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Confirming...
                </>
              ) : (
                'Confirm Receipt'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Order Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Order Details</SheetTitle>
          </SheetHeader>
          {selectedOrder && (
            <div className="px-4 pb-4">
              <OrderDetailContent
                purchase={selectedOrder}
                orderMode={effectiveOrderMode}
                onViewProduct={(id) => { router.push(`/marketplace/product/${id}?fromPurchase=true`); setSheetOpen(false); }}
                onConfirmReceipt={handleConfirmReceipt}
                onMessage={() => handleMessage(selectedOrder)}
                confirmingId={confirmingId}
                onGetHelp={() => handleGetHelp(selectedOrder)}
                onRefresh={() => {
                  fetchOrders();
                  // Refresh the selected order
                  if (orderMode === 'all') {
                    // In 'all' mode, check both arrays
                    const refreshedBuying = buyingOrders.find(o => o.id === selectedOrder.id);
                    const refreshedSelling = sellingOrders.find(o => o.id === selectedOrder.id);
                    if (refreshedBuying) setSelectedOrder(refreshedBuying);
                    else if (refreshedSelling) setSelectedOrder(refreshedSelling);
                  } else {
                    const refreshedOrder = orders.find(o => o.id === selectedOrder.id);
                    if (refreshedOrder) setSelectedOrder(refreshedOrder);
                  }
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Listing Drawer */}
      {editingListing && (
        <EditProductDrawer
          product={editingListing as unknown as MarketplaceProduct}
          isOpen={isEditDrawerOpen}
          onClose={() => {
            setIsEditDrawerOpen(false);
            setEditingListing(null);
          }}
          onUpdate={handleListingUpdate}
        />
      )}

      {/* Help Wizard */}
      {orderForHelp && (
        <OrderHelpWizard
          isOpen={helpWizardOpen}
          onClose={() => {
            setHelpWizardOpen(false);
            setOrderForHelp(null);
          }}
          purchase={{
            id: orderForHelp.id,
            order_number: orderForHelp.order_number,
            status: orderForHelp.status,
            funds_status: orderForHelp.funds_status || undefined,
            total_amount: orderForHelp.total_amount,
            item_price: orderForHelp.item_price,
            shipping_cost: orderForHelp.shipping_cost,
            purchase_date: orderForHelp.purchase_date,
            product: {
              id: orderForHelp.product?.id || orderForHelp.product_id,
              description: orderForHelp.product?.description,
              display_name: orderForHelp.product?.display_name,
              primary_image_url: orderForHelp.product?.primary_image_url,
              cached_image_url: orderForHelp.product?.cached_image_url,
            },
            seller: {
              user_id: orderForHelp.seller?.user_id || orderForHelp.seller_id,
              name: orderForHelp.seller?.name,
              business_name: orderForHelp.seller?.business_name,
              logo_url: orderForHelp.seller?.logo_url,
            },
          }}
          onTicketCreated={handleTicketCreated}
        />
      )}

      {/* Ticket Detail Sheet */}
      <TicketDetailSheet
        isOpen={ticketDetailOpen}
        onClose={() => {
          setTicketDetailOpen(false);
          setSelectedTicketId(null);
        }}
        ticketId={selectedTicketId}
      />
    </>
  );
}
