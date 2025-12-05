"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Package,
  Trash2,
  Eye,
  Plus,
  Loader2,
  AlertCircle,
  Zap,
  PowerOff,
  CheckCircle,
  MoreHorizontal,
  ExternalLink,
  Edit,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// My Listings Dashboard Page
// Mobile-optimised with card view, Desktop with table view
// ============================================================

interface Listing {
  id: string;
  user_id: string;
  description: string;
  price: number;
  listing_status: "active" | "inactive" | "sold" | "expired" | "draft";
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

// Mobile Action Sheet Component
interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing | null;
  onBoost: (id: string) => void;
  onDeactivate: (id: string) => void;
  onMarkAsSold: (id: string) => void;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}

function MobileActionSheet({
  isOpen,
  onClose,
  listing,
  onBoost,
  onDeactivate,
  onMarkAsSold,
  onDelete,
  onView,
  onEdit,
}: ActionSheetProps) {
  if (!listing) return null;

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

            {/* Listing Info */}
            <div className="px-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-md bg-gray-100 overflow-hidden flex-shrink-0">
                  {listing.primary_image_url ? (
                    <img
                      src={listing.primary_image_url}
                      alt={listing.description}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Package className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {listing.description || "Untitled Listing"}
                  </p>
                  <p className="text-sm font-semibold text-gray-700">
                    ${listing.price?.toLocaleString("en-AU")}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
              <button
                onClick={() => {
                  onView(listing.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <ExternalLink className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">View Listing</span>
              </button>

              <button
                onClick={() => {
                  onEdit(listing.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Edit className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Edit Listing</span>
              </button>

              <button
                onClick={() => {
                  onBoost(listing.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <Zap className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-medium text-gray-900">Boost Listing</span>
              </button>

              {listing.listing_status === "active" && (
                <button
                  onClick={() => {
                    onDeactivate(listing.id);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <PowerOff className="h-5 w-5 text-gray-500" />
                  <span className="text-sm font-medium text-gray-900">Deactivate</span>
                </button>
              )}

              {listing.listing_status !== "sold" && (
                <button
                  onClick={() => {
                    onMarkAsSold(listing.id);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-gray-900">Mark as Sold</span>
                </button>
              )}

              <div className="my-2 mx-4 h-px bg-gray-100" />

              <button
                onClick={() => {
                  onDelete(listing.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 active:bg-red-100 transition-colors"
              >
                <Trash2 className="h-5 w-5 text-red-500" />
                <span className="text-sm font-medium text-red-600">Delete Listing</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Mobile Listing Card Component
interface ListingCardProps {
  listing: Listing;
  onActionClick: (listing: Listing) => void;
  onView: (id: string) => void;
  formatDate: (date: string) => string;
  getStatusBadge: (status: string) => React.ReactNode;
  getCategoryLabel: (category: string) => string;
}

function MobileListingCard({
  listing,
  onActionClick,
  onView,
  formatDate,
  getStatusBadge,
  getCategoryLabel,
}: ListingCardProps) {
  const primaryImage =
    listing.primary_image_url ||
    (Array.isArray(listing.images) && listing.images[0]?.url);

  return (
    <div className="bg-white border-b border-gray-100 last:border-b-0">
      <div className="p-4">
        <div className="flex gap-3">
          {/* Image */}
          <button
            onClick={() => onView(listing.id)}
            className="flex-shrink-0 h-20 w-20 rounded-md bg-gray-100 overflow-hidden"
          >
            {primaryImage ? (
              <img
                src={primaryImage}
                alt={listing.description}
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
                  onClick={() => onView(listing.id)}
                  className="text-left"
                >
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">
                    {listing.description || "Untitled Listing"}
                  </p>
                </button>
                <p className="text-base font-semibold text-gray-900 mt-1">
                  ${listing.price?.toLocaleString("en-AU")}
                </p>
              </div>

              {/* More Actions Button */}
              <button
                onClick={() => onActionClick(listing)}
                className="p-2 -mr-2 -mt-1 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <MoreHorizontal className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Meta Info */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {getStatusBadge(listing.listing_status)}
              <Badge variant="secondary" className="rounded-md text-xs">
                {getCategoryLabel(listing.marketplace_category)}
              </Badge>
            </div>

            {/* Stats Row */}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />
                {listing.views?.toLocaleString() || 0} views
              </span>
              <span>{formatDate(listing.created_at)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyListingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<TabType>("active");
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = React.useState(false);
  const [selectedListing, setSelectedListing] = React.useState<Listing | null>(null);

  // Fetch listings
  React.useEffect(() => {
    fetchListings();
  }, [activeTab]);

  const fetchListings = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/marketplace/listings?status=${activeTab}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch listings");
      }

      const data = await response.json();
      setListings(data.listings || []);
    } catch (error) {
      console.error("Error fetching listings:", error);
      setError("Failed to load listings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Action handlers
  const handleBoost = (id: string) => {
    console.log("Boost listing:", id);
  };

  const handleDeactivate = (id: string) => {
    console.log("Deactivate listing:", id);
  };

  const handleDelete = (id: string) => {
    console.log("Delete listing:", id);
  };

  const handleMarkAsSold = (id: string) => {
    console.log("Mark as sold:", id);
  };

  const handleView = (id: string) => {
    router.push(`/marketplace/product/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/marketplace/sell?edit=${id}`);
  };

  const handleMobileActionClick = (listing: Listing) => {
    setSelectedListing(listing);
    setActionSheetOpen(true);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes}m ago`;
      }
      return `${hours}h ago`;
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

  const getStatusBadge = (status: string) => {
    const dotColors: Record<string, string> = {
      active: "bg-green-500",
      inactive: "bg-gray-400",
      sold: "bg-blue-500",
      expired: "bg-amber-500",
    };

    const labels: Record<string, string> = {
      active: "Active",
      inactive: "Inactive",
      sold: "Sold",
      expired: "Expired",
    };

    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotColors[status] || "bg-gray-400")} />
        {labels[status] || status}
      </span>
    );
  };

  const getCategoryLabel = (category: string) => {
    if (category === "Bicycles") return "Bike";
    if (category === "Parts") return "Part";
    if (category === "Apparel") return "Apparel";
    return category;
  };

  const getConditionLabel = (condition: string | null) => {
    if (!condition) return "-";
    const labels: Record<string, string> = {
      like_new: "Like New",
      excellent: "Excellent",
      good: "Good",
      fair: "Fair",
      poor: "Poor",
    };
    return labels[condition] || condition;
  };

  const tabs = [
    { id: "active" as TabType, label: "Active", color: "bg-green-500" },
    { id: "inactive" as TabType, label: "Inactive", color: "bg-gray-400" },
    { id: "sold" as TabType, label: "Sold", color: "bg-blue-500" },
    { id: "expired" as TabType, label: "Expired", color: "bg-amber-500" },
  ];

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout showFooter={false}>
        <div className="min-h-screen bg-gray-50 pt-14 sm:pt-16">
          {/* Page Header */}
          <div className="border-b border-gray-200 bg-white">
            <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-md bg-gray-100 flex-shrink-0">
                    <Package className="h-6 w-6 text-gray-700" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Listings</h1>
                    <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                      Manage your marketplace listings
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => router.push("/marketplace/sell")}
                  className="rounded-md bg-gray-900 hover:bg-gray-800 text-white flex-shrink-0"
                  size="sm"
                >
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Create Listing</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Content Container */}
          <div className="max-w-[1920px] mx-auto">
            {/* Tabs - Scrollable on mobile */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-white border-b border-gray-200 overflow-x-auto">
              <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit min-w-max">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
                      activeTab === tab.id
                        ? "text-gray-800 bg-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70"
                    )}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <span className={cn("h-2 w-2 rounded-full", tab.color)} />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mx-4 sm:mx-6 my-4">
                <div className="rounded-md border border-red-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h3 className="text-sm font-semibold text-red-900">Error</h3>
                      <p className="mt-1 text-sm text-red-600">{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Content */}
            <div className="bg-white sm:bg-transparent">
              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : listings.length === 0 ? (
                /* Empty State */
                <div className="flex items-center justify-center py-16 sm:py-24 px-4">
                  <div className="text-center">
                    <div className="mb-4 sm:mb-6 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-md bg-gray-100 mx-auto">
                      <Package className="h-8 w-8 sm:h-10 sm:w-10 text-gray-400" />
                    </div>
                    <h3 className="mb-2 text-base sm:text-lg font-semibold text-gray-900">
                      No {activeTab} listings
                    </h3>
                    <p className="mb-6 max-w-md text-sm text-gray-600 mx-auto">
                      {activeTab === "active" &&
                        "You don't have any active listings. Create one to start selling!"}
                      {activeTab === "inactive" &&
                        "You don't have any inactive listings."}
                      {activeTab === "sold" &&
                        "You haven't marked any listings as sold yet."}
                      {activeTab === "expired" && "No expired listings."}
                    </p>
                    {activeTab === "active" && (
                      <Button
                        onClick={() => router.push("/marketplace/sell")}
                        className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Listing
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="sm:hidden">
                    {listings.map((listing) => (
                      <MobileListingCard
                        key={listing.id}
                        listing={listing}
                        onActionClick={handleMobileActionClick}
                        onView={handleView}
                        formatDate={formatDate}
                        getStatusBadge={getStatusBadge}
                        getCategoryLabel={getCategoryLabel}
                      />
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden sm:block bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[380px] max-w-[380px] px-6">Listing</TableHead>
                          <TableHead className="px-4">Category</TableHead>
                          <TableHead className="px-4">Price</TableHead>
                          <TableHead className="px-4">Condition</TableHead>
                          <TableHead className="px-4">Status</TableHead>
                          <TableHead className="px-4">Views</TableHead>
                          <TableHead className="px-4">Created</TableHead>
                          <TableHead className="px-6 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {listings.map((listing) => {
                          const primaryImage =
                            listing.primary_image_url ||
                            (Array.isArray(listing.images) &&
                              listing.images[0]?.url);

                          return (
                            <TableRow
                              key={listing.id}
                              className="group border-b border-border/50 hover:bg-gray-50/50 transition-colors"
                            >
                              {/* Listing Column */}
                              <TableCell className="py-3 px-6 w-[380px] max-w-[380px]">
                                <div className="flex items-center gap-3 max-w-[340px]">
                                  <div className="flex-shrink-0 h-12 w-12 rounded-md bg-gray-100 overflow-hidden">
                                    {primaryImage ? (
                                      <img
                                        src={primaryImage}
                                        alt={listing.description}
                                        className="h-full w-full object-cover"
                                      />
                                    ) : (
                                      <div className="h-full w-full flex items-center justify-center">
                                        <Package className="h-5 w-5 text-gray-400" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 line-clamp-1 truncate">
                                      {listing.description || "Untitled Listing"}
                                    </p>
                                    {listing.bike_type && (
                                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                                        {listing.bike_type}
                                        {listing.frame_size &&
                                          ` • ${listing.frame_size}`}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </TableCell>

                              {/* Category Column */}
                              <TableCell className="py-3 px-4">
                                <Badge
                                  variant="secondary"
                                  className="rounded-md text-xs font-medium"
                                >
                                  {getCategoryLabel(listing.marketplace_category)}
                                </Badge>
                              </TableCell>

                              {/* Price Column */}
                              <TableCell className="py-3 px-4">
                                <span className="text-sm font-semibold text-gray-900">
                                  ${listing.price?.toLocaleString("en-AU")}
                                </span>
                              </TableCell>

                              {/* Condition Column */}
                              <TableCell className="py-3 px-4">
                                <span className="text-sm text-gray-600">
                                  {getConditionLabel(listing.condition_rating)}
                                </span>
                              </TableCell>

                              {/* Status Column */}
                              <TableCell className="py-3 px-4">
                                {getStatusBadge(listing.listing_status)}
                              </TableCell>

                              {/* Views Column */}
                              <TableCell className="py-3 px-4">
                                <div className="flex items-center gap-1.5">
                                  <Eye className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="text-sm text-gray-600">
                                    {listing.views?.toLocaleString() || 0}
                                  </span>
                                </div>
                              </TableCell>

                              {/* Created Column */}
                              <TableCell className="py-3 px-4">
                                <span className="text-sm text-gray-500">
                                  {formatDate(listing.created_at)}
                                </span>
                              </TableCell>

                              {/* Actions Column */}
                              <TableCell className="py-3 px-6">
                                <TooltipProvider delayDuration={0}>
                                  <div className="flex items-center justify-end gap-1">
                                    {/* View */}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleView(listing.id)}
                                          className="rounded-md h-8 w-8 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                        >
                                          <ExternalLink className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        <p>View</p>
                                      </TooltipContent>
                                    </Tooltip>

                                    {/* Boost */}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleBoost(listing.id)}
                                          className="rounded-md h-8 w-8 p-0 text-gray-500 hover:text-amber-600 hover:bg-amber-50"
                                        >
                                          <Zap className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        <p>Boost</p>
                                      </TooltipContent>
                                    </Tooltip>

                                    {/* Deactivate */}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDeactivate(listing.id)}
                                          className="rounded-md h-8 w-8 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                                        >
                                          <PowerOff className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        <p>Deactivate</p>
                                      </TooltipContent>
                                    </Tooltip>

                                    {/* Mark as Sold */}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleMarkAsSold(listing.id)}
                                          className="rounded-md h-8 w-8 p-0 text-gray-500 hover:text-green-600 hover:bg-green-50"
                                        >
                                          <CheckCircle className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        <p>Mark as Sold</p>
                                      </TooltipContent>
                                    </Tooltip>

                                    {/* Delete */}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDelete(listing.id)}
                                          className="rounded-md h-8 w-8 p-0 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="bottom">
                                        <p>Delete</p>
                                      </TooltipContent>
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
            </div>
          </div>
        </div>
      </MarketplaceLayout>

      {/* Mobile Action Sheet */}
      <MobileActionSheet
        isOpen={actionSheetOpen}
        onClose={() => setActionSheetOpen(false)}
        listing={selectedListing}
        onBoost={handleBoost}
        onDeactivate={handleDeactivate}
        onMarkAsSold={handleMarkAsSold}
        onDelete={handleDelete}
        onView={handleView}
        onEdit={handleEdit}
      />
    </>
  );
}
