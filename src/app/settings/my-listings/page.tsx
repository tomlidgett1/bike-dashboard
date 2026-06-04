"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Package,
  Trash2,
  Eye,
  Plus,
  Loader2,
  Zap,
  CheckCircle2,
  MoreHorizontal,
  ExternalLink,
  Edit,
  Sparkles,
  Upload,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { Card } from "@/components/ui/card";
import { PageContainer, PageHeader, PageBody } from "@/components/dashboard";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { useUserProfile } from "@/components/providers/profile-provider";
import { SmartUploadModal } from "@/components/marketplace/sell/smart-upload-modal";
import { FacebookImportModal } from "@/components/marketplace/sell/facebook-import-modal";
import { BulkUploadSheet } from "@/components/marketplace/sell/bulk-upload-sheet";
import { cn } from "@/lib/utils";

// ============================================================
// Types
// ============================================================

interface Listing {
  id: string;
  user_id: string;
  description: string;
  price: number;
  listing_status: "active" | "sold" | "expired" | "draft" | "published";
  marketplace_category: string;
  marketplace_subcategory: string | null;
  condition_rating: string | null;
  primary_image_url: string | null;
  images: any[];
  created_at: string;
  published_at: string | null;
  expires_at: string | null;
  bike_type: string | null;
  frame_size: string | null;
  is_active: boolean;
  views?: number;
}

type TabType = "active" | "inactive" | "sold" | "expired";

// ============================================================
// Status dot helper
// ============================================================

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-500",
    inactive: "bg-muted-foreground/40",
    sold: "bg-blue-500",
    expired: "bg-amber-400",
    published: "bg-green-500",
    draft: "bg-muted-foreground/40",
  };
  const labels: Record<string, string> = {
    active: "Active",
    inactive: "Inactive",
    sold: "Sold",
    expired: "Expired",
    published: "Published",
    draft: "Draft",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", colors[status] ?? "bg-muted-foreground/40")} />
      <span className="text-xs text-muted-foreground">{labels[status] ?? status}</span>
    </span>
  );
}

// ============================================================
// Create Listing Dropdown
// ============================================================

interface CreateListingDropdownProps {
  onSelectQuick: () => void;
  onSelectFacebook: () => void;
  onSelectBulk: () => void;
}

function CreateListingDropdown({ onSelectQuick, onSelectFacebook, onSelectBulk }: CreateListingDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-8 text-xs gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Create listing
          <ChevronDown className="h-3 w-3 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onSelectQuick} className="gap-2.5 cursor-pointer">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs font-medium">Quick upload</p>
            <p className="text-[11px] text-muted-foreground">AI fills in details</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSelectFacebook} className="gap-2.5 cursor-pointer">
          <Image src="/facebook.png" alt="Facebook" width={14} height={14} className="flex-shrink-0" />
          <div>
            <p className="text-xs font-medium">Import from Facebook</p>
            <p className="text-[11px] text-muted-foreground">Paste a Marketplace link</p>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSelectBulk} className="gap-2.5 cursor-pointer">
          <Upload className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs font-medium">Bulk upload</p>
            <p className="text-[11px] text-muted-foreground">List multiple items at once</p>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================
// Mobile Action Sheet (shadcn Sheet)
// ============================================================

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing | null;
  onBoost: (id: string) => void;
  onMarkAsSold: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}

