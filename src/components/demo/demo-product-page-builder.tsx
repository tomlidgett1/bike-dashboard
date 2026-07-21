"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Box,
  ChevronDown,
  ExternalLink,
  Loader2,
  MagicStick3,
  Monitor,
  Search,
  Smartphone,
  Upload,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { DashboardFloatingPage } from "@/components/layout/dashboard-floating-page";
import {
  WorldClassProductPageTemplate,
  type TemplateViewMode,
} from "@/components/demo/world-class-product-page-template";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { productPath, productSlugId } from "@/lib/seo/site";
import type {
  GenerateProgressEvent,
  GenerateProgressStage,
  WorldClassProductKind,
  WorldClassProductPage,
} from "@/lib/demo/world-class-product-page-types";

const STAGE_ORDER: GenerateProgressStage[] = [
  "started",
  "official",
  "researching",
  "images",
  "videos",
  "assembling",
  "complete",
];

const STAGE_LABELS: Record<GenerateProgressStage, string> = {
  started: "Starting",
  official: "Official brand site",
  researching: "Editorial research",
  images: "World-class photography",
  videos: "Review & brand videos",
  assembling: "Filling the template",
  complete: "Ready",
  error: "Failed",
};

const EXAMPLE_QUERIES_BY_KIND: Record<WorldClassProductKind, string[]> = {
  bike: [
    "Specialized Tarmac SL8 Expert 2025",
    "Trek Madone SLR 7 Gen 8",
    "Canyon Grail CF SL 8",
    "Orbea Orca M30iLTD",
    "Cervelo Aspero-5 Force AXS",
  ],
  non_bike: [
    "Giro Aether Spherical MIPS",
    "Shimano Dura-Ace R9200 groupset",
    "Garmin Edge 1040 Solar",
    "Sidi Wire 2S carbon road shoes",
    "POC Ventral Spin helmet",
  ],
};

function stageIndex(stage: GenerateProgressStage): number {
  const index = STAGE_ORDER.indexOf(stage);
  return index >= 0 ? index : 0;
}

/* ------------------------------------------------------------------ */
/* Catalogue picker — run the generator against real store products    */
/* ------------------------------------------------------------------ */

type CatalogueProduct = {
  id: string;
  display_name: string | null;
  description: string | null;
  brand: string | null;
  model_year: number | string | null;
  resolved_image_url: string | null;
  is_bicycle: boolean | null;
};

/** Best research query for a catalogue product: brand + name + year. */
function composeCatalogueQuery(product: CatalogueProduct): string {
  const name = (product.display_name || product.description || "").trim();
  const brand = (product.brand || "").trim();
  const year = product.model_year ? String(product.model_year).trim() : "";
  let query = name;
  if (brand && !name.toLowerCase().includes(brand.toLowerCase())) {
    query = `${brand} ${query}`;
  }
  if (year && !query.includes(year)) {
    query = `${query} ${year}`;
  }
  return query.trim();
}

