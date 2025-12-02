"use client";

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

// ============================================================
// My Listings Dashboard Page - Table View
// Shows all user's marketplace listings with management actions
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

export default function MyListingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<TabType>("active");
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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

  // Placeholder action handlers - to be implemented
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
      }
      return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return `${days} days ago`;
    } else {
      return date.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
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
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md">
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

  return (
    <>
      <MarketplaceHeader />

      <MarketplaceLayout showFooter={false}>
        <div className="min-h-screen bg-gray-50 pt-16">
          {/* Page Header */}
          <div className="border-b border-gray-200 bg-white">
            <div className="max-w-[1920px] mx-auto px-6 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-md bg-gray-100">
                    <Package className="h-6 w-6 text-gray-700" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">My Listings</h1>
                    <p className="text-sm text-gray-600">
                      Manage your marketplace listings
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => router.push("/marketplace/sell")}
                  className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Listing
                </Button>
              </div>
            </div>
          </div>

          {/* Content Container */}
          <div className="max-w-[1920px] mx-auto">
        {/* Tabs */}
            <div className="px-6 py-4 bg-white border-b border-gray-200">
              <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "active"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
            onClick={() => setActiveTab("active")}
          >
                  <span className="h-2 w-2 rounded-full bg-green-500" />
            Active
          </button>

          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    activeTab === "inactive"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
                  onClick={() => setActiveTab("inactive")}
          >
                  <span className="h-2 w-2 rounded-full bg-gray-400" />
                  Inactive
          </button>

          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "sold"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
            onClick={() => setActiveTab("sold")}
          >
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
            Sold
          </button>

          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "expired"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
            onClick={() => setActiveTab("expired")}
          >
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
            Expired
          </button>
        </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mx-6 my-4">
                <div className="rounded-md border border-red-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-semibold text-red-900">Error</h3>
                      <p className="mt-1 text-sm text-red-600">{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Table Container */}
            <div className="bg-white">
        {loading ? (
                <div className="flex items-center justify-center py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : listings.length === 0 ? (
                /* Empty State */
                <div className="flex items-center justify-center py-24">
                  <div className="text-center">
                    <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-md bg-gray-100 mx-auto">
                      <Package className="h-10 w-10 text-gray-400" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">
              No {activeTab} listings
            </h3>
                    <p className="mb-6 max-w-md text-gray-600 mx-auto">
                      {activeTab === "active" &&
                        "You don't have any active listings. Create one to start selling!"}
                      {activeTab === "inactive" &&
                        "You don't have any inactive listings. Deactivate a listing to pause it temporarily."}
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
                /* Table */
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
              )}
            </div>
          </div>
        </div>
      </MarketplaceLayout>
    </>
  );
}
