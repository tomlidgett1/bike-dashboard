"use client";

import * as React from "react";
import Image from "next/image";
import {
  CheckCircle2,
  Crop,
  Loader2,
  RefreshCw,
  Search,
  SkipForward,
  XCircle,
  ChevronRight,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { BrandLogoCurationRow } from "@/lib/admin/brand-logo-curation";
import type { BrandLogoCropPixels } from "@/lib/admin/import-brand-logo";
import type { BrandLogoSearchResult } from "@/lib/store/brand-logo-serper";
import { BrandLogoCropDialog } from "./brand-logo-crop-dialog";

type FilterStatus = "pending" | "approved" | "skipped" | "all";

interface BrandListResponse {
  success: boolean;
  brands: BrandLogoCurationRow[];
  counts: {
    pending: number;
    approved: number;
    skipped: number;
    total: number;
  };
  storeUserId: string;
}

const filterTabs: Array<{ value: FilterStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "skipped", label: "Skipped" },
  { value: "all", label: "All" },
];

function statusBadge(status: BrandLogoCurationRow["status"]) {
  if (status === "approved") return "text-green-700 bg-green-50";
  if (status === "skipped") return "text-gray-600 bg-gray-100";
  return "text-amber-700 bg-amber-50";
}

export function BrandLogosAdminPanel() {
  const [filter, setFilter] = React.useState<FilterStatus>("pending");
  const [brands, setBrands] = React.useState<BrandLogoCurationRow[]>([]);
  const [counts, setCounts] = React.useState({ pending: 0, approved: 0, skipped: 0, total: 0 });
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = React.useMemo(
    () => brands.find((b) => b.id === selectedId) ?? null,
    [brands, selectedId],
  );

  const [searchQuery, setSearchQuery] = React.useState("");
  const [candidates, setCandidates] = React.useState<BrandLogoSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchPage, setSearchPage] = React.useState(1);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [actionUrl, setActionUrl] = React.useState<string | null>(null);
  const [cropTarget, setCropTarget] = React.useState<{
    imageUrl: string;
    brandName: string;
    mode: "approve" | "recrop";
  } | null>(null);

  const loadBrands = React.useCallback(
    async (options?: { sync?: boolean; silent?: boolean; keepSelection?: boolean }) => {
      try {
        if (options?.silent) setRefreshing(true);
        else setLoading(true);
        setError(null);

        const syncParam = options?.sync === false ? "false" : "true";
        const response = await fetch(
          `/api/admin/brand-logos?status=${filter}&sync=${syncParam}`,
        );
        const data = (await response.json()) as BrandListResponse & { error?: string };

        if (!response.ok) {
          throw new Error(data.error || "Failed to load brands");
        }

        setBrands(data.brands);
        setCounts(data.counts);

        setSelectedId((current) => {
          if (options?.keepSelection && current && data.brands.some((b) => b.id === current)) {
            return current;
          }
          return data.brands[0]?.id ?? null;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load brands");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter],
  );

  React.useEffect(() => {
    void loadBrands();
  }, [loadBrands]);

  const runSearch = React.useCallback(
    async (options?: { page?: number; query?: string; curation?: BrandLogoCurationRow | null }) => {
      const curation = options?.curation ?? selected;
      if (!curation) return;

      try {
        setSearching(true);
        setSearchError(null);

        const page = options?.page ?? 1;
        const query =
          options?.query ??
          (searchQuery.trim() || `${curation.brand_name} logo`);

        const response = await fetch("/api/admin/brand-logos/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            curationId: curation.id,
            query,
            page,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Search failed");
        }

        setSearchPage(page);
        setCandidates(data.results ?? []);
        if (options?.query !== undefined) {
          setSearchQuery(options.query);
        }
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : "Search failed");
        setCandidates([]);
      } finally {
        setSearching(false);
      }
    },
    [selected, searchQuery],
  );

  React.useEffect(() => {
    if (!selected) {
      setCandidates([]);
      return;
    }

    setSearchQuery(selected.search_query || `${selected.brand_name} logo`);
    setSearchPage(selected.search_page || 1);
    setCandidates([]);

    if (selected.status === "pending") {
      void runSearch({
        curation: selected,
        page: selected.search_page || 1,
        query: selected.search_query || `${selected.brand_name} logo`,
      });
    }
  }, [selected?.id]);

  const handleApprove = async (imageUrl: string, crop: BrandLogoCropPixels) => {
    if (!selected) return;
    const approvedId = selected.id;
    const wasPending = selected.status === "pending";
    const wasSkipped = selected.status === "skipped";
    const wasAlreadyApproved = selected.status === "approved";
    try {
      setActionUrl(imageUrl);
      setSearchError(null);
      const response = await fetch("/api/admin/brand-logos/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curationId: approvedId, imageUrl, crop }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Approve failed");

      const updated = (data.curation as BrandLogoCurationRow | undefined) ?? {
        ...selected,
        status: "approved" as const,
        approved_logo_url: imageUrl,
      };

      // Local list update only — do not re-sync every Lightspeed brand after each click.
      setBrands((prev) => {
        const next = prev.map((brand) => (brand.id === approvedId ? updated : brand));
        return filter === "pending" ? next.filter((brand) => brand.id !== approvedId) : next;
      });
      if (!wasAlreadyApproved) {
        setCounts((prev) => ({
          ...prev,
          pending: Math.max(0, prev.pending - (wasPending ? 1 : 0)),
          approved: prev.approved + (wasPending || wasSkipped ? 1 : 0),
          skipped: Math.max(0, prev.skipped - (wasSkipped ? 1 : 0)),
        }));
      }
      setCandidates([]);
      setCropTarget(null);
      if (filter === "pending") {
        setSelectedId((current) => {
          if (current !== approvedId) return current;
          const remaining = brands.filter((brand) => brand.id !== approvedId);
          return remaining[0]?.id ?? null;
        });
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setActionUrl(null);
    }
  };

  const handleReject = async (imageUrl: string) => {
    if (!selected) return;
    try {
      setActionUrl(imageUrl);
      const response = await fetch("/api/admin/brand-logos/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curationId: selected.id, imageUrl }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reject failed");

      setCandidates((prev) => prev.filter((c) => c.url !== imageUrl));
      if (candidates.length <= 3) {
        await runSearch({ page: (data.curation?.search_page ?? searchPage) });
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setActionUrl(null);
    }
  };

  const handleSkip = async () => {
    if (!selected) return;
    const skippedId = selected.id;
    const previousStatus = selected.status;
    try {
      setActionUrl("skip");
      setSearchError(null);
      const response = await fetch("/api/admin/brand-logos/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curationId: skippedId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Skip failed");

      const updated = (data.curation as BrandLogoCurationRow | undefined) ?? {
        ...selected,
        status: "skipped" as const,
      };

      setBrands((prev) => {
        const next = prev.map((brand) => (brand.id === skippedId ? updated : brand));
        return filter === "pending" ? next.filter((brand) => brand.id !== skippedId) : next;
      });
      setCounts((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - (previousStatus === "pending" ? 1 : 0)),
        approved: Math.max(0, prev.approved - (previousStatus === "approved" ? 1 : 0)),
        skipped: prev.skipped + (previousStatus === "skipped" ? 0 : 1),
      }));
      setCandidates([]);
      if (filter === "pending") {
        setSelectedId((current) => {
          if (current !== skippedId) return current;
          const remaining = brands.filter((brand) => brand.id !== skippedId);
          return remaining[0]?.id ?? null;
        });
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Skip failed");
    } finally {
      setActionUrl(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-md border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900">Brands</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-md"
              disabled={refreshing}
              onClick={() => void loadBrands({ sync: true, silent: true })}
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <div className="mt-3 flex items-center bg-gray-100 p-0.5 rounded-md w-full">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilter(tab.value)}
                className={cn(
                  "flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors",
                  filter === tab.value
                    ? "text-gray-800 bg-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-200/70",
                )}
              >
                {tab.label}
                <span className="ml-1 text-[10px] text-gray-400">
                  {tab.value === "pending"
                    ? counts.pending
                    : tab.value === "approved"
                      ? counts.approved
                      : tab.value === "skipped"
                        ? counts.skipped
                        : counts.total}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : error ? (
            <p className="rounded-md bg-white p-3 text-sm text-red-600">{error}</p>
          ) : brands.length === 0 ? (
            <p className="p-3 text-sm text-gray-500">No brands in this filter.</p>
          ) : (
            brands.map((brand) => (
              <button
                key={brand.id}
                type="button"
                onClick={() => setSelectedId(brand.id)}
                className={cn(
                  "mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                  selectedId === brand.id ? "bg-gray-100" : "hover:bg-gray-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{brand.brand_name}</p>
                  <p className="text-xs text-gray-400">
                    {brand.product_count.toLocaleString("en-AU")} in stock
                    {brand.manufacturer_id ? ` · LS ${brand.manufacturer_id}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                    statusBadge(brand.status),
                  )}
                >
                  {brand.status}
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300" />
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="rounded-md border border-gray-200 bg-white">
        {!selected ? (
          <div className="flex h-[480px] items-center justify-center text-sm text-gray-500">
            Select a brand to review logos
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selected.brand_name}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {selected.product_count.toLocaleString("en-AU")} units in stock
                  </span>
                  {selected.manufacturer_name && selected.manufacturer_name !== selected.brand_name ? (
                    <span>Manufacturer: {selected.manufacturer_name}</span>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selected.status === "pending" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md"
                    disabled={actionUrl === "skip"}
                    onClick={() => void handleSkip()}
                  >
                    {actionUrl === "skip" ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Skip brand
                  </Button>
                ) : null}
              </div>
            </div>

            {selected.approved_logo_url ? (
              <div className="mt-4 rounded-md border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Approved logo
                    </p>
                    <div className="relative mt-2 h-16 w-40">
                      <Image
                        src={selected.approved_logo_url}
                        alt={`${selected.brand_name} logo`}
                        fill
                        className="object-contain object-left"
                        sizes="160px"
                        unoptimized
                      />
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-md"
                    disabled={actionUrl === selected.approved_logo_url}
                    onClick={() =>
                      setCropTarget({
                        imageUrl: selected.approved_logo_url!,
                        brandName: selected.brand_name,
                        mode: "recrop",
                      })
                    }
                  >
                    {actionUrl === selected.approved_logo_url ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Crop className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Recrop
                  </Button>
                </div>
                {searchError && selected.status !== "pending" ? (
                  <p className="mt-3 rounded-md bg-white p-3 text-sm text-red-600">{searchError}</p>
                ) : null}
              </div>
            ) : null}

            {selected.status === "pending" ? (
              <>
                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`${selected.brand_name} logo`}
                    className="rounded-md"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        void runSearch({ page: 1, query: searchQuery.trim() });
                      }
                    }}
                  />
                  <Button
                    type="button"
                    className="rounded-md"
                    disabled={searching}
                    onClick={() => void runSearch({ page: 1, query: searchQuery.trim() })}
                  >
                    {searching ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="mr-1.5 h-4 w-4" />
                    )}
                    Search
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-md"
                    disabled={searching}
                    onClick={() => void runSearch({ page: searchPage + 1, query: searchQuery.trim() })}
                  >
                    Load more
                  </Button>
                </div>

                {searchError ? (
                  <p className="mt-3 rounded-md bg-white p-3 text-sm text-red-600">{searchError}</p>
                ) : null}

                {searching && candidates.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-gray-400">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : candidates.length === 0 ? (
                  <p className="py-12 text-center text-sm text-gray-500">
                    No logo candidates found. Try a different search query or load more.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                    {candidates.map((candidate) => {
                      const busy = actionUrl === candidate.url;
                      const preview = candidate.thumbnailUrl || candidate.url;
                      return (
                        <div
                          key={candidate.url}
                          className="overflow-hidden rounded-md border border-gray-200 bg-white"
                        >
                          <div className="relative aspect-[4/3] bg-gray-50">
                            <Image
                              src={preview}
                              alt={candidate.title || selected.brand_name}
                              fill
                              className="object-contain p-3"
                              sizes="(max-width: 768px) 50vw, 25vw"
                              unoptimized
                            />
                          </div>
                          <div className="border-t border-gray-100 p-2">
                            <p className="truncate text-[11px] text-gray-500">
                              {candidate.domain || candidate.title || "Image"}
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 flex-1 rounded-md"
                                disabled={busy}
                                onClick={() =>
                                  setCropTarget({
                                    imageUrl: candidate.url,
                                    brandName: selected.brand_name,
                                    mode: "approve",
                                  })
                                }
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                    Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 flex-1 rounded-md"
                                disabled={busy}
                                onClick={() => void handleReject(candidate.url)}
                              >
                                <XCircle className="mr-1 h-3.5 w-3.5" />
                                Reject
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : selected.status === "approved" ? (
              <p className="mt-6 text-sm text-gray-500">
                Use Recrop to tighten whitespace on the approved logo, or switch to Pending to pick a different image.
              </p>
            ) : (
              <p className="mt-6 text-sm text-gray-500">
                This brand is marked as {selected.status}. Switch to Pending to review logos, or pick another brand.
              </p>
            )}
          </div>
        )}
      </main>

      <BrandLogoCropDialog
        open={Boolean(cropTarget)}
        imageUrl={cropTarget?.imageUrl ?? ""}
        brandName={cropTarget?.brandName ?? "brand"}
        busy={Boolean(cropTarget && actionUrl === cropTarget.imageUrl)}
        confirmLabel={
          cropTarget?.mode === "recrop" ? "Crop & save" : "Crop & approve"
        }
        onOpenChange={(open) => {
          if (!open && !(cropTarget && actionUrl === cropTarget.imageUrl)) {
            setCropTarget(null);
          }
        }}
        onConfirm={(crop) => {
          if (!cropTarget) return;
          void handleApprove(cropTarget.imageUrl, crop);
        }}
      />
    </div>
  );
}
