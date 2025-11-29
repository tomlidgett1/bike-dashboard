"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FileEdit,
  Trash2,
  ChevronRight,
  Loader2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Header } from "@/components/layout";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

// ============================================================
// Draft Listings Page - Table View
// Shows all saved drafts from listing_drafts table
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

export default function DraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

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
    <div className="flex flex-col h-screen overflow-hidden">
      <Header
        title="Draft Listings"
        description="Continue working on your saved drafts"
      />

      {/* Content Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Error Message */}
        {error && (
          <div className="mx-4 my-4 lg:mx-6">
            <div className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
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

        {/* Table Container - Full width, scrollable */}
        <div className="flex-1 overflow-auto bg-white dark:bg-gray-950">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : drafts.length === 0 ? (
            /* Empty State */
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 mx-auto">
                  <FileEdit className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  No drafts yet
                </h3>
                <p className="mb-6 max-w-md text-gray-600 mx-auto">
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
            /* Table */
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
                      className="group border-b border-border/50 hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors"
                    >
                      {/* Draft Name Column */}
                      <TableCell className="py-3 px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0 h-10 w-10 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <FileEdit className="h-5 w-5 text-gray-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">
                              {getDisplayTitle(draft)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
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
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {Math.round(progress)}%
                          </span>
                        </div>
                      </TableCell>

                      {/* Details Column */}
                      <TableCell className="py-3 px-4">
                        <div className="text-sm space-y-0.5">
                          {formData.brand && (
                            <div className="text-foreground/80">
                              {formData.brand}
                              {formData.model && ` ${formData.model}`}
                            </div>
                          )}
                          {formData.price && (
                            <div className="text-muted-foreground text-xs">
                              ${formData.price.toLocaleString("en-AU")}
                            </div>
                          )}
                          {!formData.brand && !formData.price && (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Last Saved Column */}
                      <TableCell className="py-3 px-4">
                        <span className="text-sm text-muted-foreground">
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
          )}
        </div>
      </div>
    </div>
  );
}