function CataloguePicker({
  disabled,
  onSelect,
  label = "From catalogue",
  productKind = "bike",
}: {
  disabled: boolean;
  onSelect: (product: CatalogueProduct) => void;
  label?: string;
  productKind?: WorldClassProductKind;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [products, setProducts] = React.useState<CatalogueProduct[]>([]);
  const [fetchError, setFetchError] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Close on outside click.
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Debounced catalogue search whenever the panel is open.
  React.useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setFetchError(false);
        try {
          const params = new URLSearchParams({
            page: "1",
            pageSize: "30",
            includeFilters: "false",
          });
          if (search.trim()) params.set("search", search.trim());
          const response = await fetch(`/api/products?${params}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("catalogue fetch failed");
          const data = (await response.json()) as { products?: CatalogueProduct[] };
          const all = data.products ?? [];
          // Prefer matching catalogue rows for the selected product kind.
          const preferred =
            productKind === "bike"
              ? all.filter((product) => product.is_bicycle === true)
              : all.filter((product) => product.is_bicycle !== true);
          setProducts(preferred.length > 0 ? preferred : all);
        } catch (error) {
          if ((error as Error).name !== "AbortError") {
            setProducts([]);
            setFetchError(true);
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      search.trim() ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, search, productKind]);

  React.useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((value) => !value)}
        className="flex h-10 w-full items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
      >
        <Box className="h-4 w-4 text-gray-400" />
        {label}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-gray-400 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              duration: 0.4,
              ease: [0.04, 0.62, 0.23, 0.98],
            }}
            className="absolute left-0 top-11 z-30 w-[380px] max-w-[85vw] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
          >
            <div className="border-b border-gray-100 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search your catalogue…"
                  className="h-9 w-full rounded-md bg-gray-50 pl-8 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200"
                />
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto p-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-gray-400">
                  <Loader2 className="h-4 w-4" />
                  Loading catalogue…
                </div>
              ) : fetchError ? (
                <p className="px-3 py-8 text-center text-sm text-gray-400">
                  Could not load your catalogue. Try again.
                </p>
              ) : products.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-gray-400">
                  No products match that search.
                </p>
              ) : (
                products.map((product) => {
                  const name =
                    (product.display_name || product.description || "").trim() ||
                    "Untitled product";
                  const subline = [
                    product.brand,
                    product.model_year ? String(product.model_year) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onSelect(product);
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-gray-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-100 bg-gray-50">
                        {product.resolved_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.resolved_image_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Box className="h-4 w-4 text-gray-300" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900">
                          {name}
                        </span>
                        {subline ? (
                          <span className="block truncate text-xs text-gray-500">
                            {subline}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
                        {product.is_bicycle ? "Bike" : "Non-bike"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DemoProductPageBuilder() {
  const [query, setQuery] = React.useState("");
  const [productKind, setProductKind] =
    React.useState<WorldClassProductKind>("bike");
  const [running, setRunning] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);
  const [currentStage, setCurrentStage] =
    React.useState<GenerateProgressStage | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState<WorldClassProductPage | null>(null);
  const [viewMode, setViewMode] = React.useState<TemplateViewMode>("desktop");
  const [selectedProduct, setSelectedProduct] =
    React.useState<CatalogueProduct | null>(null);
  const [publishedUrl, setPublishedUrl] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleGenerate = async (
    overrideQuery?: string,
    catalogueProduct?: CatalogueProduct | null,
    kindOverride?: WorldClassProductKind,
  ) => {
    const productName = (overrideQuery ?? query).trim();
    if (productName.length < 3 || running) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let nextKind = kindOverride ?? productKind;
    if (catalogueProduct) {
      nextKind =
        catalogueProduct.is_bicycle === true ? "bike" : "non_bike";
      setProductKind(nextKind);
    } else if (kindOverride) {
      setProductKind(kindOverride);
    }

    if (catalogueProduct !== undefined) {
      setSelectedProduct(catalogueProduct);
    } else if (!overrideQuery) {
      // Free-text regenerate keeps the current catalogue binding.
    } else {
      setSelectedProduct(null);
    }

    setQuery(productName);
    setRunning(true);
    setError(null);
    setPage(null);
    setPublishedUrl(null);
    setCurrentStage("started");
    setStatusMessage(
      nextKind === "non_bike"
        ? `Building a world-class accessory page for “${productName}”…`
        : `Building a world-class page for “${productName}”…`,
    );

    try {
      const response = await fetch("/api/demo/generate-product-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, productKind: nextKind }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Generation request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .map((part) => part.trim())
            .find((part) => part.startsWith("data:"));
          if (!line) continue;

          const json = line.slice(5).trim();
          if (!json) continue;

          let event: GenerateProgressEvent;
          try {
            event = JSON.parse(json) as GenerateProgressEvent;
          } catch {
            continue;
          }

          setCurrentStage(event.stage);
          setStatusMessage(event.message);

          if (event.stage === "error") {
            setError(event.error || event.message);
          }
          if (event.stage === "complete" && event.page) {
            setPage(event.page);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Failed to generate product page.",
      );
      setCurrentStage("error");
    } finally {
      setRunning(false);
    }
  };

  const handlePublish = async () => {
    if (!page || !selectedProduct || publishing) return;

    setPublishing(true);
    setError(null);

    try {
      const response = await fetch("/api/demo/publish-product-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: selectedProduct.id,
          page,
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        product?: { id: string; display_name?: string | null; description?: string | null };
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to publish product page.");
      }

      const productName =
        payload?.product?.display_name ||
        payload?.product?.description ||
        selectedProduct.display_name ||
        selectedProduct.description ||
        page.productName;

      const url = productPath(
        productSlugId(selectedProduct.id, productName),
      );
      setPublishedUrl(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to publish product page.",
      );
    } finally {
      setPublishing(false);
    }
  };

  const activeIndex = currentStage ? stageIndex(currentStage) : -1;
  const selectedProductLabel = selectedProduct
    ? (
        selectedProduct.display_name ||
        selectedProduct.description ||
        "Selected product"
      ).trim()
    : null;

  const exampleQueries = EXAMPLE_QUERIES_BY_KIND[productKind];
  const kindLabel = productKind === "non_bike" ? "accessory or part" : "bike";

  return (
    <DashboardFloatingPage
      title="Demo"
      icon={MagicStick3}
      description="Pick bike or non-bike, enter a product name. AI researches the official brand site first, fills a fixed world-class template, and drops sections it cannot verify."
      flush
      cardClassName="overflow-hidden"
      scrollClassName="bg-gray-50"
    >
      <div className="border-b border-gray-200 bg-white px-4 py-4 md:px-5">
        {/* Main Tab Container */}
        <div className="mb-3 flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
          <button
            type="button"
            disabled={running || publishing}
            onClick={() => setProductKind("bike")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              productKind === "bike"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            Bike
          </button>
          <button
            type="button"
            disabled={running || publishing}
            onClick={() => setProductKind("non_bike")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
              productKind === "non_bike"
                ? "text-gray-800 bg-white shadow-sm"
                : "text-gray-600 hover:bg-gray-200/70",
            )}
          >
            Non-bike
          </button>
        </div>

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-center"
          onSubmit={(event) => {
            event.preventDefault();
            void handleGenerate();
          }}
        >
          <CataloguePicker
            disabled={running || publishing}
            productKind={productKind}
            onSelect={(product) =>
              void handleGenerate(composeCatalogueQuery(product), product)
            }
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              productKind === "non_bike"
                ? "e.g. Giro Aether Spherical MIPS"
                : "e.g. Specialized Tarmac SL8 Expert 2025"
            }
            className="h-10 flex-1 rounded-md bg-white"
            disabled={running || publishing}
          />
          <Button
            type="submit"
            disabled={running || publishing || query.trim().length < 3}
            className="h-10 rounded-md px-4"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4" />
                Generating…
              </>
            ) : (
              <>
                <MagicStick3 className="mr-2 h-4 w-4" />
                Build product page
              </>
            )}
          </Button>
        </form>

        {selectedProductLabel ? (
          <div className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700">
            Publishing target:{" "}
            <span className="font-medium text-gray-900">{selectedProductLabel}</span>
            {selectedProduct?.brand ? (
              <span className="text-gray-500"> · {selectedProduct.brand}</span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {exampleQueries.map((example) => (
            <button
              key={example}
              type="button"
              disabled={running || publishing}
              onClick={() => void handleGenerate(example, null, productKind)}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>

        {(running || currentStage) && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap gap-2">
              {STAGE_ORDER.map((stage, index) => {
                const isDone =
                  currentStage === "complete" ||
                  (activeIndex >= 0 && index < activeIndex);
                const isActive = currentStage === stage && running;
                return (
                  <div
                    key={stage}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium",
                      isActive
                        ? "bg-gray-900 text-white"
                        : isDone
                          ? "bg-gray-100 text-gray-800"
                          : "bg-gray-50 text-gray-400",
                    )}
                  >
                    {STAGE_LABELS[stage]}
                  </div>
                );
              })}
            </div>
            {statusMessage ? (
              <p className="mt-3 text-sm text-gray-600">{statusMessage}</p>
            ) : null}
          </div>
        )}

        {error ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            {error}
          </div>
        ) : null}

        {publishedUrl ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            Published.{" "}
            <Link
              href={publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-gray-900 underline-offset-2 hover:underline"
            >
              View live product page
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : null}
      </div>

      {page ? (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-5">
            <div className="min-w-0">
              <p className="text-sm text-gray-600">
                Preview for <span className="font-medium text-gray-900">{page.productName}</span>
                {" · "}
                {page.images.length} images
                {" · "}
                {page.videos.length} videos
                {" · "}
                {page.specifications.reduce((n, s) => n + s.specs.length, 0)} specs
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {page.research.webSearchCount} live web searches
                {" · "}
                {page.research.totalSourceCount} sources ({page.research.officialSourceCount} official)
                {page.research.officialDomain ? (
                  <>
                    {" · "}
                    specs from{" "}
                    <span
                      className={cn(
                        "font-medium",
                        page.research.officialSpecsVerified
                          ? "text-gray-600"
                          : "text-gray-400 line-through",
                      )}
                    >
                      {page.research.officialDomain}
                    </span>
                  </>
                ) : null}
              </p>
              {!selectedProduct ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-gray-500">
                    Link a catalogue product to enable Publish.
                  </p>
                  <CataloguePicker
                    disabled={running || publishing}
                    label="Link product"
                    productKind={page.productKind === "non_bike" ? "non_bike" : productKind}
                    onSelect={(product) => {
                      setSelectedProduct(product);
                      setProductKind(
                        product.is_bicycle === true ? "bike" : "non_bike",
                      );
                    }}
                  />
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Sub-Tab Container */}
              <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                <button
                  type="button"
                  onClick={() => setViewMode("desktop")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                    viewMode === "desktop"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  <Monitor className="h-3 w-3" />
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("mobile")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                    viewMode === "mobile"
                      ? "text-gray-800 bg-white shadow-sm"
                      : "text-gray-600 hover:bg-gray-200/70",
                  )}
                >
                  <Smartphone className="h-3 w-3" />
                  Mobile
                </button>
              </div>
              <Button
                type="button"
                onClick={() => void handlePublish()}
                disabled={!selectedProduct || publishing || running}
                className="h-9 rounded-md px-3"
              >
                {publishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4" />
                    Publishing…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Publish
                  </>
                )}
              </Button>
            </div>
          </div>
          <WorldClassProductPageTemplate page={page} viewMode={viewMode} />
        </div>
      ) : !running && !error ? (
        <div className="flex min-h-[420px] items-center justify-center px-4 py-16">
          <div className="max-w-md rounded-xl border border-gray-200 bg-white px-6 py-8 text-center">
            <MagicStick3 className="mx-auto h-8 w-8 text-gray-400" />
            <h2 className="mt-4 text-base font-medium text-gray-900">
              World-class {kindLabel} pages, on demand
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">
              Official brand site first, then deep web research fills every
              section: photography, specs, brand story, videos and expert
              notes. Missing data simply removes that section.
            </p>
          </div>
        </div>
      ) : null}
    </DashboardFloatingPage>
  );
}
