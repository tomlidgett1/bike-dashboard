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
  Mail,
  DollarSign,
  Archive,
  AlertCircle,
  Tag,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
// Status Badge Variants
// ============================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending", variant: "secondary" },
    confirmed: { label: "Confirmed", variant: "secondary" },
    paid: { label: "Paid", variant: "default" },
    shipped: { label: "Shipped", variant: "default" },
    delivered: { label: "Delivered", variant: "default" },
    cancelled: { label: "Cancelled", variant: "outline" },
    refunded: { label: "Refunded", variant: "destructive" },
  };
  
  const { label, variant } = config[status] || { label: status, variant: "outline" as const };
  
  return <Badge variant={variant}>{label}</Badge>;
}

// ============================================================
// Navigation Sidebar Item
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
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors w-full",
        isActive 
          ? "bg-accent text-accent-foreground" 
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined && count > 0 && (
        <span className="text-xs text-muted-foreground tabular-nums">{count}</span>
      )}
    </button>
  );
}

// ============================================================
// Order Card (shadcn style)
// ============================================================

function OrderCard({
  purchase,
  isSelected,
  onClick,
  onMoreClick,
  getSellerName,
  viewMode,
}: {
  purchase: Purchase;
  isSelected: boolean;
  onClick: () => void;
  onMoreClick: (e: React.MouseEvent) => void;
  getSellerName: (seller: Purchase["seller"]) => string;
  viewMode: ViewMode;
}) {
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 p-4 rounded-md border cursor-pointer transition-colors",
        isSelected 
          ? "bg-accent border-border" 
          : "bg-card hover:bg-accent/50 border-transparent"
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

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium leading-none truncate">{productName}</p>
        <p className="text-xs text-muted-foreground">
          {viewMode === 'buying' ? getSellerName(purchase.seller) : 'Buyer'} · {formatDate(purchase.purchase_date)}
        </p>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-sm font-medium">${purchase.total_amount.toFixed(2)}</p>
          <StatusBadge status={purchase.status} />
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onMoreClick}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>
              <ExternalLink className="mr-2 h-4 w-4" />
              View Product
            </DropdownMenuItem>
            <DropdownMenuItem>
              <MessageCircle className="mr-2 h-4 w-4" />
              {viewMode === 'buying' ? 'Contact Seller' : 'Contact Buyer'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <HelpCircle className="mr-2 h-4 w-4" />
              Get Help
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ============================================================
// Detail Sheet Content
// ============================================================

function OrderDetailContent({
  purchase,
  onViewProduct,
  onContactSeller,
  onConfirmReceipt,
  confirmingId,
  getSellerName,
  viewMode,
}: {
  purchase: Purchase;
  onViewProduct: (id: string) => void;
  onContactSeller: (id: string) => void;
  onConfirmReceipt: (id: string) => void;
  confirmingId: string | null;
  getSellerName: (seller: Purchase["seller"]) => string;
  viewMode: ViewMode;
}) {
  const [copied, setCopied] = React.useState(false);
  const productImage = getProductImageUrl(purchase.product);
  const productName = getProductName(purchase.product);
  const p = normalizeProduct(purchase.product);
  const canConfirmReceipt = purchase.funds_status === 'held' && viewMode === 'buying';
  const isConfirming = confirmingId === purchase.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(purchase.order_number);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric'
  });

  return (
    <div className="space-y-6">
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
          <p className="font-medium leading-tight">{productName}</p>
          {p?.marketplace_category && (
            <p className="text-sm text-muted-foreground mt-1">{p.marketplace_category}</p>
          )}
          <div className="mt-2">
            <StatusBadge status={purchase.status} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Order Info */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Order number</span>
          <div className="flex items-center gap-2">
            <code className="text-sm">#{purchase.order_number}</code>
            <Button variant="ghost" size="icon-sm" onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Date</span>
          <span className="text-sm">{formatDate(purchase.purchase_date)}</span>
        </div>
      </div>

      <Separator />

      {/* Seller/Buyer */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {viewMode === 'buying' ? 'Seller' : 'Buyer'}
        </p>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>
              {purchase.seller.account_type === 'bicycle_store' ? (
                <Store className="h-4 w-4" />
              ) : (
                getSellerName(purchase.seller).charAt(0).toUpperCase()
              )}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-sm font-medium">{getSellerName(purchase.seller)}</p>
            {purchase.seller.account_type === 'bicycle_store' && (
              <p className="text-xs text-muted-foreground">Verified Store</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onContactSeller(purchase.seller_id)}>
            <MessageCircle className="h-4 w-4 mr-2" />
            Message
          </Button>
        </div>
      </div>

      <Separator />

      {/* Payment */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Payment</p>
        <div className="space-y-2">
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
          <Separator className="my-2" />
          <div className="flex justify-between">
            <span className="font-medium">Total</span>
            <span className="font-semibold">${purchase.total_amount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Escrow Status */}
      {purchase.funds_status && (
        <>
          <Separator />
          <Card className="bg-muted/50">
            <CardContent className="flex items-center gap-3 py-3 px-4">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {purchase.funds_status === 'held' ? 'Payment Protected' : 
                   purchase.funds_status === 'released' ? 'Payment Released' :
                   purchase.funds_status === 'auto_released' ? 'Auto Released' :
                   purchase.funds_status === 'disputed' ? 'Under Dispute' : 'Refunded'}
                </p>
                {purchase.funds_status === 'held' && purchase.funds_release_at && (
                  <p className="text-xs text-muted-foreground">
                    Auto-releases {formatDate(purchase.funds_release_at)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Confirm Receipt */}
      {canConfirmReceipt && (
        <Button 
          className="w-full" 
          onClick={() => onConfirmReceipt(purchase.id)}
          disabled={isConfirming}
        >
          {isConfirming ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          {isConfirming ? 'Confirming...' : 'Confirm Receipt'}
        </Button>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => onViewProduct(purchase.product_id)}>
          <ExternalLink className="h-4 w-4 mr-2" />
          View Product
        </Button>
        <Button variant="outline">
          <HelpCircle className="h-4 w-4 mr-2" />
          Get Help
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Empty State
// ============================================================

function EmptyState({ viewMode, onAction }: { viewMode: ViewMode; onAction: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        {viewMode === 'selling' ? (
          <Tag className="h-8 w-8 text-muted-foreground" />
        ) : (
          <ShoppingBag className="h-8 w-8 text-muted-foreground" />
        )}
      </div>
      <h3 className="text-lg font-semibold">
        {viewMode === 'selling' ? 'No sales yet' : 'No purchases yet'}
      </h3>
      <p className="text-muted-foreground text-sm max-w-xs mt-1 mb-4">
        {viewMode === 'selling' 
          ? "When you sell items, they'll appear here."
          : "When you buy items, they'll appear here."}
      </p>
      <Button onClick={onAction}>
        {viewMode === 'selling' ? 'List an Item' : 'Browse Marketplace'}
      </Button>
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
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  
  const [purchases, setPurchases] = React.useState<Purchase[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [pagination, setPagination] = React.useState<PaginationInfo>({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
  const [selectedPurchase, setSelectedPurchase] = React.useState<Purchase | null>(null);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState({ all: 0, active: 0, completed: 0, disputes: 0, archived: 0 });
  const [sheetOpen, setSheetOpen] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const getStatusFilter = () => {
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
  }, [debouncedSearch, category, viewMode, pagination.pageSize]);

  React.useEffect(() => {
    fetchPurchases(1, true);
  }, [debouncedSearch, category, viewMode]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPurchases(pagination.page);
  };

  const handleOrderClick = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
    setSheetOpen(true);
  };

  const handleConfirmReceipt = async (purchaseId: string) => {
    if (confirmingId) return;
    if (!window.confirm("Confirm receipt? This releases payment to the seller.")) return;
    
    setConfirmingId(purchaseId);
    try {
      const response = await fetch(`/api/marketplace/purchases/${purchaseId}/confirm-receipt`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed');
      await fetchPurchases(pagination.page);
      setSheetOpen(false);
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
        <div className="min-h-screen bg-background pt-16 pb-24 sm:pb-8">
          <div className="container py-6">
            <div className="flex gap-8">
              
              {/* Sidebar */}
              <aside className="hidden lg:block w-56 flex-shrink-0">
                <div className="sticky top-20 space-y-6">
                  {/* Search */}
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-8"
                    />
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
                    <Button
                      variant={viewMode === 'selling' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="flex-1"
                      onClick={() => { setViewMode('selling'); setCategory('all'); }}
                    >
                      Sell
                    </Button>
                    <Button
                      variant={viewMode === 'buying' ? 'secondary' : 'ghost'}
                      size="sm"
                      className="flex-1"
                      onClick={() => { setViewMode('buying'); setCategory('all'); }}
                    >
                      Buy
                    </Button>
                  </div>

                  {/* Navigation */}
                  <nav className="space-y-1">
                    <NavItem icon={Mail} label="All" count={counts.all} isActive={category === 'all'} onClick={() => setCategory('all')} />
                    <NavItem icon={Package} label="Active Orders" count={counts.active} isActive={category === 'active'} onClick={() => setCategory('active')} />
                    <NavItem icon={DollarSign} label="Completed" count={counts.completed} isActive={category === 'completed'} onClick={() => setCategory('completed')} />
                    <NavItem icon={AlertCircle} label="Disputes" count={counts.disputes} isActive={category === 'disputes'} onClick={() => setCategory('disputes')} />
                    <NavItem icon={Archive} label="Archived" count={counts.archived} isActive={category === 'archived'} onClick={() => setCategory('archived')} />
                  </nav>
                </div>
              </aside>

              {/* Main Content */}
              <main className="flex-1 min-w-0">
                {/* Mobile Header */}
                <div className="lg:hidden space-y-4 mb-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
                  </div>
                  
                  <div className="flex items-center gap-1 p-1 bg-muted rounded-md">
                    <Button variant={viewMode === 'selling' ? 'secondary' : 'ghost'} size="sm" className="flex-1" onClick={() => setViewMode('selling')}>Sell</Button>
                    <Button variant={viewMode === 'buying' ? 'secondary' : 'ghost'} size="sm" className="flex-1" onClick={() => setViewMode('buying')}>Buy</Button>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(['all', 'active', 'completed', 'disputes'] as const).map((c) => (
                      <Button key={c} variant={category === c ? 'secondary' : 'outline'} size="sm" onClick={() => setCategory(c)}>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                      {viewMode === 'buying' ? 'My Purchases' : 'My Sales'}
                    </h1>
                    <p className="text-muted-foreground text-sm">
                      {pagination.total} {viewMode === 'buying' ? 'order' : 'sale'}{pagination.total !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing}>
                    <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
                  </Button>
                </div>

                {/* Content */}
                <Card>
                  {loading ? (
                    <CardContent className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </CardContent>
                  ) : purchases.length === 0 ? (
                    <EmptyState viewMode={viewMode} onAction={() => router.push(viewMode === 'selling' ? '/marketplace/sell' : '/marketplace')} />
                  ) : (
                    <CardContent className="p-2 space-y-1">
                      {purchases.map((p) => (
                        <OrderCard
                          key={p.id}
                          purchase={p}
                          isSelected={selectedPurchase?.id === p.id}
                          onClick={() => handleOrderClick(p)}
                          onMoreClick={(e) => e.stopPropagation()}
                          getSellerName={getSellerName}
                          viewMode={viewMode}
                        />
                      ))}
                    </CardContent>
                  )}

                  {pagination.totalPages > 1 && (
                    <>
                      <Separator />
                      <CardContent className="flex items-center justify-between py-3">
                        <span className="text-sm text-muted-foreground">
                          Page {pagination.page} of {pagination.totalPages}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => fetchPurchases(pagination.page - 1)}
                            disabled={pagination.page <= 1}
                          >
                            <ChevronRight className="h-4 w-4 rotate-180" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => fetchPurchases(pagination.page + 1)}
                            disabled={pagination.page >= pagination.totalPages}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </>
                  )}
                </Card>
              </main>
            </div>
          </div>
        </div>
      </MarketplaceLayout>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Order Details</SheetTitle>
          </SheetHeader>
          {selectedPurchase && (
            <div className="mt-6">
              <OrderDetailContent
                purchase={selectedPurchase}
                onViewProduct={(id) => { router.push(`/marketplace/product/${id}`); setSheetOpen(false); }}
                onContactSeller={(id) => console.log(id)}
                onConfirmReceipt={handleConfirmReceipt}
                confirmingId={confirmingId}
                getSellerName={getSellerName}
                viewMode={viewMode}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
