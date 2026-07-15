"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  ImageIcon,
  Loader2,
  Lock,
  Package,
  Play,
  Plus,
  ScanSearch,
  Sparkles,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { StoreFesportsScrapeReview } from "@/components/settings/store-fesports-scrape-review";
import type { SupplierExcludedImages } from "@/components/settings/store-supplier-photo-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldMapping } from "@/lib/scrapers/fesports-field-mapping";
import type {
  AlternatePhotoSourceConfig,
  StoredSupplierScraper,
  SupplierBrowseMode,
  SupplierBrowseOption,
  SupplierImageSourcePreference,
  SupplierImageSourcePreferences,
  SupplierProductMatches,
  SupplierScrapedProduct,
  SupplierScrapeTarget,
} from "@/lib/scrapers/supplier-types";
import {
  consumeSupplierSse,
  type SupplierLogEntry,
} from "@/lib/scrapers/supplier-logger";
import { defaultImagePreference } from "@/lib/scrapers/supplier-image-preferences";
import { cn } from "@/lib/utils";

type BuilderPhase =
  | "idle"
  | "building"
  | "configured"
  | "running"
  | "fetching_photos"
  | "review"
  | "importing"
  | "done"
  | "error";

interface ImportSummary {
  created: number;
  updated: number;
  groupsCreated: number;
  imagesSaved: number;
  errors: string[];
}

