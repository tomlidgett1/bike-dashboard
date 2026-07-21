"use client";

import * as React from "react";
import { HomeV2ChatInput } from "@/components/genie/homev2-chat-input";
import { SupplierLookupResultsTable } from "@/components/settings/supplier-lookup-results-table";
import type { SupplierCatalogueSearchHit } from "@/lib/supplier-catalogue/types";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  "Kids winter gloves",
  "Bottom bracket for Orbea",
  "Blue kids bikes",
  "Shimano cassette in stock",
];

const CATALOGUE_PAGE_SIZE = 200;

function todayLabelAu(): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

export function SupplierLookupPageClient() {
  const [value, setValue] = React.useState("");
  const [isRunning, setIsRunning] = React.useState(false);
  const [results, setResults] = React.useState<SupplierCatalogueSearchHit[] | null>(
    null,
  );
  const [summary, setSummary] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastQuery, setLastQuery] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"search" | "catalogue">("search");
  const [catalogueTotal, setCatalogueTotal] = React.useState(0);
  const [hasMoreCatalogue, setHasMoreCatalogue] = React.useState(false);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);

  const hasResults = results !== null;

  const runSearch = React.useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setIsRunning(true);
    setError(null);
    setMode("search");
    setLastQuery(trimmed);
    setHasMoreCatalogue(false);

    try {
      const response = await fetch("/api/store/supplier-lookup/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, limit: 75 }),
      });
      const payload = (await response.json()) as {
        results?: SupplierCatalogueSearchHit[];
        parse?: { summary?: string };
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Search failed");
      }

      setResults(payload.results ?? []);
      setSummary(payload.parse?.summary ?? null);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setSummary(null);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const loadCatalogue = React.useCallback(async (offset = 0, append = false) => {
    if (offset === 0) {
      setIsRunning(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);
    setMode("catalogue");
    setLastQuery("Full catalogue");
    setSummary("All products in the shared supplier catalogue");

    try {
      const response = await fetch(
        `/api/store/supplier-lookup/catalogue?limit=${CATALOGUE_PAGE_SIZE}&offset=${offset}`,
      );
      const payload = (await response.json()) as {
        results?: SupplierCatalogueSearchHit[];
        total?: number;
        hasMore?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Failed to load catalogue");
      }

      const next = payload.results ?? [];
      setResults((current) => (append && current ? [...current, ...next] : next));
      setCatalogueTotal(payload.total ?? next.length);
      setHasMoreCatalogue(Boolean(payload.hasMore));
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalogue");
      if (!append) {
        setResults([]);
        setSummary(null);
      }
    } finally {
      setIsRunning(false);
      setIsLoadingMore(false);
    }
  }, []);

  const resetToHome = () => {
    setResults(null);
    setSummary(null);
    setError(null);
    setLastQuery(null);
    setMode("search");
    setHasMoreCatalogue(false);
    setCatalogueTotal(0);
  };

  return (
    <div
      className={cn(
        "relative flex min-h-[calc(100vh-2rem)] w-full flex-col",
        "bg-[radial-gradient(ellipse_at_top,_rgba(255,222,89,0.18),_transparent_55%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]",
      )}
    >
      {!hasResults ? (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-12 sm:py-14">
          <h1 className="text-center text-xl font-medium tracking-tight text-gray-800 sm:text-[1.375rem]">
            Supplier Lookup
            <span className="mt-1 block text-base font-normal text-gray-500">
              today is {todayLabelAu()}
            </span>
          </h1>
          <p className="max-w-md text-center text-sm text-gray-500">
            Type what you need in plain English. We search every supplier in the
            shared catalogue and rank the best matches.
          </p>
          <div className="flex w-full min-w-0 flex-col gap-3">
            <HomeV2ChatInput
              value={value}
              isRunning={isRunning}
              onChange={setValue}
              onSubmit={() => void runSearch(value)}
              placeholder="What are you looking for?"
              showDisclaimer={false}
            />
            <div className="flex flex-wrap justify-center gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => void runSearch(action)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  {action}
                </button>
              ))}
            </div>
            <div className="flex justify-center pt-1">
              <button
                type="button"
                disabled={isRunning}
                onClick={() => void loadCatalogue(0, false)}
                className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                View full catalogue
              </button>
            </div>
            {error ? (
              <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={resetToHome}
                  className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-800"
                >
                  ← New search
                </button>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-gray-900">
                  {lastQuery}
                </h2>
                <p className="text-sm text-gray-500">
                  {summary || "Ranked supplier matches"}
                  {mode === "catalogue"
                    ? ` · showing ${results?.length ?? 0} of ${catalogueTotal}`
                    : results
                      ? ` · ${results.length} products`
                      : null}
                </p>
              </div>
              <div className="flex w-full max-w-xl flex-col gap-2 sm:items-end">
                <HomeV2ChatInput
                  value={value}
                  isRunning={isRunning}
                  compact
                  onChange={setValue}
                  onSubmit={() => void runSearch(value)}
                  placeholder="Refine your search..."
                  showDisclaimer={false}
                />
                {mode !== "catalogue" ? (
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => void loadCatalogue(0, false)}
                    className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
                  >
                    View full catalogue
                  </button>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className="rounded-md border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
                {error}
              </div>
            ) : null}

            <div className="w-full">
              <SupplierLookupResultsTable
                results={results ?? []}
                isLoading={isRunning}
              />
            </div>

            {mode === "catalogue" && hasMoreCatalogue ? (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  disabled={isLoadingMore}
                  onClick={() =>
                    void loadCatalogue(results?.length ?? 0, true)
                  }
                  className="rounded-md border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-60"
                >
                  {isLoadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
