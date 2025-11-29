"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Package, Edit, Trash2, Eye, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ============================================================
// My Listings Dashboard Page
// ============================================================

export default function MyListingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"active" | "drafts" | "sold" | "expired">(
    "active"
  );
  const [listings, setListings] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Fetch listings
  React.useEffect(() => {
    fetchListings();
  }, [activeTab]);

  const fetchListings = async () => {
    setLoading(true);
    try {
      const statusMap = {
        active: "active",
        drafts: "draft",
        sold: "sold",
        expired: "expired",
      };

      const response = await fetch(
        `/api/marketplace/listings?status=${statusMap[activeTab]}`
      );

      if (response.ok) {
        const data = await response.json();
        setListings(data.listings || []);
      }
    } catch (error) {
      console.error("Error fetching listings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this listing?")) return;

    try {
      const response = await fetch(`/api/marketplace/listings/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchListings();
      }
    } catch (error) {
      console.error("Error deleting listing:", error);
      alert("Failed to delete listing");
    }
  };

  const handleMarkAsSold = async (id: string) => {
    try {
      const response = await fetch(`/api/marketplace/listings/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingStatus: "sold" }),
      });

      if (response.ok) {
        fetchListings();
      }
    } catch (error) {
      console.error("Error marking as sold:", error);
      alert("Failed to mark as sold");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="max-w-[1920px] mx-auto px-6">
          <div className="flex h-16 items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">My Listings</h1>
              <p className="text-sm text-gray-600">Manage your marketplace listings</p>
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
      </header>

      {/* Content */}
      <div className="max-w-[1920px] mx-auto px-6 py-8">
        {/* Tabs */}
        <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit mb-8">
          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "active"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
            onClick={() => setActiveTab("active")}
          >
            <Package className="h-4 w-4" />
            Active
          </button>

          <button
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              activeTab === "drafts"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70"
            )}
            onClick={() => setActiveTab("drafts")}
          >
            <Edit className="h-4 w-4" />
            Drafts
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
            Expired
          </button>
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading...</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No {activeTab} listings
            </h3>
            <p className="text-gray-600 mb-6">
              {activeTab === "active" && "You don't have any active listings yet."}
              {activeTab === "drafts" && "You don't have any draft listings."}
              {activeTab === "sold" && "You haven't marked any listings as sold."}
              {activeTab === "expired" && "No expired listings."}
            </p>
            {activeTab === "active" && (
              <Button
                onClick={() => router.push("/marketplace/sell")}
                className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Listing
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                onEdit={() => router.push(`/marketplace/sell?id=${listing.id}`)}
                onDelete={() => handleDelete(listing.id)}
                onMarkAsSold={() => handleMarkAsSold(listing.id)}
                onView={() => router.push(`/marketplace?id=${listing.id}`)}
                status={activeTab}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Listing Card Component
// ============================================================

interface ListingCardProps {
  listing: any;
  onEdit: () => void;
  onDelete: () => void;
  onMarkAsSold: () => void;
  onView: () => void;
  status: string;
}

function ListingCard({
  listing,
  onEdit,
  onDelete,
  onMarkAsSold,
  onView,
  status,
}: ListingCardProps) {
  const primaryImage =
    listing.primary_image_url ||
    (Array.isArray(listing.images) && listing.images[0]?.url);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="rounded-md overflow-hidden hover:shadow-lg transition-shadow">
        {/* Image */}
        <div className="relative aspect-square bg-gray-100">
          {primaryImage ? (
            <img
              src={primaryImage}
              alt={listing.description}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-12 w-12 text-gray-400" />
            </div>
          )}

          {/* Status Badge */}
          <div className="absolute top-2 right-2">
            <span
              className={cn(
                "px-2 py-1 text-xs font-medium rounded-md",
                status === "active" && "bg-green-100 text-green-800",
                status === "drafts" && "bg-gray-100 text-gray-800",
                status === "sold" && "bg-blue-100 text-blue-800",
                status === "expired" && "bg-red-100 text-red-800"
              )}
            >
              {status === "drafts" ? "Draft" : status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
              {listing.description || "Untitled Listing"}
            </h3>
            <p className="text-lg font-bold text-gray-900">
              ${listing.price?.toLocaleString("en-AU")}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {status === "active" && (
              <Button
                size="sm"
                variant="outline"
                onClick={onView}
                className="flex-1 rounded-md"
              >
                <Eye className="h-3 w-3 mr-1" />
                View
              </Button>
            )}

            {(status === "active" || status === "drafts") && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onEdit}
                  className="flex-1 rounded-md"
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>

                {status === "active" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onMarkAsSold}
                    className="flex-1 rounded-md"
                  >
                    Mark Sold
                  </Button>
                )}
              </>
            )}

            {(status === "expired" || status === "sold") && (
              <Button
                size="sm"
                variant="outline"
                onClick={onEdit}
                className="flex-1 rounded-md"
              >
                <RotateCcw className="h-3 w-3 mr-1" />
                Relist
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={onDelete}
              className="rounded-md text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