function formatDate(value: string | null): string {
  if (!value) return "Not run yet";
  return new Date(value).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function normaliseWebsiteUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    // Prefer www for brand sites that redirect www <-> apex.
    if (!url.hostname.startsWith("www.") && url.hostname.split(".").length === 2) {
      url.hostname = `www.${url.hostname}`;
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function SupplierScraperLogPanel({
  logs,
  title,
}: {
  logs: SupplierLogEntry[];
  title: string;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [logs]);

  if (logs.length === 0) return null;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-xs text-gray-500">
            Live progress from YJ while the scraper runs.
          </p>
        </div>
        <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600">
          {logs.length} steps
        </span>
      </div>
      <div
        ref={containerRef}
        className="max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] leading-5 text-gray-700"
      >
        {logs.map((entry) => (
          <div key={entry.id} className="border-b border-gray-200/80 py-1.5 last:border-b-0">
            <span className="text-gray-400">+{formatElapsed(entry.elapsedMs)}</span>{" "}
            <span className="font-semibold text-gray-800">{entry.step}</span>{" "}
            <span>{entry.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StoreSupplierScraperBuilder() {
  const reviewRef = React.useRef<HTMLDivElement>(null);
  const [scrapers, setScrapers] = React.useState<StoredSupplierScraper[]>([]);
  const [activeScraperId, setActiveScraperId] = React.useState<string | null>(null);
  const [loadingScrapers, setLoadingScrapers] = React.useState(true);
  const [phase, setPhase] = React.useState<BuilderPhase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [supplierName, setSupplierName] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [loginUrl, setLoginUrl] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [sampleProducts, setSampleProducts] = React.useState<SupplierScrapedProduct[]>([]);
  const [browseMode, setBrowseMode] = React.useState<SupplierBrowseMode>("category");
  const [optionSearch, setOptionSearch] = React.useState("");
  const [selectedOptionIds, setSelectedOptionIds] = React.useState<Set<string>>(new Set());
  const [maxProducts, setMaxProducts] = React.useState("");
  const [products, setProducts] = React.useState<SupplierScrapedProduct[]>([]);
  const [matches, setMatches] = React.useState<SupplierProductMatches>({});
  const [selectedProductIds, setSelectedProductIds] = React.useState<Set<string>>(new Set());
  const [importSummary, setImportSummary] = React.useState<ImportSummary | null>(null);
  const [activityLogs, setActivityLogs] = React.useState<SupplierLogEntry[]>([]);
  const [scrapeProgress, setScrapeProgress] = React.useState<{
    scraped: number;
    total: number;
  } | null>(null);
  const [alternatePhotoWebsite, setAlternatePhotoWebsite] = React.useState("");
  const [alternatePhotoName, setAlternatePhotoName] = React.useState("");
  const [alternatePhotoSearchTemplate, setAlternatePhotoSearchTemplate] = React.useState("");
  const [imagePreferences, setImagePreferences] = React.useState<SupplierImageSourcePreferences>({});
  const [alternatePhotoProgress, setAlternatePhotoProgress] = React.useState<{
    matched: number;
    total: number;
  } | null>(null);
  const [isSavingAlternatePhoto, setIsSavingAlternatePhoto] = React.useState(false);
  const [alternatePhotoSaveMessage, setAlternatePhotoSaveMessage] = React.useState<string | null>(
    null,
  );
  const [excludedImages, setExcludedImages] = React.useState<SupplierExcludedImages>({});
  const [brandCategories, setBrandCategories] = React.useState<
    Record<string, SupplierBrowseOption[]>
  >({});
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [isLoadingBrandCategories, setIsLoadingBrandCategories] = React.useState(false);
  const hasEnteredReviewRef = React.useRef(false);

  const appendLog = React.useCallback((entry: SupplierLogEntry) => {
    setActivityLogs((current) => [...current, entry]);
  }, []);

  const activeScraper =
    scrapers.find((scraper) => scraper.id === activeScraperId) ?? null;
  const availableOptions =
    activeScraper && browseMode === "brand"
      ? activeScraper.config.brandOptions
      : activeScraper?.config.categoryOptions ?? [];
  const filteredOptions = availableOptions.filter((option) =>
    option.name.toLowerCase().includes(optionSearch.trim().toLowerCase()),
  );
  const selectedProducts = products.filter((product) =>
    selectedProductIds.has(product.productId),
  );
  const alternatePhotoConfig = activeScraper?.config.alternatePhotoSource ?? null;
  const showPhotoPreview = Boolean(
    alternatePhotoWebsite.trim() ||
      (alternatePhotoConfig?.enabled && alternatePhotoConfig.websiteUrl),
  );

  const syncAlternatePhotoForm = React.useCallback((scraper: StoredSupplierScraper) => {
    const source = scraper.config.alternatePhotoSource;
    setAlternatePhotoWebsite(source?.websiteUrl ?? "");
    setAlternatePhotoName(source?.sourceName ?? "");
    setAlternatePhotoSearchTemplate(source?.searchUrlTemplate ?? "");
  }, []);

  React.useEffect(() => {
    if (activeScraper) syncAlternatePhotoForm(activeScraper);
  }, [activeScraper, syncAlternatePhotoForm]);

  React.useEffect(() => {
    setAlternatePhotoSaveMessage(null);
  }, [alternatePhotoWebsite, alternatePhotoName, alternatePhotoSearchTemplate]);

  const loadScrapers = React.useCallback(async () => {
    setLoadingScrapers(true);
    try {
      const response = await fetch("/api/store/scrape/suppliers", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not load supplier scrapers.");
      setScrapers(payload.scrapers ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load supplier scrapers.",
      );
    } finally {
      setLoadingScrapers(false);
    }
  }, []);

  React.useEffect(() => {
    void loadScrapers();
  }, [loadScrapers]);

  const openScraper = (scraper: StoredSupplierScraper) => {
    const mode = scraper.config.browseModes.includes("category")
      ? "category"
      : scraper.config.browseModes[0] ?? "category";
    setActiveScraperId(scraper.id);
    setBrowseMode(mode);
    setSelectedOptionIds(new Set());
    setOptionSearch("");
    setProducts([]);
    setMatches({});
    setSelectedProductIds(new Set());
    setImportSummary(null);
    setError(null);
    setActivityLogs([]);
    setScrapeProgress(null);
    hasEnteredReviewRef.current = false;
    setImagePreferences({});
    setExcludedImages({});
    setAlternatePhotoProgress(null);
    setBrandCategories({});
    setSelectedSubcategoryIds(new Set());
    syncAlternatePhotoForm(scraper);
    setPhase("configured");
  };

  const startNewScraper = () => {
    setActiveScraperId(null);
    setSupplierName("");
    setWebsiteUrl("");
    setLoginUrl("");
    setUsername("");
    setPassword("");
    setSampleProducts([]);
    setProducts([]);
    setMatches({});
    setSelectedOptionIds(new Set());
    setSelectedProductIds(new Set());
    setImportSummary(null);
    setError(null);
    setActivityLogs([]);
    setScrapeProgress(null);
    hasEnteredReviewRef.current = false;
    setExcludedImages({});
    setBrandCategories({});
    setSelectedSubcategoryIds(new Set());
    setPhase("idle");
  };

  const buildScraper = async () => {
    if (!websiteUrl.trim()) return;
    setPhase("building");
    setError(null);
    setSampleProducts([]);
    setActivityLogs([]);

    try {
      const response = await fetch("/api/store/scrape/suppliers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          name: supplierName,
          websiteUrl,
          loginUrl: loginUrl || websiteUrl,
          username,
          password,
        }),
      });
      const payload = await consumeSupplierSse<{
        event: "result";
        scraper: StoredSupplierScraper;
        sampleProducts: SupplierScrapedProduct[];
      }>(response, appendLog);
      const scraper = payload.scraper;
      setScrapers((current) => [scraper, ...current.filter((item) => item.id !== scraper.id)]);
      setActiveScraperId(scraper.id);
      setSampleProducts(payload.sampleProducts ?? []);
      setPassword("");
      setBrowseMode(
        scraper.config.browseModes.includes("category")
          ? "category"
          : scraper.config.browseModes[0] ?? "category",
      );
      setSelectedOptionIds(new Set());
      setBrandCategories({});
      setSelectedSubcategoryIds(new Set());
      setPhase("configured");
    } catch (buildError) {
      setPhase("error");
      setError(
        buildError instanceof Error
          ? buildError.message
          : "YJ could not build this scraper.",
      );
    }
  };

  const changeBrowseMode = (mode: SupplierBrowseMode) => {
    setBrowseMode(mode);
    setSelectedOptionIds(new Set());
    setOptionSearch("");
    setSelectedSubcategoryIds(new Set());
    setBrandCategories({});
  };

  const toggleOption = (optionId: string) => {
    setSelectedOptionIds((current) => {
      const next = new Set(current);
      if (next.has(optionId)) {
        next.delete(optionId);
        setSelectedSubcategoryIds((subs) => {
          const nextSubs = new Set(subs);
          for (const category of brandCategories[optionId] ?? []) {
            nextSubs.delete(category.id);
          }
          return nextSubs;
        });
      } else {
        next.add(optionId);
      }
      return next;
    });
  };

  const toggleSubcategory = (subcategoryId: string) => {
    setSelectedSubcategoryIds((current) => {
      const next = new Set(current);
      if (next.has(subcategoryId)) next.delete(subcategoryId);
      else next.add(subcategoryId);
      return next;
    });
  };

  const loadOptionCategories = async (
    optionIdsOverride?: string[],
    options?: { force?: boolean },
  ) => {
    if (!activeScraper) return;
    const ids = optionIdsOverride ?? [...selectedOptionIds];
    if (ids.length === 0) return;

    const toLoad = options?.force
      ? ids
      : ids.filter((id) => brandCategories[id] === undefined);
    if (toLoad.length === 0) return;

    setIsLoadingBrandCategories(true);
    setError(null);
    setActivityLogs([]);
    try {
      const response = await fetch(
        `/api/store/scrape/suppliers/${activeScraper.id}/brand-categories`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            mode: browseMode,
            optionIds: toLoad,
          }),
        },
      );

      const contentType = response.headers.get("content-type") ?? "";
      let categoriesByOption: Record<string, SupplierBrowseOption[]> = {};

      if (contentType.includes("text/event-stream")) {
        const payload = await consumeSupplierSse<{
          event: "result";
          categoriesByBrand?: Record<string, SupplierBrowseOption[]>;
          categoriesByOption?: Record<string, SupplierBrowseOption[]>;
        }>(response, appendLog);
        categoriesByOption =
          payload.categoriesByOption ?? payload.categoriesByBrand ?? {};
      } else {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not load categories.");
        }
        categoriesByOption =
          payload.categoriesByOption ?? payload.categoriesByBrand ?? {};
      }

      // Mark parents with no nested categories as loaded (empty array).
      for (const id of toLoad) {
        if (!(id in categoriesByOption)) categoriesByOption[id] = [];
      }

      setBrandCategories((current) => ({ ...current, ...categoriesByOption }));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load categories for the selected options.",
      );
    } finally {
      setIsLoadingBrandCategories(false);
    }
  };

  const buildScrapeTargets = (): SupplierScrapeTarget[] => {
    const targets: SupplierScrapeTarget[] = [];
    for (const parentId of selectedOptionIds) {
      const parent = availableOptions.find((option) => option.id === parentId);
      if (!parent) continue;
      const categories = brandCategories[parentId] ?? [];
      const selectedSubs = categories.filter((category) =>
        selectedSubcategoryIds.has(category.id),
      );

      if (categories.length > 0) {
        // Nested categories exist: only scrape the ones the user ticked.
        for (const subcategory of selectedSubs) {
          targets.push({
            id: subcategory.id,
            name: `${parent.name} · ${subcategory.name}`,
            url: subcategory.url,
            parentId: parent.id,
          });
        }
      } else {
        // No nested categories found: scrape the parent itself.
        targets.push({
          id: parent.id,
          name: parent.name,
          url: parent.url,
          parentId: null,
        });
      }
    }
    return targets;
  };

  const selectedCategoryCount = [...selectedOptionIds].reduce((sum, parentId) => {
    const categories = brandCategories[parentId] ?? [];
    if (categories.length === 0) return sum;
    return (
      sum + categories.filter((category) => selectedSubcategoryIds.has(category.id)).length
    );
  }, 0);

  const parentsNeedingCategoryChoice = [...selectedOptionIds].filter((parentId) => {
    const categories = brandCategories[parentId];
    return Array.isArray(categories) && categories.length > 0;
  });

  const canRunScrape =
    selectedOptionIds.size > 0 &&
    !isLoadingBrandCategories &&
    parentsNeedingCategoryChoice.every((parentId) =>
      (brandCategories[parentId] ?? []).some((category) =>
        selectedSubcategoryIds.has(category.id),
      ),
    );

  // Whenever brands/categories are selected, load their nested categories for this run.
  React.useEffect(() => {
    if (!activeScraper) return;
    if (selectedOptionIds.size === 0) return;
    if (phase !== "configured" && phase !== "error" && phase !== "done" && phase !== "review") {
      return;
    }
    const missing = [...selectedOptionIds].filter((id) => brandCategories[id] === undefined);
    if (missing.length === 0) return;
    void loadOptionCategories(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScraperId, selectedOptionIds, browseMode, phase]);

  const toggleVisibleOptions = () => {
    const allVisibleSelected =
      filteredOptions.length > 0 &&
      filteredOptions.every((option) => selectedOptionIds.has(option.id));
    setSelectedOptionIds((current) => {
      const next = new Set(current);
      for (const option of filteredOptions) {
        if (allVisibleSelected) next.delete(option.id);
        else next.add(option.id);
      }
      return next;
    });
  };

  const runScraper = async () => {
    if (!activeScraper || !canRunScrape) {
      if (selectedOptionIds.size === 0) return;
      setError(
        parentsNeedingCategoryChoice.length > 0
          ? "Select at least one category or subcategory to scrape for each chosen brand/category."
          : `Choose at least one ${browseMode}.`,
      );
      return;
    }
    setPhase("running");
    setError(null);
    setProducts([]);
    setMatches({});
    setSelectedProductIds(new Set());
    setImportSummary(null);
    setActivityLogs([]);
    setScrapeProgress(null);
    hasEnteredReviewRef.current = false;
    setImagePreferences({});
    setExcludedImages({});
    setAlternatePhotoProgress(null);

    const scrapeTargets = buildScrapeTargets();
    if (scrapeTargets.length === 0) {
      setPhase("error");
      setError("Select at least one category or subcategory to scrape.");
      return;
    }
    const alternatePhotoSource = alternatePhotoWebsite.trim()
      ? {
          enabled: true,
          websiteUrl: normaliseWebsiteUrl(alternatePhotoWebsite),
          sourceName: alternatePhotoName.trim() || hostname(alternatePhotoWebsite),
          searchUrlTemplate: alternatePhotoSearchTemplate.trim() || null,
        }
      : undefined;

    try {
      const response = await fetch(
        `/api/store/scrape/suppliers/${activeScraper.id}/run`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            mode: browseMode,
            optionIds: [...selectedOptionIds],
            maxProducts: maxProducts.trim() ? Number(maxProducts) : null,
            scrapeTargets,
            alternatePhotoSource,
          }),
        },
      );
      const payload = await consumeSupplierSse<{
        event: "result";
        products: SupplierScrapedProduct[];
        matches: SupplierProductMatches;
      }>(
        response,
        appendLog,
        (event) => {
          if (event.event === "scrape_started" && typeof event.total === "number") {
            setScrapeProgress({ scraped: 0, total: event.total });
            return;
          }
          if (event.event === "alternate_photos_started" && typeof event.total === "number") {
            setAlternatePhotoProgress({ matched: 0, total: event.total });
            return;
          }
          if (event.event === "product" && event.product) {
            const product = event.product as SupplierScrapedProduct;
            const progress = event.progress as { index: number; total: number } | undefined;
            setProducts((current) => {
              const existingIndex = current.findIndex(
                (item) => item.productId === product.productId,
              );
              if (existingIndex === -1) return [...current, product];
              const next = [...current];
              next[existingIndex] = product;
              return next;
            });
            setSelectedProductIds((current) => new Set([...current, product.productId]));
            setImagePreferences((current) => ({
              ...current,
              [product.productId]: defaultImagePreference(product),
            }));
            if (progress) {
              if (event.photoMatch) {
                setAlternatePhotoProgress({
                  matched: progress.index,
                  total: progress.total,
                });
              } else {
                setScrapeProgress({
                  scraped: progress.index,
                  total: progress.total,
                });
              }
            }
            if (!hasEnteredReviewRef.current) {
              hasEnteredReviewRef.current = true;
              window.setTimeout(() => {
                reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 100);
            }
          }
        },
      );

      const scrapedProducts = payload.products ?? [];
      const productMatches = payload.matches ?? {};
      setProducts(scrapedProducts);
      setMatches(productMatches);
      setScrapeProgress(
        scrapedProducts.length > 0
          ? { scraped: scrapedProducts.length, total: scrapedProducts.length }
          : null,
      );
      const reviewIds = scrapedProducts
        .filter((product) => productMatches[product.productId]?.status !== "unchanged")
        .map((product) => product.productId);
      setSelectedProductIds(
        new Set(reviewIds.length > 0 ? reviewIds : scrapedProducts.map((product) => product.productId)),
      );
      setImagePreferences(
        Object.fromEntries(
          scrapedProducts.map((product) => [
            product.productId,
            defaultImagePreference(product),
          ]),
        ),
      );
      setPhase("review");
      if (!hasEnteredReviewRef.current) {
        window.setTimeout(() => {
          reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
      }
    } catch (runError) {
      setPhase("error");
      setError(
        runError instanceof Error ? runError.message : "The supplier scrape failed.",
      );
    }
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleAllProducts = () => {
    setSelectedProductIds((current) =>
      current.size === products.length
        ? new Set()
        : new Set(products.map((product) => product.productId)),
    );
  };

  const saveAlternatePhotoConfig = async () => {
    if (!activeScraper || !alternatePhotoWebsite.trim()) return;
    setError(null);
    setAlternatePhotoSaveMessage(null);
    setIsSavingAlternatePhoto(true);
    try {
      const alternatePhotoSource: AlternatePhotoSourceConfig = {
        enabled: true,
        websiteUrl: normaliseWebsiteUrl(alternatePhotoWebsite),
        sourceName: alternatePhotoName.trim() || hostname(alternatePhotoWebsite),
        searchUrlTemplate: alternatePhotoSearchTemplate.trim() || null,
      };
      const response = await fetch(`/api/store/scrape/suppliers/${activeScraper.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alternatePhotoSource }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not save the official photo source.");
      }
      const scraper = payload.scraper as StoredSupplierScraper;
      setScrapers((current) =>
        current.map((item) => (item.id === scraper.id ? scraper : item)),
      );
      syncAlternatePhotoForm(scraper);
      setAlternatePhotoSaveMessage(
        `Saved official photo source (${alternatePhotoSource.sourceName}).`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save the official photo source.",
      );
    } finally {
      setIsSavingAlternatePhoto(false);
    }
  };

  const fetchAlternatePhotos = async (
    productsOverride?: SupplierScrapedProduct[],
  ) => {
    const productsToMatch = productsOverride ?? selectedProducts;
    if (!activeScraper || productsToMatch.length === 0 || !alternatePhotoWebsite.trim()) {
      return;
    }
    setPhase("fetching_photos");
    setError(null);
    setActivityLogs([]);
    setAlternatePhotoProgress({ matched: 0, total: productsToMatch.length });

    try {
      const response = await fetch(
        `/api/store/scrape/suppliers/${activeScraper.id}/alternate-photos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            products: productsToMatch,
            alternatePhotoSource: {
              enabled: true,
              websiteUrl: normaliseWebsiteUrl(alternatePhotoWebsite),
              sourceName: alternatePhotoName.trim() || hostname(alternatePhotoWebsite),
              searchUrlTemplate: alternatePhotoSearchTemplate.trim() || null,
            },
          }),
        },
      );

      const payload = await consumeSupplierSse<{
        event: "result";
        products: SupplierScrapedProduct[];
      }>(
        response,
        appendLog,
        (event) => {
          if (event.event === "product" && event.product) {
            const product = event.product as SupplierScrapedProduct;
            const progress = event.progress as { index: number; total: number } | undefined;
            setProducts((current) =>
              current.map((item) =>
                item.productId === product.productId ? product : item,
              ),
            );
            setImagePreferences((current) => ({
              ...current,
              [product.productId]: defaultImagePreference(product),
            }));
            if (progress) {
              setAlternatePhotoProgress({
                matched: progress.index,
                total: progress.total,
              });
            }
          }
        },
      );

      const enriched = payload.products ?? [];
      setProducts((current) =>
        current.map((product) => enriched.find((item) => item.productId === product.productId) ?? product),
      );
      setImagePreferences((current) => {
        const next = { ...current };
        for (const product of enriched) {
          next[product.productId] = defaultImagePreference(product);
        }
        return next;
      });
      setAlternatePhotoProgress({
        matched: enriched.filter((product) => product.alternatePhoto?.status === "matched").length,
        total: enriched.length,
      });
      setPhase("review");
    } catch (fetchError) {
      setPhase("error");
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Could not fetch official product photos.",
      );
    }
  };

  const updateImagePreference = (
    productId: string,
    preference: SupplierImageSourcePreference,
  ) => {
    setImagePreferences((current) => ({ ...current, [productId]: preference }));
  };

  const applyImagePreferenceToAll = (preference: SupplierImageSourcePreference) => {
    setImagePreferences((current) => {
      const next = { ...current };
      for (const productId of selectedProductIds) {
        next[productId] = preference;
      }
      return next;
    });
  };

  const removeProductImage = (productId: string, imageUrl: string) => {
    setExcludedImages((current) => {
      const existing = current[productId] ?? [];
      if (existing.includes(imageUrl)) return current;
      return { ...current, [productId]: [...existing, imageUrl] };
    });
  };

  const restoreProductImage = (productId: string, imageUrl: string) => {
    setExcludedImages((current) => {
      const existing = current[productId] ?? [];
      const nextUrls = existing.filter((url) => url !== imageUrl);
      if (nextUrls.length === 0) {
        const rest = { ...current };
        delete rest[productId];
        return rest;
      }
      return { ...current, [productId]: nextUrls };
    });
  };

  const importProducts = async (
    fieldMapping: FieldMapping,
    preferences?: SupplierImageSourcePreferences,
  ) => {
    if (!activeScraper || selectedProducts.length === 0) return;
    setPhase("importing");
    setError(null);

    try {
      const response = await fetch(
        `/api/store/scrape/suppliers/${activeScraper.id}/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            products: selectedProducts,
            fieldMapping,
            imagePreferences: preferences,
            excludedImages,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not import supplier products.");
      }
      setImportSummary({
        created: payload.created ?? 0,
        updated: payload.updated ?? 0,
        groupsCreated: payload.groupsCreated ?? 0,
        imagesSaved: payload.imagesSaved ?? 0,
        errors: payload.errors ?? [],
      });
      setScrapers((current) =>
        current.map((scraper) =>
          scraper.id === activeScraper.id
            ? { ...scraper, fieldMapping, status: "ready" }
            : scraper,
        ),
      );
      setPhase("done");
    } catch (importError) {
      setPhase("error");
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not import supplier products.",
      );
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-md border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-gray-100 p-2">
              <Sparkles className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Build a scraper with YJ</h3>
              <p className="mt-1 max-w-3xl text-sm text-gray-600">
                Give YJ a supplier website and login. YJ signs in, finds the catalogue,
                detects brand and category paths, learns the product fields, and saves a
                reusable scraper for reviewed manual runs.
              </p>
            </div>
          </div>
          {activeScraper ? (
            <Button variant="outline" className="rounded-md" onClick={startNewScraper}>
              <Plus className="h-4 w-4" />
              New scraper
            </Button>
          ) : null}
        </div>
      </div>

      {loadingScrapers ? (
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading saved scrapers
          </div>
        </div>
      ) : scrapers.length > 0 ? (
        <div className="rounded-md border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-5 py-4">
            <h3 className="text-sm font-semibold text-gray-900">Saved supplier scrapers</h3>
            <p className="mt-1 text-sm text-gray-600">
              Run a saved scraper manually whenever you need updated supplier data.
            </p>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {scrapers.map((scraper) => (
              <button
                type="button"
                key={scraper.id}
                onClick={() => openScraper(scraper)}
                className={cn(
                  "rounded-md border bg-white p-4 text-left transition-colors",
                  activeScraperId === scraper.id
                    ? "border-gray-400"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">{scraper.name}</p>
                    <p className="mt-1 truncate text-xs text-gray-500">
                      {hostname(scraper.baseUrl)}
                    </p>
                  </div>
                  <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600">
                    {scraper.status}
                  </span>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Last run: {formatDate(scraper.lastRunAt)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!activeScraper ? (
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="supplier-name">Supplier name</Label>
              <Input
                id="supplier-name"
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
                placeholder="e.g. Shimano B2B"
                className="rounded-md"
                disabled={phase === "building"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-website">Catalogue or website URL</Label>
              <Input
                id="supplier-website"
                type="url"
                value={websiteUrl}
                onChange={(event) => setWebsiteUrl(event.target.value)}
                placeholder="https://supplier.example.com"
                className="rounded-md"
                disabled={phase === "building"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-login-url">Login page URL</Label>
              <Input
                id="supplier-login-url"
                type="url"
                value={loginUrl}
                onChange={(event) => setLoginUrl(event.target.value)}
                placeholder="Optional, YJ will start from the website URL"
                className="rounded-md"
                disabled={phase === "building"}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-username">Username or email</Label>
              <Input
                id="supplier-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="supplier login"
                autoComplete="username"
                className="rounded-md"
                disabled={phase === "building"}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="supplier-password">Password</Label>
              <Input
                id="supplier-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="supplier password"
                autoComplete="current-password"
                className="rounded-md"
                disabled={phase === "building"}
              />
              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <Lock className="h-3.5 w-3.5" />
                Credentials are encrypted before storage and are never shown again.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <Button
              className="rounded-md"
              onClick={buildScraper}
              disabled={phase === "building" || !websiteUrl.trim()}
            >
              {phase === "building" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  YJ is learning this website
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Build scraper with YJ
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "building" || phase === "running" || phase === "fetching_photos" ? (
        <SupplierScraperLogPanel
          logs={activityLogs}
          title={
            phase === "building"
              ? "YJ build log"
              : phase === "fetching_photos"
                ? "Official photo match log"
                : "YJ scrape log"
          }
        />
      ) : null}

      {phase === "building" ? (
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-gray-600" />
            <div>
              <p className="text-sm font-semibold text-gray-900">YJ is building the scraper</p>
              <p className="mt-1 text-sm text-gray-600">
                Signing in, locating the catalogue, checking brand and category paths,
                opening a sample product, and learning its fields and image gallery.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {activeScraper && ["configured", "running", "review", "importing", "fetching_photos", "done", "error"].includes(phase) ? (
        <div className="rounded-md border border-gray-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">{activeScraper.name}</h3>
                <span className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600">
                  Credentials saved
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-600">
                YJ found {activeScraper.config.brandOptions.length} brands and{" "}
                {activeScraper.config.categoryOptions.length} categories.
                {sampleProducts[0] ? ` Sample: ${sampleProducts[0].name}.` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Globe className="h-4 w-4" />
              {hostname(activeScraper.config.catalogueUrl)}
            </div>
          </div>

          <div className="space-y-5 p-5">
            <div>
              <Label>Search products by</Label>
              <div className="mt-2 flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
                {activeScraper.config.browseModes.includes("category") ? (
                  <button
                    type="button"
                    onClick={() => changeBrowseMode("category")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                      browseMode === "category"
                        ? "text-gray-800 bg-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70",
                    )}
                  >
                    <Package className="h-3 w-3" />
                    Category
                  </button>
                ) : null}
                {activeScraper.config.browseModes.includes("brand") ? (
                  <button
                    type="button"
                    onClick={() => changeBrowseMode("brand")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                      browseMode === "brand"
                        ? "text-gray-800 bg-white shadow-sm"
                        : "text-gray-600 hover:bg-gray-200/70",
                    )}
                  >
                    <Globe className="h-3 w-3" />
                    Brand
                  </button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>
                  1. Choose {browseMode === "brand" ? "brands" : "categories"}
                </Label>
                <p className="mt-1 text-xs text-gray-500">
                  Then pick the categories or subcategories to include in this scrape.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
                <Input
                  value={optionSearch}
                  onChange={(event) => setOptionSearch(event.target.value)}
                  placeholder={`Search ${browseMode === "brand" ? "brands" : "categories"}`}
                  className="rounded-md"
                />
                <div className="space-y-1">
                  <Input
                    type="number"
                    min={1}
                    max={5000}
                    value={maxProducts}
                    onChange={(event) => setMaxProducts(event.target.value)}
                    placeholder="Max products per selection"
                    className="rounded-md"
                  />
                  <p className="text-[11px] text-gray-500">
                    Leave blank for all products in each selected category.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="rounded-md h-10"
                  onClick={toggleVisibleOptions}
                  disabled={filteredOptions.length === 0 || phase === "running"}
                >
                  {filteredOptions.every((option) => selectedOptionIds.has(option.id)) &&
                  filteredOptions.length > 0
                    ? "Deselect shown"
                    : "Select shown"}
                </Button>
              </div>

              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredOptions.map((option: SupplierBrowseOption) => {
                  const isSelected = selectedOptionIds.has(option.id);
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2.5 text-sm transition-colors",
                        isSelected
                          ? "border-gray-400 text-gray-900"
                          : "border-gray-200 text-gray-600 hover:border-gray-300",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOption(option.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    </label>
                  );
                })}
                {filteredOptions.length === 0 ? (
                  <p className="col-span-full px-1 py-2 text-sm text-gray-500">
                    No {browseMode === "brand" ? "brands" : "categories"} match this search.
                  </p>
                ) : null}
              </div>
            </div>

            {selectedOptionIds.size > 0 ? (
              <div className="rounded-md border border-gray-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Label>2. Choose categories / subcategories for this run</Label>
                    <p className="mt-1 text-xs text-gray-500">
                      Tick every category you want scraped. The run only includes what you select
                      here.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isLoadingBrandCategories ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading categories…
                      </span>
                    ) : (
                      <Button
                        variant="outline"
                        className="rounded-md"
                        onClick={() => void loadOptionCategories([...selectedOptionIds], { force: true })}
                        disabled={phase === "running" || phase === "importing"}
                      >
                        Reload categories
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="rounded-md"
                      disabled={
                        [...selectedOptionIds].every(
                          (parentId) => (brandCategories[parentId] ?? []).length === 0,
                        ) || phase === "running"
                      }
                      onClick={() => {
                        setSelectedSubcategoryIds((current) => {
                          const next = new Set(current);
                          for (const parentId of selectedOptionIds) {
                            for (const category of brandCategories[parentId] ?? []) {
                              next.add(category.id);
                            }
                          }
                          return next;
                        });
                      }}
                    >
                      Select all categories
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-md"
                      disabled={selectedSubcategoryIds.size === 0 || phase === "running"}
                      onClick={() => setSelectedSubcategoryIds(new Set())}
                    >
                      Clear categories
                    </Button>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {[...selectedOptionIds].map((parentId) => {
                    const parent = availableOptions.find((option) => option.id === parentId);
                    if (!parent) return null;
                    const categories = brandCategories[parentId];
                    const loaded = Array.isArray(categories);
                    const selectedInParent = (categories ?? []).filter((category) =>
                      selectedSubcategoryIds.has(category.id),
                    ).length;

                    return (
                      <div
                        key={parentId}
                        className="rounded-md border border-gray-200 bg-white p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-gray-900">{parent.name}</p>
                          <span className="text-[11px] text-gray-500">
                            {!loaded || isLoadingBrandCategories
                              ? "Loading…"
                              : categories.length === 0
                                ? "No nested categories found · whole catalogue will be scraped"
                                : `${selectedInParent} of ${categories.length} selected`}
                          </span>
                        </div>

                        {loaded && categories.length > 0 ? (
                          <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {categories.map((category) => {
                              const subSelected = selectedSubcategoryIds.has(category.id);
                              return (
                                <label
                                  key={category.id}
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-xs transition-colors",
                                    subSelected
                                      ? "border-gray-400 bg-gray-50 text-gray-900"
                                      : "border-gray-200 text-gray-600 hover:border-gray-300",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={subSelected}
                                    onChange={() => toggleSubcategory(category.id)}
                                  />
                                  <span className="min-w-0 truncate">{category.name}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {parentsNeedingCategoryChoice.length > 0 && selectedCategoryCount === 0 ? (
                  <div className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                    Select at least one category or subcategory above before running the scraper.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="rounded-md"
                onClick={runScraper}
                disabled={
                  !canRunScrape ||
                  phase === "running" ||
                  phase === "importing" ||
                  phase === "fetching_photos"
                }
              >
                {phase === "running" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scraping products and images
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run scraper
                  </>
                )}
              </Button>
              <span className="text-sm text-gray-500">
                {selectedOptionIds.size}{" "}
                {browseMode === "brand"
                  ? selectedOptionIds.size === 1
                    ? "brand"
                    : "brands"
                  : selectedOptionIds.size === 1
                    ? "category"
                    : "categories"}
                {selectedCategoryCount > 0
                  ? ` · ${selectedCategoryCount} ${
                      selectedCategoryCount === 1 ? "subcategory" : "subcategories"
                    } selected`
                  : ""}{" "}
                ready to scrape
              </span>
            </div>

            <div className="rounded-md border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <ImageIcon className="mt-0.5 h-5 w-5 text-gray-700" />
                <div className="w-full space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Official photo source</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Optional. When set, YJ matches official photos automatically during the
                      scrape while still importing pricing, stock, and descriptions from the
                      supplier.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="alternate-photo-website">Official website URL</Label>
                      <Input
                        id="alternate-photo-website"
                        type="url"
                        value={alternatePhotoWebsite}
                        onChange={(event) => setAlternatePhotoWebsite(event.target.value)}
                        placeholder="https://www.focus-bikes.com/int/"
                        className="rounded-md"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="alternate-photo-name">Photo source label</Label>
                      <Input
                        id="alternate-photo-name"
                        value={alternatePhotoName}
                        onChange={(event) => setAlternatePhotoName(event.target.value)}
                        placeholder="Focus official"
                        className="rounded-md"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="alternate-photo-search">Search URL template (optional)</Label>
                      <Input
                        id="alternate-photo-search"
                        value={alternatePhotoSearchTemplate}
                        onChange={(event) => setAlternatePhotoSearchTemplate(event.target.value)}
                        placeholder="https://bike.shimano.com/search?q={query}"
                        className="rounded-md"
                      />
                      <p className="text-xs text-gray-500">
                        Use {"{query}"} where the SKU or product name should be inserted.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      className="rounded-md"
                      onClick={saveAlternatePhotoConfig}
                      disabled={
                        !alternatePhotoWebsite.trim() ||
                        phase === "fetching_photos" ||
                        isSavingAlternatePhoto
                      }
                    >
                      {isSavingAlternatePhoto ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving official photo source
                        </>
                      ) : (
                        "Save official photo source"
                      )}
                    </Button>
                    {alternatePhotoSaveMessage ? (
                      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                        <CheckCircle2 className="h-4 w-4 text-gray-700" />
                        <span>{alternatePhotoSaveMessage}</span>
                      </div>
                    ) : null}
                    {alternatePhotoConfig?.websiteUrl ? (
                      <span className="text-xs text-gray-500">
                        Saved on scraper: {alternatePhotoConfig.sourceName} (
                        {hostname(alternatePhotoConfig.websiteUrl)})
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "running" ? (
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-gray-600" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Scraping supplier catalogue</p>
              <p className="mt-1 text-sm text-gray-600">
                {alternatePhotoProgress
                  ? `Matching official photos: ${alternatePhotoProgress.matched} of ${alternatePhotoProgress.total} products.`
                  : scrapeProgress
                    ? `Scraped ${scrapeProgress.scraped} of ${scrapeProgress.total} products so far. New rows appear below as each product page is processed.`
                    : "YJ is finding product pages, then it will open each one and collect variants, stock, and image URLs."}
                {alternatePhotoWebsite.trim() && !alternatePhotoProgress
                  ? " Official photos will be matched after the catalogue scrape."
                  : ""}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-red-200 bg-white p-4 text-sm text-red-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      {phase === "fetching_photos" ? (
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-gray-600" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Matching official product photos</p>
              <p className="mt-1 text-sm text-gray-600">
                {alternatePhotoProgress
                  ? `Processed ${alternatePhotoProgress.matched} of ${alternatePhotoProgress.total} selected products.`
                  : "YJ is searching the official website by SKU and product name, then extracting gallery images."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {activeScraper &&
      (phase === "review" ||
        phase === "importing" ||
        phase === "fetching_photos" ||
        (phase === "running" && products.length > 0)) &&
      products.length > 0 ? (
        <div ref={reviewRef}>
          <div className="mb-4 rounded-md border border-gray-200 bg-white p-5">
            <div className="flex items-start gap-3">
              {phase === "running" ? (
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-gray-600" />
              ) : (
                <ScanSearch className="mt-0.5 h-5 w-5 text-gray-700" />
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {phase === "running"
                    ? "Products appearing as they are scraped"
                    : "Review extracted fields and catalogue changes"}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {phase === "running" ? (
                    <>
                      {scrapeProgress
                        ? `${scrapeProgress.scraped} of ${scrapeProgress.total} products loaded. `
                        : `${products.length} products loaded. `}
                      {alternatePhotoWebsite.trim()
                        ? "Official photos are matched during the scrape. "
                        : ""}
                      Import unlocks once the scrape finishes.
                    </>
                  ) : (
                    <>
                      Confirm the supplier-to-YJ field mapping, review new and changed products,
                      and choose which photos to keep before import.
                    </>
                  )}
                </p>
                {showPhotoPreview && (phase === "review" || phase === "fetching_photos") ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline disabled:opacity-50"
                      onClick={() => void fetchAlternatePhotos()}
                      disabled={selectedProducts.length === 0 || phase === "fetching_photos"}
                    >
                      {phase === "fetching_photos"
                        ? "Refreshing official photos…"
                        : "Refresh official photos"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <StoreFesportsScrapeReview
            key={activeScraper.id}
            products={products}
            selectedIds={selectedProductIds}
            onToggleProduct={toggleProduct}
            onToggleAll={toggleAllProducts}
            onCreateListings={importProducts}
            isCreating={
              phase === "importing" || phase === "running" || phase === "fetching_photos"
            }
            sourceName={activeScraper.name}
            initialFieldMapping={activeScraper.fieldMapping}
            productMatches={phase === "running" || phase === "fetching_photos" ? undefined : matches}
            actionLabel={
              phase === "running" || phase === "fetching_photos"
                ? "Import after scrape"
                : "Import or update"
            }
            showPhotoPreview={showPhotoPreview}
            supplierPhotoLabel={activeScraper.name}
            alternatePhotoSourceName={
              alternatePhotoConfig?.sourceName || hostname(alternatePhotoWebsite)
            }
            imagePreferences={imagePreferences}
            onImagePreferenceChange={updateImagePreference}
            onApplyImagePreferenceToAll={applyImagePreferenceToAll}
            isFetchingAlternatePhotos={phase === "fetching_photos"}
            excludedImages={excludedImages}
            onRemoveImage={removeProductImage}
            onRestoreImage={restoreProductImage}
          />
        </div>
      ) : null}

      {phase === "done" && importSummary ? (
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-gray-700" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Supplier import complete</p>
              <p className="mt-1 text-sm text-gray-600">
                Created {importSummary.created} product rows, updated {importSummary.updated},
                created {importSummary.groupsCreated} variant groups, and saved{" "}
                {importSummary.imagesSaved} new images. Image files continue uploading in the
                background.
              </p>
              {importSummary.errors.length > 0 ? (
                <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-600">
                  {importSummary.errors.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