function MobileActionSheet({ isOpen, onClose, listing, onBoost, onMarkAsSold, onDelete, onView, onEdit }: ActionSheetProps) {
  if (!listing) return null;

  const primaryImage = listing.primary_image_url || (Array.isArray(listing.images) && listing.images[0]?.url);

  const handleAction = (fn: () => void) => {
    onClose();
    fn();
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 gap-0" showCloseButton={false}>
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 bg-muted-foreground/20 rounded-full" />
        </div>

        {/* Listing preview */}
        <div className="px-4 py-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-muted overflow-hidden flex-shrink-0">
            {primaryImage ? (
              <img src={primaryImage as string} alt={listing.description} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <Package className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground truncate">{listing.description || "Untitled"}</p>
            <p className="text-xs text-muted-foreground">${listing.price?.toLocaleString("en-AU")}</p>
          </div>
        </div>

        <Separator />

        <button
          onClick={() => handleAction(() => onView(listing.id))}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors text-left"
        >
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">View listing</span>
        </button>

        <Separator />

        <button
          onClick={() => handleAction(() => onEdit(listing.id))}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors text-left"
        >
          <Edit className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Edit listing</span>
        </button>

        <Separator />

        {listing.listing_status !== "sold" && (
          <>
            <button
              onClick={() => handleAction(() => onMarkAsSold(listing.id))}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors text-left"
            >
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Mark as sold</span>
            </button>
            <Separator />
          </>
        )}

        <button
          onClick={() => handleAction(() => onDelete(listing.id))}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 active:bg-muted transition-colors text-left"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Delete listing</span>
        </button>

        <div className="h-safe-area-inset-bottom pb-4" />
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Mobile Listing Card
// ============================================================

interface ListingCardProps {
  listing: Listing;
  onActionClick: (listing: Listing) => void;
  onView: (id: string) => void;
  formatDate: (date: string) => string;
  onToggleActive: (id: string, currentIsActive: boolean) => void;
  isToggling: boolean;
}

function MobileListingCard({ listing, onActionClick, onView, formatDate, onToggleActive, isToggling }: ListingCardProps) {
  const primaryImage = listing.primary_image_url || (Array.isArray(listing.images) && listing.images[0]?.url);

  return (
    <div className="border-b last:border-b-0">
      <div className="px-4 py-3 flex gap-3">
        <button onClick={() => onView(listing.id)} className="flex-shrink-0 h-16 w-16 rounded-md bg-muted overflow-hidden">
          {primaryImage ? (
            <img src={primaryImage as string} alt={listing.description} className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <button onClick={() => onView(listing.id)} className="text-left min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                {listing.description || "Untitled Listing"}
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5">
                ${listing.price?.toLocaleString("en-AU")}
              </p>
            </button>
            <button
              onClick={() => onActionClick(listing)}
              className="p-1.5 -mr-1 -mt-0.5 rounded-md hover:bg-muted transition-colors flex-shrink-0"
            >
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-3">
              <StatusDot status={listing.listing_status} />
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                {listing.views?.toLocaleString() || 0}
              </span>
              <span className="text-xs text-muted-foreground">{formatDate(listing.created_at)}</span>
            </div>
            <Switch
              checked={listing.is_active}
              onCheckedChange={() => onToggleActive(listing.id, listing.is_active)}
              disabled={isToggling || listing.listing_status === "sold"}
              className="scale-[0.8]"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Main Page
// ============================================================

export default function MyListingsPage() {
  const router = useRouter();
  const { profile } = useUserProfile();
  const isVerifiedStore = profile?.account_type === "bicycle_store" && profile?.bicycle_store === true;

  const [activeTab, setActiveTab] = React.useState<TabType>("active");
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = React.useState(false);
  const [selectedListing, setSelectedListing] = React.useState<Listing | null>(null);
  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set());

  // Upload modal state
  const [smartUploadOpen, setSmartUploadOpen] = React.useState(false);
  const [facebookImportOpen, setFacebookImportOpen] = React.useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = React.useState(false);

  React.useEffect(() => {
    fetchListings();
  }, [activeTab]);

  const fetchListings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketplace/listings?status=${activeTab}`);
      if (!response.ok) throw new Error("Failed to fetch listings");
      const data = await response.json();
      setListings(data.listings || []);
    } catch (err) {
      console.error("Error fetching listings:", err);
      setError("Failed to load listings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBoost = (id: string) => {
    // TODO: implement
  };

  const handleDelete = (id: string) => {
    // TODO: implement
  };

  const handleMarkAsSold = (id: string) => {
    // TODO: implement
  };

  const handleView = (id: string) => {
    router.push(`/marketplace/product/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/marketplace/sell?edit=${id}`);
  };

  const handleToggleActive = async (id: string, currentIsActive: boolean) => {
    if (togglingIds.has(id)) return;
    setTogglingIds(prev => new Set(prev).add(id));

    // Optimistic update
    setListings(prev =>
      prev.map(l => l.id === id ? { ...l, is_active: !currentIsActive } : l)
    );

    try {
      const response = await fetch(`/api/marketplace/listings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentIsActive, logChanges: true }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to update listing status (${response.status})`);
      }
    } catch (err) {
      // Revert on failure
      setListings(prev =>
        prev.map(l => l.id === id ? { ...l, is_active: currentIsActive } : l)
      );
      const message = err instanceof Error ? err.message : "Failed to update listing status";
      setError(message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setTogglingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) return `${Math.floor(diff / (1000 * 60))}m ago`;
      return `${hours}h ago`;
    }
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  };

  const getCategoryLabel = (category: string) => {
    if (category === "Bicycles") return "Bike";
    if (category === "Parts") return "Part";
    if (category === "Apparel") return "Apparel";
    return category;
  };

  const getConditionLabel = (condition: string | null) => {
    if (!condition) return "—";
    const labels: Record<string, string> = {
      like_new: "Like new",
      excellent: "Excellent",
      good: "Good",
      fair: "Fair",
      poor: "Poor",
    };
    return labels[condition] || condition;
  };

  const TABS: { id: TabType; label: string }[] = [
    { id: "active", label: "Active" },
    { id: "inactive", label: "Inactive" },
    { id: "sold", label: "Sold" },
    { id: "expired", label: "Expired" },
  ];

  const EMPTY_MESSAGES: Record<TabType, string> = {
    active: "No active listings. Create one to start selling.",
    inactive: "No inactive listings.",
    sold: "No sold listings yet.",
    expired: "No expired listings.",
  };

  const createListingProps = {
    onSelectQuick: () => setSmartUploadOpen(true),
    onSelectFacebook: () => setFacebookImportOpen(true),
    onSelectBulk: () => setBulkUploadOpen(true),
  };

  const content = (
    <Card className="gap-0 py-0">
      {/* Toolbar: tabs + create */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <CreateListingDropdown {...createListingProps} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 sm:px-6 py-2 border-b">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center gap-3">
          <Package className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">{EMPTY_MESSAGES[activeTab]}</p>
          {activeTab === "active" && (
            <CreateListingDropdown {...createListingProps} />
          )}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="sm:hidden">
            {listings.map(listing => (
              <MobileListingCard
                key={listing.id}
                listing={listing}
                onActionClick={l => { setSelectedListing(l); setActionSheetOpen(true); }}
                onView={handleView}
                formatDate={formatDate}
                onToggleActive={handleToggleActive}
                isToggling={togglingIds.has(listing.id)}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6 w-[360px]">Listing</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead>Views</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listings.map(listing => {
                  const primaryImage = listing.primary_image_url || (Array.isArray(listing.images) && listing.images[0]?.url);
                  return (
                    <TableRow key={listing.id} className="group">
                      {/* Listing */}
                      <TableCell className="py-2.5 pl-6">
                        <div className="flex items-center gap-3 max-w-[320px]">
                          <div className="h-10 w-10 rounded-md bg-muted overflow-hidden flex-shrink-0">
                            {primaryImage ? (
                              <img src={primaryImage as string} alt={listing.description} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-foreground line-clamp-1">
                              {listing.description || "Untitled"}
                            </p>
                            {listing.bike_type && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                                {listing.bike_type}{listing.frame_size && ` · ${listing.frame_size}`}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      {/* Category */}
                      <TableCell className="py-2.5">
                        <span className="text-xs text-muted-foreground">{getCategoryLabel(listing.marketplace_category)}</span>
                      </TableCell>

                      {/* Price */}
                      <TableCell className="py-2.5">
                        <span className="text-xs font-medium text-foreground">${listing.price?.toLocaleString("en-AU")}</span>
                      </TableCell>

                      {/* Condition */}
                      <TableCell className="py-2.5">
                        <span className="text-xs text-muted-foreground">{getConditionLabel(listing.condition_rating)}</span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-2.5">
                        <StatusDot status={listing.listing_status} />
                      </TableCell>

                      {/* Active toggle */}
                      <TableCell className="py-2.5">
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Switch
                                  checked={listing.is_active}
                                  onCheckedChange={() => handleToggleActive(listing.id, listing.is_active)}
                                  disabled={togglingIds.has(listing.id) || listing.listing_status === "sold"}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">
                              <p>{listing.is_active ? "Deactivate" : "Activate"}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>

                      {/* Views */}
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Eye className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{listing.views?.toLocaleString() || 0}</span>
                        </div>
                      </TableCell>

                      {/* Created */}
                      <TableCell className="py-2.5">
                        <span className="text-xs text-muted-foreground">{formatDate(listing.created_at)}</span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-2.5 pr-6">
                        <TooltipProvider delayDuration={0}>
                          <div className="flex items-center justify-end gap-0.5">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => handleView(listing.id)} className="h-7 w-7 p-0">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>View</p></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => handleEdit(listing.id)} className="h-7 w-7 p-0">
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>Edit</p></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => handleBoost(listing.id)} className="h-7 w-7 p-0">
                                  <Zap className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>Boost</p></TooltipContent>
                            </Tooltip>

                            {listing.listing_status !== "sold" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="sm" onClick={() => handleMarkAsSold(listing.id)} className="h-7 w-7 p-0">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom"><p>Mark sold</p></TooltipContent>
                              </Tooltip>
                            )}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(listing.id)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>Delete</p></TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );

  return (
    <>
      {isVerifiedStore ? (
        <PageContainer size="wide">
          <PageHeader title="My listings" description="Manage your marketplace listings." />
          <PageBody>{content}</PageBody>
        </PageContainer>
      ) : (
        <>
          <MarketplaceHeader compactSearchOnMobile />
          <MarketplaceLayout showFooter={false}>
            <div className="min-h-screen bg-background pt-16 pb-24 sm:pb-8">
              {content}
            </div>
          </MarketplaceLayout>
        </>
      )}

      {/* Mobile action sheet */}
      <MobileActionSheet
        isOpen={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        listing={selectedListing}
        onBoost={handleBoost}
        onMarkAsSold={handleMarkAsSold}
        onDelete={handleDelete}
        onView={handleView}
        onEdit={handleEdit}
      />

      {/* Upload modals */}
      <SmartUploadModal
        isOpen={smartUploadOpen}
        onClose={() => setSmartUploadOpen(false)}
        onComplete={(_formData, _images) => { setSmartUploadOpen(false); fetchListings(); }}
      />
      <FacebookImportModal
        isOpen={facebookImportOpen}
        onClose={() => setFacebookImportOpen(false)}
        onComplete={(_formData, _images) => { setFacebookImportOpen(false); fetchListings(); }}
      />
      <BulkUploadSheet
        isOpen={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onComplete={(_ids) => { setBulkUploadOpen(false); fetchListings(); }}
      />
    </>
  );
}
