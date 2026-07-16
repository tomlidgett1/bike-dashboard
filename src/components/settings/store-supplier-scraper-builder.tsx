"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Globe,
  ImageIcon,
  Loader2,
  Lock,
  Package,
  Play,
  Plus,
  ScanSearch,
  Sparkles,
  Trash2,
} from "@/components/layout/app-sidebar/dashboard-icons";
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
import { StoreFesportsScrapeReview } from "@/components/settings/store-fesports-scrape-review";
import type { SupplierExcludedImages } from "@/components/settings/store-supplier-photo-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { FieldMapping } from "@/lib/scrapers/fesports-field-mapping";
import type { SupplierCategoryOverrides } from "@/lib/scrapers/supplier-category";
import { summariseReadiness } from "@/lib/scrapers/supplier-readiness";
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
  | "running"
  | "fetching_photos"
  | "importing";

type FlowStep = "select" | "scrape" | "review" | "done";

type BuilderView =
  | { kind: "home" }
  | { kind: "create" }
  | { kind: "run"; step: FlowStep };

const RUN_STEPS: Array<{ id: FlowStep; label: string }> = [
  { id: "select", label: "Select products" },
  { id: "scrape", label: "Scrape" },
  { id: "review", label: "Review" },
  { id: "done", label: "Import" },
];

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

function scraperStatusLabel(scraper: StoredSupplierScraper): string {
  if (scraper.status === "error" || scraper.lastRunStatus === "failed") {
    return "Last run failed";
  }
  if (!scraper.lastRunAt) return "Ready for first run";
  return "Ready";
}

/* ── Shared pieces ─────────────────────────────────────────────────── */

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-white p-4 text-sm text-red-700">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
    </div>
  );
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
            Live progress from YJ while it works.
          </p>
        </div>
        <span className="text-[11px] font-medium text-gray-500">{logs.length} steps</span>
      </div>
      <div
        ref={containerRef}
        className="max-h-64 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] leading-5 text-gray-700"
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

