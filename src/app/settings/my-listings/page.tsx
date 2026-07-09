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
  Tag,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
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
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
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
    active: "bg-gray-700",
    inactive: "bg-gray-300",
    sold: "bg-gray-500",
    expired: "bg-gray-400",
    published: "bg-gray-700",
    draft: "bg-gray-300",
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
        <Button size="sm" className="rounded-full">
          <Plus className="size-4" />
          Create listing
          <ChevronDown className="size-3.5 opacity-70" />
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
  selected: boolean;
  onToggleSelect: (id: string) => void;
}

function MobileListingCard({
  listing,
  onActionClick,
  onView,
  formatDate,
  onToggleActive,
  isToggling,
  selected,
  onToggleSelect,
}: ListingCardProps) {
  const primaryImage = listing.primary_image_url || (Array.isArray(listing.images) && listing.images[0]?.url);

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div className="flex gap-3 px-3 py-2.5 transition-colors hover:bg-gray-50">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(listing.id)}
          aria-label={`Select ${listing.description || "listing"}`}
          className="mt-1 flex-shrink-0"
        />
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
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteMode, setDeleteMode] = React.useState<"single" | "selected" | "page" | "all">("selected");
  const [singleDeleteId, setSingleDeleteId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // Upload modal state
  const [smartUploadOpen, setSmartUploadOpen] = React.useState(false);
  const [facebookImportOpen, setFacebookImportOpen] = React.useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = React.useState(false);

  React.useEffect(() => {
    setSelected(new Set());
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

  const allChecked = listings.length > 0 && listings.every((l) => selected.has(l.id));
  const someChecked = listings.some((l) => selected.has(l.id));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allChecked ? new Set() : new Set(listings.map((l) => l.id)));
  };

  const openDeleteDialog = (mode: "single" | "selected" | "page" | "all", id?: string) => {
    setDeleteMode(mode);
    setSingleDeleteId(id ?? null);
    setDeleteDialogOpen(true);
  };

  const getDeleteCount = () => {
    if (deleteMode === "all") return listings.length;
    if (deleteMode === "page") return listings.length;
    if (deleteMode === "single") return 1;
    return selected.size;
  };

  const handleDelete = (id: string) => {
    setActionSheetOpen(false);
    openDeleteDialog("single", id);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      let body: { listingIds?: string[]; deleteAll?: boolean; status?: TabType };

      if (deleteMode === "all") {
        body = { deleteAll: true, status: activeTab };
      } else if (deleteMode === "page") {
        body = { listingIds: listings.map((l) => l.id) };
      } else if (deleteMode === "single" && singleDeleteId) {
        body = { listingIds: [singleDeleteId] };
      } else {
        body = { listingIds: [...selected] };
      }

      const response = await fetch("/api/marketplace/listings/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || "Failed to delete listings");

      setSelected(new Set());
      setSingleDeleteId(null);
      setDeleteDialogOpen(false);
      await fetchListings();
    } catch (err) {
      console.error("Error deleting listings:", err);
      setError(err instanceof Error ? err.message : "Failed to delete listings");
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsDeleting(false);
    }
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

  const tabBar = (
    <div className="flex items-center bg-gray-100 p-0.5 rounded-full w-fit">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-full transition-colors",
            activeTab === tab.id
              ? "text-gray-800 bg-white shadow-sm"
              : "text-gray-600 hover:bg-gray-200/70",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const content = (
    <>
      {!isVerifiedStore && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {tabBar}
          <CreateListingDropdown {...createListingProps} />
        </div>
      )}

      {isVerifiedStore && <div className="mb-4">{tabBar}</div>}

      {!loading && listings.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-3 py-2.5">
          {selected.size > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">{selected.size} selected</span>
              <Button
                variant="outline"
                size="xs"
                className="rounded-full text-destructive hover:text-destructive"
                onClick={() => openDeleteDialog("selected")}
              >
                <Trash2 className="size-3.5" />
                Delete selected
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="rounded-full text-muted-foreground"
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              Select listings to run bulk actions
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="xs" onClick={toggleAll}>
              {allChecked ? "Deselect all" : "Select all on page"}
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="text-destructive hover:text-destructive"
              onClick={() => openDeleteDialog("page")}
            >
              <Trash2 className="size-3.5" />
              Delete all on page
            </Button>
            <Button
              variant="outline"
              size="xs"
              className="text-destructive hover:text-destructive"
              onClick={() => openDeleteDialog("all")}
            >
              <Trash2 className="size-3.5" />
              Delete all in tab
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-white px-3 py-2">
          <p className="text-xs text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : listings.length === 0 ? (
        <div className="rounded-md border border-dashed border-gray-200 bg-white py-12 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-600">{EMPTY_MESSAGES[activeTab]}</p>
          {activeTab === "active" && (
            <div className="mt-4 flex justify-center">
              <CreateListingDropdown {...createListingProps} />
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-gray-200 bg-white">
          {/* Mobile list */}
          <div className="divide-y divide-gray-100 sm:hidden">
            {listings.map((listing) => (
              <MobileListingCard
                key={listing.id}
                listing={listing}
                onActionClick={l => { setSelectedListing(l); setActionSheetOpen(true); }}
                onView={handleView}
                formatDate={formatDate}
                onToggleActive={handleToggleActive}
                isToggling={togglingIds.has(listing.id)}
                selected={selected.has(listing.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-6">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all listings on page"
                    />
                  </TableHead>
                  <TableHead className="w-[360px]">Listing</TableHead>
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
                      <TableCell className="py-2.5 pl-6">
                        <Checkbox
                          checked={selected.has(listing.id)}
                          onCheckedChange={() => toggleSelect(listing.id)}
                          aria-label={`Select ${listing.description || "listing"}`}
                        />
                      </TableCell>
                      {/* Listing */}
                      <TableCell className="py-2.5">
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
                                <Button variant="ghost" size="icon-sm" onClick={() => handleView(listing.id)}>
                                  <ExternalLink className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>View</p></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon-sm" onClick={() => handleEdit(listing.id)}>
                                  <Edit className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>Edit</p></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon-sm" onClick={() => handleBoost(listing.id)}>
                                  <Zap className="size-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="bottom"><p>Boost</p></TooltipContent>
                            </Tooltip>

                            {listing.listing_status !== "sold" && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" onClick={() => handleMarkAsSold(listing.id)}>
                                    <CheckCircle2 className="size-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom"><p>Mark sold</p></TooltipContent>
                              </Tooltip>
                            )}

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(listing.id)} className="text-muted-foreground hover:text-destructive">
                                  <Trash2 className="size-4" />
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
        </div>
      )}
    </>
  );

  return (
    <>
      {isVerifiedStore ? (
        <DashboardFloatingPage
          title="My listings"
          icon={Tag}
          description="Manage your marketplace listings."
          actions={<CreateListingDropdown {...createListingProps} />}
          flush
        >
          <div className="p-4 md:p-5">{content}</div>
        </DashboardFloatingPage>
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-md bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteMode === "all"
                ? `Delete all ${activeTab} listings?`
                : deleteMode === "page"
                  ? "Delete all listings on this page?"
                  : deleteMode === "single"
                    ? "Delete this listing?"
                    : "Delete selected listings?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === "all"
                ? `This will remove all listings in the ${activeTab} tab. Drafts are deleted permanently; active listings are removed from the marketplace.`
                : `This will remove ${getDeleteCount()} listing${getDeleteCount() === 1 ? "" : "s"}. Drafts are deleted permanently; active listings are removed from the marketplace.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
