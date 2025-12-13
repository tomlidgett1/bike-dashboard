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
import type { MarketplaceProduct } from "@/lib/types/marketplace";

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
  product: any;
  seller: any;
  buyer?: any;
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

type MainTab = 'orders' | 'listings' | 'drafts';
type OrderMode = 'buying' | 'selling';

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

// ============================================================
// Status Badge Component
// ============================================================

function StatusBadge({ 
  status, 
  type = 'order',
  fundsStatus,
}: { 
  status: string; 
  type?: 'order' | 'listing';
  fundsStatus?: string | null;
}) {
  // For orders with held funds that are shipped - show "Confirm Receipt"
  if (type === 'order' && fundsStatus === 'held' && (status === 'shipped' || status === 'paid')) {
    return <Badge variant="default" className="rounded-md bg-amber-500 hover:bg-amber-500">Confirm Receipt</Badge>;
  }

  const orderVariants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "secondary" },
    confirmed: { label: "Confirmed", variant: "secondary" },
    paid: { label: "Paid", variant: "default" },
    shipped: { label: "Shipped", variant: "default" },
    delivered: { label: "Delivered", variant: "default" },
    cancelled: { label: "Cancelled", variant: "outline" },
    refunded: { label: "Refunded", variant: "destructive" },
  };

  const listingVariants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    active: { label: "Active", variant: "default" },
    sold: { label: "Sold", variant: "secondary" },
    archived: { label: "Archived", variant: "outline" },
    draft: { label: "Draft", variant: "outline" },
  };

  const variants = type === 'listing' ? listingVariants : orderVariants;
  const config = variants[status] || { label: status, variant: "outline" as const };
  
  return <Badge variant={config.variant} className="rounded-md">{config.label}</Badge>;
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
}: { 
  activeTab: MainTab; 
  onTabChange: (tab: MainTab) => void;
  orderCount: number;
  listingCount: number;
  draftCount: number;
}) {
  const tabs = [
    { id: 'orders' as MainTab, label: 'Orders', icon: ShoppingBag, count: orderCount },
    { id: 'listings' as MainTab, label: 'Listings', icon: Tag, count: listingCount },
    { id: 'drafts' as MainTab, label: 'Drafts', icon: FileText, count: draftCount },
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
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors",
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
      className="w-full text-left bg-card rounded-md border border-border p-3 active:bg-accent transition-colors"
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
            <StatusBadge status={purchase.status} fundsStatus={purchase.funds_status} />
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
        <button onClick={onClick} className="relative h-16 w-16 rounded-md overflow-hidden bg-muted flex-shrink-0">
          {imageUrl ? (
            <Image src={imageUrl} alt={listing.description} fill className="object-cover" sizes="64px" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Tag className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </button>

        <button onClick={onClick} className="flex-1 min-w-0 text-left">
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
  confirmingId,
}: {
  purchase: Purchase;
  orderMode: OrderMode;
  onViewProduct: (id: string) => void;
  onConfirmReceipt: (id: string) => void;
  confirmingId: string | null;
}) {
  const [copied, setCopied] = React.useState(false);
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);
  const canConfirm = purchase.funds_status === 'held' && orderMode === 'buying';
  const isConfirming = confirmingId === purchase.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(purchase.order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <StatusBadge status={purchase.status} fundsStatus={purchase.funds_status} />
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
        <Button variant="outline">
          <MessageCircle className="h-4 w-4 mr-2" />
          Message
        </Button>
      </div>
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
  loading,
}: {
  orders: Purchase[];
  orderMode: OrderMode;
  onRowClick: (order: Purchase) => void;
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
              <TableCell><StatusBadge status={order.status} fundsStatus={order.funds_status} /></TableCell>
              <TableCell className="text-right font-medium">${order.total_amount.toFixed(2)}</TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem><Eye className="h-4 w-4 mr-2" />View Details</DropdownMenuItem>
                    <DropdownMenuItem><ExternalLink className="h-4 w-4 mr-2" />View Product</DropdownMenuItem>
                    <DropdownMenuItem><MessageCircle className="h-4 w-4 mr-2" />Message</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem><HelpCircle className="h-4 w-4 mr-2" />Get Help</DropdownMenuItem>
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

  // Fetch orders
  const fetchOrders = React.useCallback(async () => {
    setOrdersLoading(true);
    try {
      const params = new URLSearchParams({
        mode: orderMode,
        status: statusFilter,
        pageSize: '50',
      });
      const res = await fetch(`/api/marketplace/purchases?${params}`);
      const data = await res.json();
      setOrders(data.purchases || []);
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

  // Initial fetch
  React.useEffect(() => {
    fetchOrders();
    fetchListings();
    fetchDrafts();
  }, []);

  // Refetch orders when mode/filter changes
  React.useEffect(() => {
    fetchOrders();
  }, [orderMode, statusFilter]);

  // Refetch listings when filter changes
  React.useEffect(() => {
    fetchListings();
  }, [listingsFilter]);

  // Handlers
  const handleOrderClick = (order: Purchase) => {
    setSelectedOrder(order);
    setSheetOpen(true);
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

  // Counts
  const activeOrderCount = orders.filter(o => ['pending', 'paid', 'shipped'].includes(o.status)).length;
  const activeListingCount = listings.filter(l => !l.sold_at && l.listing_status !== 'archived').length;

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
                  <TabsList>
                    <TabsTrigger value="orders">
                      <ShoppingBag className="h-4 w-4 mr-2" />
                      Orders
                      {activeOrderCount > 0 && (
                        <Badge variant="secondary" className="ml-2 rounded-md">{activeOrderCount}</Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="listings">
                      <Tag className="h-4 w-4 mr-2" />
                      My Listings
                      <Badge variant="secondary" className="ml-2 rounded-md">{activeListingCount}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="drafts">
                      <FileText className="h-4 w-4 mr-2" />
                      Drafts
                      {drafts.length > 0 && (
                        <Badge variant="secondary" className="ml-2 rounded-md">{drafts.length}</Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Orders Tab */}
                <TabsContent value="orders">
                  <div className="bg-card rounded-md border">
                    {/* Toolbar */}
                    <div className="p-4 border-b flex flex-wrap gap-3 items-center">
                      <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
                        <Button
                          variant={orderMode === 'buying' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setOrderMode('buying')}
                        >
                          Buying
                        </Button>
                        <Button
                          variant={orderMode === 'selling' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setOrderMode('selling')}
                        >
                          Selling
                        </Button>
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

                    <DesktopOrdersTable orders={orders} orderMode={orderMode} onRowClick={handleOrderClick} loading={ordersLoading} />
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
                      onRowClick={(listing) => router.push(`/marketplace/product/${listing.id}`)} 
                      onEdit={handleEditListing}
                      onArchive={handleArchiveListing}
                      onDelete={handleDeleteListing}
                      loading={listingsLoading} 
                    />
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
                  <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
                    <Button
                      variant={orderMode === 'buying' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setOrderMode('buying')}
                    >
                      Buying
                    </Button>
                    <Button
                      variant={orderMode === 'selling' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setOrderMode('selling')}
                    >
                      Selling
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search..." className="pl-8 h-10" />
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
                  ) : orders.length === 0 ? (
                    <div className="text-center py-12">
                      <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <p className="font-medium">No orders yet</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {orderMode === 'buying' ? 'Start shopping' : 'List something to sell'}
                      </p>
                    </div>
                  ) : (
                    orders.map((order) => (
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
                    listings.map((listing) => (
                      <MobileListingCard 
                        key={listing.id} 
                        listing={listing} 
                        onClick={() => router.push(`/marketplace/product/${listing.id}`)}
                        onEdit={() => handleEditListing(listing)}
                        onArchive={() => handleArchiveListing(listing)}
                        onDelete={() => handleDeleteListing(listing)}
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
                orderMode={orderMode}
                onViewProduct={(id) => { router.push(`/marketplace/product/${id}`); setSheetOpen(false); }}
                onConfirmReceipt={handleConfirmReceipt}
                confirmingId={confirmingId}
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
    </>
  );
}
