"use client";

export const dynamic = 'force-dynamic';

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileEdit,
  Trash2,
  ChevronRight,
  Loader2,
  AlertCircle,
  Plus,
  MoreHorizontal,
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
import { MarketplaceLayout } from "@/components/layout/marketplace-layout";
import { MarketplaceHeader } from "@/components/marketplace/marketplace-header";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// Draft Listings Page
// Mobile-optimised with card view, Desktop with table view
// ============================================================

interface Draft {
  id: string;
  user_id: string;
  draft_name: string | null;
  current_step: number;
  last_saved_at: string;
  created_at: string;
  form_data: any;
  completed: boolean;
  completed_at: string | null;
}

// Mobile Action Sheet Component
interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  draft: Draft | null;
  onContinue: (draft: Draft) => void;
  onDelete: (id: string) => void;
  getDisplayTitle: (draft: Draft) => string;
}

function MobileActionSheet({
  isOpen,
  onClose,
  draft,
  onContinue,
  onDelete,
  getDisplayTitle,
}: ActionSheetProps) {
  if (!draft) return null;

  const formData = draft.form_data || {};
  const progress = ((draft.current_step - 1) / 6) * 100;

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

            {/* Draft Info */}
            <div className="px-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <FileEdit className="h-6 w-6 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {getDisplayTitle(draft)}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="relative h-1.5 w-16 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full bg-gray-900"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {Math.round(progress)}% complete
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-2 pb-[calc(env(safe-area-inset-bottom)+8px)]">
              <button
                onClick={() => {
                  onContinue(draft);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-gray-500" />
                <span className="text-sm font-medium text-gray-900">Continue Editing</span>
              </button>

              <div className="my-2 mx-4 h-px bg-gray-100" />

              <button
                onClick={() => {
                  onDelete(draft.id);
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 active:bg-red-100 transition-colors"
              >
                <Trash2 className="h-5 w-5 text-red-500" />
                <span className="text-sm font-medium text-red-600">Delete Draft</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Mobile Draft Card Component
interface DraftCardProps {
  draft: Draft;
  onActionClick: (draft: Draft) => void;
  onContinue: (draft: Draft) => void;
  formatDate: (date: string) => string;
  getDisplayTitle: (draft: Draft) => string;
  getItemTypeLabel: (formData: any) => string;
}

function MobileDraftCard({
  draft,
  onActionClick,
  onContinue,
  formatDate,
  getDisplayTitle,
  getItemTypeLabel,
}: DraftCardProps) {
  const formData = draft.form_data || {};
  const progress = ((draft.current_step - 1) / 6) * 100;

  return (
    <div className="bg-white border-b border-gray-100 last:border-b-0">
      <div className="p-4">
        <div className="flex gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 h-14 w-14 rounded-md bg-gray-100 flex items-center justify-center">
            <FileEdit className="h-7 w-7 text-gray-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {getDisplayTitle(draft)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Step {draft.current_step} of 7
                </p>
              </div>

              {/* More Actions Button */}
              <button
                onClick={() => onActionClick(draft)}
                className="p-2 -mr-2 -mt-1 rounded-md hover:bg-gray-100 active:bg-gray-200 transition-colors"
              >
                <MoreHorizontal className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="flex items-center gap-2 mt-2">
              <div className="relative h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="absolute left-0 top-0 h-full bg-gray-900 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-gray-500 tabular-nums w-8">
                {Math.round(progress)}%
              </span>
            </div>

            {/* Meta Info */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="secondary" className="rounded-md text-xs">
                {getItemTypeLabel(formData)}
              </Badge>
              {formData.brand && (
                <span className="text-xs text-gray-600">
                  {formData.brand}
                  {formData.model && ` ${formData.model}`}
                </span>
              )}
            </div>

            {/* Footer Row */}
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-gray-500">
                Saved {formatDate(draft.last_saved_at)}
              </span>
              <Button
                size="sm"
                onClick={() => onContinue(draft)}
                className="rounded-md h-8 bg-gray-900 hover:bg-gray-800 text-white"
              >
                Continue
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = React.useState(false);
  const [selectedDraft, setSelectedDraft] = React.useState<Draft | null>(null);

  // Fetch drafts
  React.useEffect(() => {
    fetchDrafts();
  }, []);

  const fetchDrafts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/marketplace/drafts");

      if (!response.ok) {
        throw new Error("Failed to fetch drafts");
      }

      const data = await response.json();
      setDrafts(data.drafts || []);
    } catch (error) {
      console.error("Error fetching drafts:", error);
      setError("Failed to load drafts. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = (draft: Draft) => {
    router.push(`/marketplace/sell?draftId=${draft.id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this draft?")) return;

    try {
      const response = await fetch(`/api/marketplace/drafts/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchDrafts();
      } else {
        throw new Error("Failed to delete draft");
      }
    } catch (error) {
      console.error("Error deleting draft:", error);
      alert("Failed to delete draft");
    }
  };

  const handleMobileActionClick = (draft: Draft) => {
    setSelectedDraft(draft);
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
      return "yesterday";
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
      });
    }
  };

  const getItemTypeLabel = (formData: any) => {
    if (formData.itemType === "bike") return "Bike";
    if (formData.itemType === "part") return "Part";
    if (formData.itemType === "apparel") return "Apparel";
    return "Item";
  };

  const getDisplayTitle = (draft: Draft) => {
    return draft.draft_name || "Untitled Draft";
  };

  return (
    <>
      <MarketplaceHeader compactSearchOnMobile />

      <MarketplaceLayout>
        <div className="min-h-screen bg-gray-50 pt-14 sm:pt-16">
          {/* Page Header */}
          <div className="border-b border-gray-200 bg-white">
            <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-md bg-gray-100 flex-shrink-0">
                    <FileEdit className="h-6 w-6 text-gray-700" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Draft Listings</h1>
                    <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">
                      Continue working on your saved drafts
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => router.push("/marketplace/sell")}
                  className="rounded-md bg-gray-900 hover:bg-gray-800 text-white flex-shrink-0"
                  size="sm"
                >
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Create New Listing</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Content Container */}
          <div className="max-w-[1920px] mx-auto">
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
              ) : drafts.length === 0 ? (
                /* Empty State */
                <div className="flex items-center justify-center py-16 sm:py-24 px-4">
                  <div className="text-center">
                    <div className="mb-4 sm:mb-6 flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-md bg-gray-100 mx-auto">
                      <FileEdit className="h-8 w-8 sm:h-10 sm:w-10 text-gray-400" />
                    </div>
                    <h3 className="mb-2 text-base sm:text-lg font-semibold text-gray-900">
                      No drafts yet
                    </h3>
                    <p className="mb-6 max-w-md text-sm text-gray-600 mx-auto">
                      When you save a draft while creating a listing, it will appear
                      here so you can continue later.
                    </p>
                    <Button
                      onClick={() => router.push("/marketplace/sell")}
                      className="rounded-md bg-gray-900 hover:bg-gray-800 text-white"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create New Listing
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="sm:hidden">
                    {drafts.map((draft) => (
                      <MobileDraftCard
                        key={draft.id}
                        draft={draft}
                        onActionClick={handleMobileActionClick}
                        onContinue={handleContinue}
                        formatDate={formatDate}
                        getDisplayTitle={getDisplayTitle}
                        getItemTypeLabel={getItemTypeLabel}
                      />
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden sm:block bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40%] px-6">Draft Name</TableHead>
                          <TableHead className="px-4">Type</TableHead>
                          <TableHead className="px-4">Progress</TableHead>
                          <TableHead className="px-4">Details</TableHead>
                          <TableHead className="px-4">Last Saved</TableHead>
                          <TableHead className="px-6 text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {drafts.map((draft) => {
                          const formData = draft.form_data || {};
                          const progress = ((draft.current_step - 1) / 6) * 100;

                          return (
                            <TableRow
                              key={draft.id}
                              className="group border-b border-border/50 hover:bg-gray-50/50 transition-colors"
                            >
                              {/* Draft Name Column */}
                              <TableCell className="py-3 px-6">
                                <div className="flex items-center gap-3">
                                  <div className="flex-shrink-0 h-10 w-10 rounded-md bg-gray-100 flex items-center justify-center">
                                    <FileEdit className="h-5 w-5 text-gray-600" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                      {getDisplayTitle(draft)}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      Step {draft.current_step} of 7
                                    </p>
                                  </div>
                                </div>
                              </TableCell>

                              {/* Type Column */}
                              <TableCell className="py-3 px-4">
                                <Badge variant="secondary" className="rounded-md text-xs font-medium">
                                  {getItemTypeLabel(formData)}
                                </Badge>
                              </TableCell>

                              {/* Progress Column */}
                              <TableCell className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="relative h-2 w-24 rounded-full bg-gray-200 overflow-hidden">
                                    <div
                                      className="absolute left-0 top-0 h-full bg-gray-900 transition-all duration-300"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500 tabular-nums">
                                    {Math.round(progress)}%
                                  </span>
                                </div>
                              </TableCell>

                              {/* Details Column */}
                              <TableCell className="py-3 px-4">
                                <div className="text-sm space-y-0.5">
                                  {formData.brand && (
                                    <div className="text-gray-800">
                                      {formData.brand}
                                      {formData.model && ` ${formData.model}`}
                                    </div>
                                  )}
                                  {formData.price && (
                                    <div className="text-gray-500 text-xs">
                                      ${formData.price.toLocaleString("en-AU")}
                                    </div>
                                  )}
                                  {!formData.brand && !formData.price && (
                                    <span className="text-gray-400 text-xs">-</span>
                                  )}
                                </div>
                              </TableCell>

                              {/* Last Saved Column */}
                              <TableCell className="py-3 px-4">
                                <span className="text-sm text-gray-500">
                                  {formatDate(draft.last_saved_at)}
                                </span>
                              </TableCell>

                              {/* Actions Column */}
                              <TableCell className="py-3 px-6">
                                <div className="flex items-center justify-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleContinue(draft)}
                                    className="rounded-md h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    Continue
                                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDelete(draft.id)}
                                    className="rounded-md h-8 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
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
        draft={selectedDraft}
        onContinue={handleContinue}
        onDelete={handleDelete}
        getDisplayTitle={getDisplayTitle}
      />
    </>
  );
}