function WorkflowStepper({
  current,
  furthest,
  busy,
  onNavigate,
}: {
  current: FlowStep;
  furthest: number;
  busy: boolean;
  onNavigate: (step: FlowStep) => void;
}) {
  const currentIndex = RUN_STEPS.findIndex((step) => step.id === current);

  return (
    <ol className="flex flex-wrap items-center gap-1">
      {RUN_STEPS.map((step, index) => {
        const isCurrent = index === currentIndex;
        const isComplete = index < currentIndex || (current === "done" && index === currentIndex);
        const reachable =
          !busy && index <= furthest && index !== currentIndex && step.id !== "scrape";
        return (
          <li key={step.id} className="flex items-center gap-1">
            {index > 0 ? <div className="h-px w-5 bg-gray-300 sm:w-8" /> : null}
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onNavigate(step.id)}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                isCurrent ? "text-gray-900" : "text-gray-500",
                reachable ? "hover:bg-gray-100 hover:text-gray-800" : "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full border text-[10px]",
                  isCurrent
                    ? "border-gray-900 bg-gray-900 text-white"
                    : isComplete
                      ? "border-gray-400 bg-white text-gray-700"
                      : "border-gray-300 bg-white text-gray-400",
                )}
              >
                {isComplete && !isCurrent ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

export function StoreSupplierScraperBuilder() {
  const [view, setView] = React.useState<BuilderView>({ kind: "home" });
  const [scrapers, setScrapers] = React.useState<StoredSupplierScraper[]>([]);
  const [activeScraperId, setActiveScraperId] = React.useState<string | null>(null);
  const [loadingScrapers, setLoadingScrapers] = React.useState(true);
  const [phase, setPhase] = React.useState<BuilderPhase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<StoredSupplierScraper | null>(null);
  const [isArchiving, setIsArchiving] = React.useState(false);

  // New-supplier form
  const [supplierName, setSupplierName] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [loginUrl, setLoginUrl] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [sampleProducts, setSampleProducts] = React.useState<SupplierScrapedProduct[]>([]);

  // Run configuration
  const [browseMode, setBrowseMode] = React.useState<SupplierBrowseMode>("category");
  const [optionSearch, setOptionSearch] = React.useState("");
  const [selectedOptionIds, setSelectedOptionIds] = React.useState<Set<string>>(new Set());
  const [maxProducts, setMaxProducts] = React.useState("");
  const [runOptionsOpen, setRunOptionsOpen] = React.useState(false);
  const [brandCategories, setBrandCategories] = React.useState<
    Record<string, SupplierBrowseOption[]>
  >({});
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [isLoadingBrandCategories, setIsLoadingBrandCategories] = React.useState(false);

  // Scrape results
  const [products, setProducts] = React.useState<SupplierScrapedProduct[]>([]);
  const [matches, setMatches] = React.useState<SupplierProductMatches>({});
  const [selectedProductIds, setSelectedProductIds] = React.useState<Set<string>>(new Set());
  const [importSummary, setImportSummary] = React.useState<ImportSummary | null>(null);
  const [activityLogs, setActivityLogs] = React.useState<SupplierLogEntry[]>([]);
  const [scrapeProgress, setScrapeProgress] = React.useState<{
    scraped: number;
    total: number;
  } | null>(null);

  // Official photo source
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
  const busy = phase === "building" || phase === "running" || phase === "fetching_photos" || phase === "importing";

  const syncAlternatePhotoForm = React.useCallback((scraper: StoredSupplierScraper) => {
    const source = scraper.config.alternatePhotoSource;
    setAlternatePhotoWebsite(source?.websiteUrl ?? "");
    setAlternatePhotoName(source?.sourceName ?? "");
    setAlternatePhotoSearchTemplate(source?.searchUrlTemplate ?? "");
  }, []);

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

  const resetRunState = () => {
    setProducts([]);
    setMatches({});
    setSelectedProductIds(new Set());
    setImportSummary(null);
    setError(null);
    setActivityLogs([]);
    setScrapeProgress(null);
    setImagePreferences({});
    setExcludedImages({});
    setAlternatePhotoProgress(null);
  };

  const goHome = () => {
    setActiveScraperId(null);
    resetRunState();
    setSelectedOptionIds(new Set());
    setSelectedSubcategoryIds(new Set());
    setBrandCategories({});
    setOptionSearch("");
    setView({ kind: "home" });
  };

  const openScraper = (scraper: StoredSupplierScraper) => {
    const mode = scraper.config.browseModes.includes("category")
      ? "category"
      : scraper.config.browseModes[0] ?? "category";
    setActiveScraperId(scraper.id);
    setBrowseMode(mode);
    setSelectedOptionIds(new Set());
    setOptionSearch("");
    resetRunState();
    setBrandCategories({});
    setSelectedSubcategoryIds(new Set());
    setRunOptionsOpen(false);
    syncAlternatePhotoForm(scraper);
    setView({ kind: "run", step: "select" });
  };

  const startNewScraper = () => {
    setActiveScraperId(null);
    setSupplierName("");
    setWebsiteUrl("");
    setLoginUrl("");
    setUsername("");
    setPassword("");
    setSampleProducts([]);
    resetRunState();
    setSelectedOptionIds(new Set());
    setBrandCategories({});
    setSelectedSubcategoryIds(new Set());
    setView({ kind: "create" });
  };

  const archiveScraper = async () => {
    if (!archiveTarget) return;
    setIsArchiving(true);
    try {
      const response = await fetch(`/api/store/scrape/suppliers/${archiveTarget.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not archive the scraper.");
      setScrapers((current) => current.filter((item) => item.id !== archiveTarget.id));
      if (activeScraperId === archiveTarget.id) goHome();
    } catch (archiveError) {
      setError(
        archiveError instanceof Error ? archiveError.message : "Could not archive the scraper.",
      );
    } finally {
      setIsArchiving(false);
      setArchiveTarget(null);
    }
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
      syncAlternatePhotoForm(scraper);
      setPhase("idle");
      setView({ kind: "run", step: "select" });
    } catch (buildError) {
      setPhase("idle");
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
        }>(response, () => undefined);
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
    if (view.kind !== "run" || view.step !== "select") return;
    if (selectedOptionIds.size === 0) return;
    const missing = [...selectedOptionIds].filter((id) => brandCategories[id] === undefined);
    if (missing.length === 0) return;
    void loadOptionCategories(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScraperId, selectedOptionIds, browseMode, view]);

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
    const scrapeTargets = buildScrapeTargets();
    if (scrapeTargets.length === 0) {
      setError("Select at least one category or subcategory to scrape.");
      return;
    }

    setPhase("running");
    resetRunState();
    setView({ kind: "run", step: "scrape" });

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
      setPhase("idle");
      setView({ kind: "run", step: "review" });
    } catch (runError) {
      setPhase("idle");
      setError(
        runError instanceof Error ? runError.message : "The supplier scrape failed.",
      );
      setView({ kind: "run", step: "select" });
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

  const fetchAlternatePhotos = async () => {
    const productsToMatch = selectedProducts;
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
      setPhase("idle");
    } catch (fetchError) {
      setPhase("idle");
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
    categoryOverrides?: SupplierCategoryOverrides,
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
            categoryOverrides,
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
      setPhase("idle");
      setView({ kind: "run", step: "done" });
    } catch (importError) {
      setPhase("idle");
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not import supplier products.",
      );
    }
  };

  /* ── Views ───────────────────────────────────────────────────────── */

  if (view.kind === "home") {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-gray-100 p-2">
              <Sparkles className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Supplier scrapers</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                Connect a supplier once — YJ learns the site, then every run walks you through
                selecting, scraping, reviewing, and importing products into your catalogue.
              </p>
            </div>
          </div>
          <Button className="rounded-md" onClick={startNewScraper}>
            <Plus className="h-4 w-4" />
            New supplier
          </Button>
        </div>

        {error ? <ErrorBanner message={error} /> : null}

        {loadingScrapers ? (
          <div className="rounded-md border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading saved scrapers
            </div>
          </div>
        ) : scrapers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <ScanSearch className="h-8 w-8 text-gray-400" />
            <div>
              <p className="text-sm font-semibold text-gray-900">No suppliers connected yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
                Give YJ a supplier website and login. It signs in, learns the catalogue
                structure, and saves a reusable scraper you can run any time.
              </p>
            </div>
            <Button className="mt-2 rounded-md" onClick={startNewScraper}>
              <Plus className="h-4 w-4" />
              Connect your first supplier
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {scrapers.map((scraper) => (
              <div
                key={scraper.id}
                className="group relative rounded-md border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
              >
                <button
                  type="button"
                  onClick={() => openScraper(scraper)}
                  className="block w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3 pr-7">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {scraper.name}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-gray-500">
                        <Globe className="h-3 w-3 shrink-0" />
                        {hostname(scraper.baseUrl)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 text-xs text-gray-500">
                    <span>{scraperStatusLabel(scraper)}</span>
                    <span>Last run: {formatDate(scraper.lastRunAt)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-gray-700">
                    <Play className="h-3.5 w-3.5" />
                    Start a run
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Archive ${scraper.name}`}
                  onClick={() => setArchiveTarget(scraper)}
                  className="absolute right-3 top-3 rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <AlertDialog
          open={archiveTarget !== null}
          onOpenChange={(open) => {
            if (!open) setArchiveTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive {archiveTarget?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                The scraper and its saved login are removed from this list. Products already
                imported stay in your catalogue.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={archiveScraper} disabled={isArchiving}>
                {isArchiving ? "Archiving…" : "Archive scraper"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (view.kind === "create") {
    return (
      <div className="space-y-6 p-6">
        <button
          type="button"
          onClick={goHome}
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          disabled={phase === "building"}
        >
          <ArrowLeft className="h-4 w-4" />
          All suppliers
        </button>

        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-gray-100 p-2">
              <Sparkles className="h-5 w-5 text-gray-700" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Connect a supplier</h3>
              <p className="mt-1 max-w-2xl text-sm text-gray-600">
                YJ signs in, finds the catalogue, detects brand and category paths, learns the
                product fields, and saves a reusable scraper. This usually takes a couple of
                minutes.
              </p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
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

        {error ? <ErrorBanner message={error} /> : null}

        {phase === "building" ? (
          <SupplierScraperLogPanel logs={activityLogs} title="YJ build log" />
        ) : null}
      </div>
    );
  }

  /* ── Run workflow ────────────────────────────────────────────────── */

  if (!activeScraper) {
    return (
      <div className="p-6">
        <ErrorBanner message="This scraper is no longer available." />
        <Button variant="outline" className="mt-4 rounded-md" onClick={goHome}>
          <ArrowLeft className="h-4 w-4" />
          All suppliers
        </Button>
      </div>
    );
  }

  const step = view.step;
  const furthestStep =
    step === "done" ? 3 : products.length > 0 ? 2 : 0;
  const readinessSummary =
    step === "review" || step === "done"
      ? summariseReadiness(selectedProducts, activeScraper.fieldMapping, imagePreferences, excludedImages)
      : null;

  return (
    <div className="flex min-h-full flex-col">
      {/* Workflow header */}
      <div className="space-y-3 border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goHome}
              disabled={busy}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
              All suppliers
            </button>
            <span className="text-gray-300">/</span>
            <div>
              <span className="text-sm font-semibold text-gray-900">{activeScraper.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                {hostname(activeScraper.config.catalogueUrl)}
                {activeScraper.credentialSaved ? " · credentials saved" : ""}
              </span>
            </div>
          </div>
          <WorkflowStepper
            current={step}
            furthest={furthestStep}
            busy={busy}
            onNavigate={(target) => setView({ kind: "run", step: target })}
          />
        </div>
      </div>

      <div className="flex-1 space-y-4 p-6">
        {error && step !== "select" ? <ErrorBanner message={error} /> : null}

        {/* ── Step 1: Select ─────────────────────────────────────────── */}
        {step === "select" ? (
          <>
            {error ? <ErrorBanner message={error} /> : null}
            <div className="rounded-md border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    What should this run scrape?
                  </h3>
                  <p className="mt-0.5 text-sm text-gray-600">
                    YJ found {activeScraper.config.brandOptions.length} brands and{" "}
                    {activeScraper.config.categoryOptions.length} categories on this site.
                    {sampleProducts[0] ? ` Sample product: ${sampleProducts[0].name}.` : ""}
                  </p>
                </div>
                <div className="flex items-center bg-gray-100 p-0.5 rounded-md w-fit">
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
                      By category
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
                      By brand
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-3 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    value={optionSearch}
                    onChange={(event) => setOptionSearch(event.target.value)}
                    placeholder={`Search ${browseMode === "brand" ? "brands" : "categories"}`}
                    className="w-64 rounded-md"
                  />
                  <Button
                    variant="outline"
                    className="rounded-md"
                    onClick={toggleVisibleOptions}
                    disabled={filteredOptions.length === 0}
                  >
                    {filteredOptions.every((option) => selectedOptionIds.has(option.id)) &&
                    filteredOptions.length > 0
                      ? "Deselect shown"
                      : "Select shown"}
                  </Button>
                  <span className="text-xs text-gray-500">
                    {selectedOptionIds.size} selected
                  </span>
                </div>

                <div className="grid max-h-64 gap-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
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
            </div>

            {selectedOptionIds.size > 0 ? (
              <div className="rounded-md border border-gray-200 bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      Narrow down each selection
                    </h3>
                    <p className="mt-0.5 text-sm text-gray-600">
                      Tick the categories to include. The run only scrapes what you select here.
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
                      >
                        Reload
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      className="rounded-md"
                      disabled={[...selectedOptionIds].every(
                        (parentId) => (brandCategories[parentId] ?? []).length === 0,
                      )}
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
                      Select all
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-md"
                      disabled={selectedSubcategoryIds.size === 0}
                      onClick={() => setSelectedSubcategoryIds(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 p-5">
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
                                ? "No nested categories · whole catalogue will be scraped"
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

                  {parentsNeedingCategoryChoice.length > 0 && selectedCategoryCount === 0 ? (
                    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      Select at least one category or subcategory above before starting the
                      scrape.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="rounded-md border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => setRunOptionsOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Run options</h3>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {maxProducts.trim()
                      ? `Up to ${maxProducts} products per selection`
                      : "All products in each selection"}
                    {alternatePhotoWebsite.trim() || alternatePhotoConfig?.websiteUrl
                      ? ` · official photos from ${
                          alternatePhotoName.trim() ||
                          alternatePhotoConfig?.sourceName ||
                          hostname(alternatePhotoWebsite)
                        }`
                      : " · no official photo source"}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-gray-500 transition-transform",
                    runOptionsOpen ? "rotate-180" : "",
                  )}
                />
              </button>
              {runOptionsOpen ? (
                <div className="space-y-5 border-t border-gray-200 px-5 py-4">
                  <div className="max-w-xs space-y-1.5">
                    <Label htmlFor="max-products">Max products per selection</Label>
                    <Input
                      id="max-products"
                      type="number"
                      min={1}
                      max={5000}
                      value={maxProducts}
                      onChange={(event) => setMaxProducts(event.target.value)}
                      placeholder="No limit"
                      className="rounded-md"
                    />
                    <p className="text-[11px] text-gray-500">
                      Leave blank to scrape every product in each selected category.
                    </p>
                  </div>

                  <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
                    <ImageIcon className="mt-0.5 h-5 w-5 text-gray-700" />
                    <div className="w-full space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          Official photo source
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          Optional. When set, YJ matches photos from the brand&apos;s official
                          website during the scrape — pricing, stock, and descriptions still come
                          from the supplier.
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
                          <Label htmlFor="alternate-photo-search">
                            Search URL template (optional)
                          </Label>
                          <Input
                            id="alternate-photo-search"
                            value={alternatePhotoSearchTemplate}
                            onChange={(event) =>
                              setAlternatePhotoSearchTemplate(event.target.value)
                            }
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
                          disabled={!alternatePhotoWebsite.trim() || isSavingAlternatePhoto}
                        >
                          {isSavingAlternatePhoto ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving…
                            </>
                          ) : (
                            "Save as default for this supplier"
                          )}
                        </Button>
                        {alternatePhotoSaveMessage ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-gray-700">
                            <CheckCircle2 className="h-4 w-4" />
                            {alternatePhotoSaveMessage}
                          </span>
                        ) : alternatePhotoConfig?.websiteUrl ? (
                          <span className="text-xs text-gray-500">
                            Saved default: {alternatePhotoConfig.sourceName} (
                            {hostname(alternatePhotoConfig.websiteUrl)})
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Sticky run bar */}
            <div className="sticky bottom-0 z-20 -mx-1 rounded-md border border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  {selectedOptionIds.size === 0 ? (
                    <>Choose at least one {browseMode} to continue.</>
                  ) : (
                    <>
                      <span className="font-medium text-gray-900">{selectedOptionIds.size}</span>{" "}
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
                          }`
                        : ""}{" "}
                      ready to scrape
                    </>
                  )}
                </p>
                <Button className="rounded-md" onClick={runScraper} disabled={!canRunScrape}>
                  <Play className="h-4 w-4" />
                  Start scrape
                </Button>
              </div>
            </div>
          </>
        ) : null}

        {/* ── Step 2: Scrape ─────────────────────────────────────────── */}
        {step === "scrape" ? (
          <>
            <div className="rounded-md border border-gray-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-gray-600" />
                <div className="w-full">
                  <p className="text-sm font-semibold text-gray-900">
                    {alternatePhotoProgress
                      ? "Matching official photos"
                      : "Scraping supplier catalogue"}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    {alternatePhotoProgress
                      ? `Matched ${alternatePhotoProgress.matched} of ${alternatePhotoProgress.total} products against the official website.`
                      : scrapeProgress
                        ? `Scraped ${scrapeProgress.scraped} of ${scrapeProgress.total} products. Each product page is opened for variants, stock, and photos.`
                        : "YJ is finding product pages, then it will open each one and collect variants, stock, and image URLs."}
                    {alternatePhotoWebsite.trim() && !alternatePhotoProgress
                      ? " Official photos are matched after the catalogue scrape."
                      : ""}
                  </p>
                  {scrapeProgress && scrapeProgress.total > 0 ? (
                    <Progress
                      value={
                        ((alternatePhotoProgress?.matched ?? scrapeProgress.scraped) /
                          (alternatePhotoProgress?.total ?? scrapeProgress.total)) *
                        100
                      }
                      className="mt-3 h-2"
                    />
                  ) : null}
                </div>
              </div>
            </div>

            {products.length > 0 ? (
              <div className="rounded-md border border-gray-200 bg-white">
                <div className="border-b border-gray-200 px-5 py-3">
                  <p className="text-sm font-semibold text-gray-900">
                    {products.length} product{products.length === 1 ? "" : "s"} scraped so far
                  </p>
                </div>
                <div className="divide-y divide-gray-100">
                  {products.slice(-6).map((product) => (
                    <div key={product.productId} className="flex items-center gap-3 px-5 py-2.5">
                      {product.heroImageUrl || product.imageUrls[0] ? (
                        <img
                          src={product.heroImageUrl ?? product.imageUrls[0]}
                          alt=""
                          loading="lazy"
                          className="h-9 w-9 shrink-0 rounded-md border border-gray-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed border-gray-200 text-gray-400">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-gray-900">{product.name}</p>
                        <p className="truncate text-xs text-gray-500">
                          {[
                            product.sku ? `SKU ${product.sku}` : null,
                            product.price != null ? `$${product.price}` : null,
                            `${product.imageUrls.length} photo${product.imageUrls.length === 1 ? "" : "s"}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <SupplierScraperLogPanel logs={activityLogs} title="YJ scrape log" />
          </>
        ) : null}

        {/* ── Step 3: Review ─────────────────────────────────────────── */}
        {step === "review" ? (
          products.length === 0 ? (
            <div className="rounded-md border border-gray-200 bg-white p-8 text-center">
              <p className="text-sm font-semibold text-gray-900">No products scraped</p>
              <p className="mt-1 text-sm text-gray-600">
                The last run returned no products. Adjust the selection and try again.
              </p>
              <Button
                variant="outline"
                className="mt-4 rounded-md"
                onClick={() => setView({ kind: "run", step: "select" })}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to selection
              </Button>
            </div>
          ) : (
            <>
              {readinessSummary ? (
                <div className="rounded-md border border-gray-200 bg-white px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        Review before import
                      </h3>
                      <p className="mt-0.5 text-sm text-gray-600">
                        Check field mapping, categories, and photos. &ldquo;Page-ready&rdquo;
                        means the product page will have a price, photos, a description, and a
                        brand.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600">
                      <span>
                        <span className="font-semibold text-gray-900">
                          {readinessSummary.ready}
                        </span>{" "}
                        of {selectedProducts.length} page-ready
                      </span>
                      {readinessSummary.missingPhotos > 0 ? (
                        <span>{readinessSummary.missingPhotos} without photos</span>
                      ) : null}
                      {readinessSummary.missingDescriptions > 0 ? (
                        <span>{readinessSummary.missingDescriptions} without descriptions</span>
                      ) : null}
                      {readinessSummary.missingBrand > 0 ? (
                        <span>{readinessSummary.missingBrand} without a brand</span>
                      ) : null}
                      {readinessSummary.missingPrice > 0 ? (
                        <span>{readinessSummary.missingPrice} without a price</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              <StoreFesportsScrapeReview
                key={activeScraper.id}
                products={products}
                selectedIds={selectedProductIds}
                onToggleProduct={toggleProduct}
                onToggleAll={toggleAllProducts}
                onCreateListings={importProducts}
                isCreating={phase === "importing" || phase === "fetching_photos"}
                sourceName={activeScraper.name}
                initialFieldMapping={activeScraper.fieldMapping}
                productMatches={matches}
                actionLabel="Import"
                enableCategoryAssignment
                showPhotoPreview={showPhotoPreview}
                supplierPhotoLabel={activeScraper.name}
                alternatePhotoSourceName={
                  alternatePhotoConfig?.sourceName || hostname(alternatePhotoWebsite)
                }
                imagePreferences={imagePreferences}
                onImagePreferenceChange={updateImagePreference}
                onApplyImagePreferenceToAll={applyImagePreferenceToAll}
                isFetchingAlternatePhotos={phase === "fetching_photos"}
                onRefreshAlternatePhotos={() => void fetchAlternatePhotos()}
                excludedImages={excludedImages}
                onRemoveImage={removeProductImage}
                onRestoreImage={restoreProductImage}
              />

              {phase === "fetching_photos" ? (
                <SupplierScraperLogPanel logs={activityLogs} title="Official photo match log" />
              ) : null}
            </>
          )
        ) : null}

        {/* ── Step 4: Done ───────────────────────────────────────────── */}
        {step === "done" && importSummary ? (
          <div className="mx-auto w-full max-w-2xl space-y-4 pt-6">
            <div className="rounded-md border border-gray-200 bg-white p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-gray-700" />
              <h3 className="mt-3 text-sm font-semibold text-gray-900">Import complete</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
                Products are now in your catalogue. Image files keep uploading in the
                background.
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Created", value: importSummary.created },
                  { label: "Updated", value: importSummary.updated },
                  { label: "Variant groups", value: importSummary.groupsCreated },
                  { label: "Images saved", value: importSummary.imagesSaved },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4"
                  >
                    <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{stat.label}</p>
                  </div>
                ))}
              </div>
              {importSummary.errors.length > 0 ? (
                <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 text-left text-xs text-gray-600">
                  <p className="mb-1 font-medium text-gray-800">
                    {importSummary.errors.length} item
                    {importSummary.errors.length === 1 ? "" : "s"} had problems:
                  </p>
                  {importSummary.errors.map((message) => (
                    <p key={message}>{message}</p>
                  ))}
                </div>
              ) : null}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Button asChild className="rounded-md">
                  <Link href="/products">
                    <ExternalLink className="h-4 w-4" />
                    View products
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="rounded-md"
                  onClick={() => setView({ kind: "run", step: "select" })}
                >
                  Run another scrape
                </Button>
                <Button variant="outline" className="rounded-md" onClick={goHome}>
                  All suppliers
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
