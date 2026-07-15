"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Loader2,
  Package,
  ScanSearch,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FEsportsBrand, FEsportsScrapedProduct } from "@/lib/scrapers/fesports-scraper";
import { FESPORTS_DEFAULT_START_URL } from "@/lib/scrapers/fesports-scraper";
import { StoreFesportsScrapeReview } from "@/components/settings/store-fesports-scrape-review";
import type { FieldMapping } from "@/lib/scrapers/fesports-field-mapping";
import { cn } from "@/lib/utils";

type ScrapePhase =
  | "idle"
  | "logging-in"
  | "discovering-brands"
  | "select-brands"
  | "scraping"
  | "review"
  | "creating"
  | "done"
  | "error";

type CookieParam = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
};

interface ScrapeProgress {
  brandsTotal: number;
  brandsDone: number;
  categoriesTotal: number;
  categoriesDone: number;
  productsFound: number;
  imagesFound: number;
  currentBrand: string | null;
  currentCategory: string | null;
}

type ScrapeLogLevel = "info" | "success" | "warn" | "error";

interface ScrapeLogEntry {
  id: string;
  at: string;
  level: ScrapeLogLevel;
  message: string;
}

const STEPS = [
  { id: 1, label: "Connect" },
  { id: 2, label: "Select brand" },
  { id: 3, label: "Scrape products" },
  { id: 4, label: "Import" },
] as const;

function emptyProgress(): ScrapeProgress {
  return {
    brandsTotal: 0,
    brandsDone: 0,
    categoriesTotal: 0,
    categoriesDone: 0,
    productsFound: 0,
    imagesFound: 0,
    currentBrand: null,
    currentCategory: null,
  };
}

function currentStep(phase: ScrapePhase): number {
  if (phase === "idle" || phase === "logging-in" || phase === "discovering-brands" || phase === "error") {
    return 1;
  }
  if (phase === "select-brands") return 2;
  if (phase === "scraping") return 3;
  return 4;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function shortCategoryLabel(url: string): string {
  try {
    const pathname = new URL(url).pathname.replace(/\/$/, "");
    const parts = pathname.split("/").filter(Boolean);
    return parts.slice(-2).join(" / ") || pathname;
  } catch {
    return url;
  }
}

function createLogId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureSession(
  email: string,
  password: string,
  cookies: CookieParam[] | null,
): Promise<{ sessionCookies: CookieParam[] | null; accountLabel: string | null }> {
  if (email && password) {
    const sessionRes = await fetch("/api/store/scrape/fesports/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const sessionData = await sessionRes.json();
    if (!sessionRes.ok) {
      throw new Error(sessionData.error ?? "Failed to log in to FEsports");
    }
    return {
      sessionCookies: sessionData.cookies ?? null,
      accountLabel: sessionData.accountLabel ?? null,
    };
  }

  return { sessionCookies: cookies, accountLabel: null };
}

export function StoreFesportsScrapeManager() {
  const router = useRouter();
  const productsSectionRef = React.useRef<HTMLDivElement>(null);
  const logEndRef = React.useRef<HTMLDivElement>(null);
  const [phase, setPhase] = React.useState<ScrapePhase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [startUrl, setStartUrl] = React.useState(FESPORTS_DEFAULT_START_URL);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [accountLabel, setAccountLabel] = React.useState<string | null>(null);
  const [cookies, setCookies] = React.useState<CookieParam[] | null>(null);
  const [progress, setProgress] = React.useState<ScrapeProgress>(emptyProgress);
  const [brands, setBrands] = React.useState<FEsportsBrand[]>([]);
  const [selectedBrandIds, setSelectedBrandIds] = React.useState<Set<string>>(new Set());
  const [products, setProducts] = React.useState<FEsportsScrapedProduct[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [createdCount, setCreatedCount] = React.useState(0);
  const [skippedDuplicates, setSkippedDuplicates] = React.useState(0);
  const [categoriesScanned, setCategoriesScanned] = React.useState(0);
  const [maxProducts, setMaxProducts] = React.useState("");
  const [logs, setLogs] = React.useState<ScrapeLogEntry[]>([]);
  const [busyStartedAt, setBusyStartedAt] = React.useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  const appendLog = React.useCallback((message: string, level: ScrapeLogLevel = "info") => {
    const entry: ScrapeLogEntry = {
      id: createLogId(),
      at: new Date().toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      level,
      message,
    };
    setLogs((current) => [...current, entry]);
  }, []);

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  React.useEffect(() => {
    if (!busyStartedAt) {
      setElapsedSeconds(0);
      return;
    }
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - busyStartedAt) / 1000));
    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalId);
  }, [busyStartedAt]);

  const parsedMaxProducts = React.useMemo(() => {
    const value = Number(maxProducts);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
  }, [maxProducts]);

  const isBusy = ["logging-in", "discovering-brands", "scraping", "creating"].includes(phase);
  const isCreating = phase === "creating";
  const selectedBrands = brands.filter((brand) => selectedBrandIds.has(brand.id));
  const selectedProducts = products.filter((product) => selectedIds.has(product.productId));
  const activeStep = currentStep(phase);

  const toggleBrand = (brandId: string) => {
    setSelectedBrandIds(new Set([brandId]));
  };

  const toggleProduct = (productId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleAllProducts = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(products.map((product) => product.productId)));
  };

  const loadBrands = async () => {
    setError(null);
    setBrands([]);
    setSelectedBrandIds(new Set());
    setProducts([]);
    setSelectedIds(new Set());
    setCreatedCount(0);
    setSkippedDuplicates(0);
    setCategoriesScanned(0);
    setProgress(emptyProgress());
    setLogs([]);
    setBusyStartedAt(Date.now());

    try {
      if (email && password) {
        setPhase("logging-in");
        appendLog("Logging in to FEsports…");
      } else {
        appendLog("Using existing session cookies (no login requested).", "warn");
      }
      const { sessionCookies, accountLabel: label } = await ensureSession(email, password, cookies);
      setCookies(sessionCookies);
      setAccountLabel(label);
      if (label) appendLog(`Logged in as ${label}.`, "success");

      setPhase("discovering-brands");
      appendLog(`Loading brands from ${startUrl}…`);
      const brandsStartedAt = Date.now();
      const brandsRes = await fetch("/api/store/scrape/fesports/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrl,
          cookies: sessionCookies,
        }),
      });
      const brandsData = await brandsRes.json();
      if (!brandsRes.ok) {
        throw new Error(brandsData.error ?? "Failed to load FEsports brands");
      }

      const discoveredBrands: FEsportsBrand[] = brandsData.brands ?? [];
      appendLog(
        `Found ${discoveredBrands.length} brands in ${formatDuration(brandsData.durationMs ?? Date.now() - brandsStartedAt)}.`,
        "success",
      );
      setBrands(discoveredBrands);
      if (discoveredBrands.length === 0) {
        setPhase("error");
        setError("No brands were found on the FEsports catalogue page. Check your catalogue URL.");
        appendLog("No brands found on catalogue page.", "error");
        return;
      }

      setPhase("select-brands");
      setBusyStartedAt(null);
    } catch (loadError) {
      setPhase("error");
      setBusyStartedAt(null);
      const message = loadError instanceof Error ? loadError.message : "Failed to load brands";
      setError(message);
      appendLog(message, "error");
    }
  };

  const scrapeSelectedBrands = async () => {
    if (!selectedBrands.length) return;

    setError(null);
    setProducts([]);
    setSelectedIds(new Set());
    setCreatedCount(0);
    setSkippedDuplicates(0);
    setCategoriesScanned(0);
    setProgress({
      ...emptyProgress(),
      brandsTotal: selectedBrands.length,
    });
    setPhase("scraping");
    setBusyStartedAt(Date.now());
    appendLog(
      `Starting scrape for ${selectedBrands.map((brand) => brand.name).join(", ")}${
        parsedMaxProducts ? ` (max ${parsedMaxProducts} products)` : ""
      }.`,
    );
    appendLog(
      "Each step launches a browser session on the server — category discovery and product detail pages can take several minutes.",
      "warn",
    );

    const sessionCookies = cookies;

    try {
      const merged = new Map<string, FEsportsScrapedProduct>();
      let categoriesScannedCount = 0;

      for (let brandIndex = 0; brandIndex < selectedBrands.length; brandIndex++) {
        if (parsedMaxProducts && merged.size >= parsedMaxProducts) break;

        const brand = selectedBrands[brandIndex];
        setProgress((current) => ({
          ...current,
          brandsDone: brandIndex,
          currentBrand: brand.name,
          currentCategory: null,
        }));

        appendLog(`Discovering product categories for ${brand.name}…`);
        const discoverStartedAt = Date.now();
        const categoryLimit = parsedMaxProducts
          ? Math.min(parsedMaxProducts, 10)
          : null;
        const discoverRes = await fetch("/api/store/scrape/fesports/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startUrl: brand.url,
            cookies: sessionCookies,
            maxCategories: categoryLimit,
          }),
        });
        const discoverData = await discoverRes.json();
        if (!discoverRes.ok) {
          throw new Error(discoverData.error ?? `Failed to discover categories for ${brand.name}`);
        }

        const categories: string[] = discoverData.categories ?? [];
        appendLog(
          `${brand.name}: browsed ${discoverData.pagesVisited ?? "?"} catalogue pages, found ${categories.length} product categories in ${formatDuration(discoverData.durationMs ?? Date.now() - discoverStartedAt)}.`,
          categories.length > 0 ? "success" : "warn",
        );
        setProgress((current) => ({
          ...current,
          categoriesTotal: current.categoriesTotal + categories.length,
        }));

        for (let index = 0; index < categories.length; index++) {
          if (parsedMaxProducts && merged.size >= parsedMaxProducts) {
            appendLog(`Reached product limit (${parsedMaxProducts}). Stopping early.`, "success");
            break;
          }

          const categoryUrl = categories[index];
          const categoryLabel = shortCategoryLabel(categoryUrl);
          categoriesScannedCount += 1;
          setProgress((current) => ({
            ...current,
            categoriesDone: current.categoriesDone + 1,
            currentCategory: categoryUrl,
          }));

          appendLog(
            `Category ${index + 1}/${categories.length}: ${categoryLabel} — scraping listings and product details…`,
          );
          const categoryStartedAt = Date.now();
          const remainingProducts = parsedMaxProducts
            ? parsedMaxProducts - merged.size
            : null;
          const categoryRes = await fetch("/api/store/scrape/fesports/category", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              categoryUrl,
              cookies: sessionCookies,
              downloadImages: true,
              maxProducts: remainingProducts,
            }),
          });
          const categoryData = await categoryRes.json();
          if (!categoryRes.ok) {
            throw new Error(categoryData.error ?? `Failed to scrape ${categoryUrl}`);
          }

          const categoryProducts = (categoryData.products ?? []) as FEsportsScrapedProduct[];
          const newProductCount = categoryProducts.length;
          const imageCount = categoryProducts.reduce((sum, product) => sum + product.imageUrls.length, 0);
          const duration = formatDuration(categoryData.durationMs ?? Date.now() - categoryStartedAt);

          if (newProductCount > 0) {
            const preview = categoryProducts
              .slice(0, 3)
              .map((product) => product.name)
              .join(", ");
            appendLog(
              `Category ${index + 1}/${categories.length}: ${newProductCount} product${newProductCount === 1 ? "" : "s"}, ${imageCount} image${imageCount === 1 ? "" : "s"} in ${duration}. ${preview}${newProductCount > 3 ? "…" : ""}`,
              "success",
            );
          } else {
            appendLog(
              `Category ${index + 1}/${categories.length}: no products found (${duration}).`,
              "warn",
            );
          }

          for (const product of categoryProducts) {
            if (parsedMaxProducts && merged.size >= parsedMaxProducts) break;
            merged.set(product.productId, { ...product, brand: brand.name });
          }

          const mergedProducts = [...merged.values()].slice(0, parsedMaxProducts ?? undefined);
          setProducts(mergedProducts);
          setSelectedIds(new Set(mergedProducts.map((product) => product.productId)));
          setProgress((current) => ({
            ...current,
            productsFound: mergedProducts.length,
            imagesFound: mergedProducts.reduce((sum, product) => sum + product.imageUrls.length, 0),
          }));
        }

        setProgress((current) => ({
          ...current,
          brandsDone: brandIndex + 1,
        }));
      }

      setCategoriesScanned(categoriesScannedCount);
      const finalProductCount = merged.size;
      setPhase("review");
      setBusyStartedAt(null);
      appendLog(
        `Scrape finished: ${finalProductCount} product${finalProductCount === 1 ? "" : "s"} from ${categoriesScannedCount} categor${categoriesScannedCount === 1 ? "y" : "ies"}.`,
        finalProductCount > 0 ? "success" : "warn",
      );
      window.setTimeout(() => {
        productsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (scrapeError) {
      setPhase("error");
      setBusyStartedAt(null);
      const message = scrapeError instanceof Error ? scrapeError.message : "Scrape failed";
      setError(message);
      appendLog(message, "error");
    }
  };

  const createListings = async (fieldMapping: FieldMapping) => {
    if (!selectedProducts.length) return;
    setPhase("creating");
    setError(null);
    setBusyStartedAt(Date.now());
    appendLog(`Creating ${selectedProducts.length} listing${selectedProducts.length === 1 ? "" : "s"}…`);

    try {
      const response = await fetch("/api/store/scrape/fesports/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: selectedProducts,
          fieldMapping,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create listings");
      }

      setCreatedCount(data.created ?? 0);
      setSkippedDuplicates(data.skippedDuplicates ?? 0);
      setPhase("done");
      setBusyStartedAt(null);
      appendLog(
        `Created ${data.created ?? 0} listing${data.created === 1 ? "" : "s"}${
          data.skippedDuplicates ? `, skipped ${data.skippedDuplicates} duplicate${data.skippedDuplicates === 1 ? "" : "s"}` : ""
        }. Images uploading to Cloudinary in background.`,
        "success",
      );
      window.setTimeout(() => {
        productsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (createError) {
      setPhase("error");
      setBusyStartedAt(null);
      const message = createError instanceof Error ? createError.message : "Failed to create listings";
      setError(message);
      appendLog(message, "error");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-6 p-6">
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {STEPS.map((step) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                  activeStep === step.id
                    ? "bg-white text-gray-800 shadow-sm"
                    : activeStep > step.id
                      ? "text-gray-700"
                      : "text-gray-500",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md text-[11px]",
                    activeStep >= step.id ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-600",
                  )}
                >
                  {step.id}
                </span>
                {step.label}
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3">
            <div className="rounded-md bg-gray-100 p-2">
              <Globe className="h-5 w-5 text-gray-700" />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">FE Sports catalogue</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Load brands from FEsports, choose which brand to import, scrape up to your product
                  limit, then create store listings in{" "}
                  <button
                    type="button"
                    className="text-gray-900 underline underline-offset-2 hover:text-gray-700"
                    onClick={() => router.push("/products")}
                  >
                    Products
                  </button>
                  .
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fesports-start-url">Catalogue URL</Label>
                  <Input
                    id="fesports-start-url"
                    value={startUrl}
                    onChange={(event) => setStartUrl(event.target.value)}
                    placeholder={FESPORTS_DEFAULT_START_URL}
                    className="rounded-md"
                    disabled={phase === "select-brands" || phase === "scraping" || phase === "review"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fesports-max-products">Max products</Label>
                  <Input
                    id="fesports-max-products"
                    type="number"
                    min={1}
                    value={maxProducts}
                    onChange={(event) => setMaxProducts(event.target.value)}
                    placeholder="e.g. 10 for testing"
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fesports-email">FEsports email</Label>
                  <Input
                    id="fesports-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@store.com"
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fesports-password">FEsports password</Label>
                  <Input
                    id="fesports-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Required for SOH visibility"
                    className="rounded-md"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {(phase === "idle" || phase === "error" || phase === "done") && (
                  <Button
                    className="rounded-md"
                    onClick={loadBrands}
                    disabled={isBusy || !startUrl.trim()}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading brands…
                      </>
                    ) : (
                      <>
                        <ScanSearch className="h-4 w-4" />
                        Load brands
                      </>
                    )}
                  </Button>
                )}
                {accountLabel ? (
                  <span className="text-sm text-gray-600">Logged in as {accountLabel}</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {isBusy ? (
          <div className="rounded-md border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-gray-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {phase === "logging-in"
                    ? "Logging in to FEsports…"
                    : phase === "discovering-brands"
                      ? "Loading brands from FEsports…"
                      : phase === "scraping"
                        ? "Scraping products and downloading images…"
                        : "Creating listings…"}
                </p>
                <p className="text-sm text-gray-600">
                  {phase === "discovering-brands"
                    ? "Step 1 of 3 — fetching brand list"
                    : progress.brandsTotal > 0 || progress.categoriesTotal > 0
                      ? `${progress.brandsDone}/${progress.brandsTotal} brands · ${progress.categoriesDone}/${progress.categoriesTotal} categories · ${progress.productsFound} products · ${progress.imagesFound} images${
                          parsedMaxProducts ? ` · limit ${parsedMaxProducts}` : ""
                        }`
                      : "Initialising scrape"}
                </p>
                {progress.currentBrand ? (
                  <p className="mt-1 text-xs text-gray-500">Brand: {progress.currentBrand}</p>
                ) : null}
                {progress.currentCategory ? (
                  <p className="mt-1 truncate text-xs text-gray-500">{progress.currentCategory}</p>
                ) : null}
                {busyStartedAt ? (
                  <p className="mt-1 text-xs text-gray-500">Elapsed: {formatElapsed(elapsedSeconds)}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {logs.length > 0 ? (
          <div className="rounded-md border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Activity log</h3>
                <p className="text-xs text-gray-500">
                  Live scrape progress — also written to your dev server terminal as{" "}
                  <span className="font-mono">[FEsports Scrape]</span>
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-md"
                onClick={() => setLogs([])}
                disabled={isBusy}
              >
                Clear
              </Button>
            </div>
            <div className="max-h-72 overflow-y-auto px-5 py-3 font-mono text-xs leading-5">
              {logs.map((entry) => (
                <div
                  key={entry.id}
                  className={cn(
                    "whitespace-pre-wrap break-words py-0.5",
                    entry.level === "success" && "text-gray-800",
                    entry.level === "info" && "text-gray-600",
                    entry.level === "warn" && "text-amber-800",
                    entry.level === "error" && "text-red-700",
                  )}
                >
                  <span className="text-gray-400">[{entry.at}]</span> {entry.message}
                </div>
              ))}
              <div ref={logEndRef} />
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

        {phase === "select-brands" && brands.length > 0 ? (
          <div className="rounded-md border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Step 2 — Select a brand</h3>
                <p className="text-sm text-gray-600">
                  {brands.length} brands available
                  {selectedBrands[0] ? ` · ${selectedBrands[0].name} selected` : " · none selected"}
                </p>
              </div>
              <Button
                className="rounded-md"
                onClick={scrapeSelectedBrands}
                disabled={!selectedBrands.length || isBusy}
              >
                <ScanSearch className="h-4 w-4" />
                Scrape {parsedMaxProducts ?? "all"} product{parsedMaxProducts === 1 ? "" : "s"}
                {selectedBrands.length === 1 ? ` from ${selectedBrands[0].name}` : ""}
              </Button>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {brands.map((brand) => {
                const isSelected = selectedBrandIds.has(brand.id);
                return (
                  <label
                    key={brand.id}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-md border p-3 transition-colors",
                      isSelected
                        ? "border-gray-300 bg-gray-50"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50/70",
                    )}
                  >
                    <input
                      type="radio"
                      name="fesports-brand"
                      checked={isSelected}
                      onChange={() => toggleBrand(brand.id)}
                      className="shrink-0"
                    />
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
                      {brand.imageUrl ? (
                        <Image
                          src={brand.imageUrl}
                          alt={brand.name}
                          width={40}
                          height={40}
                          className="h-full w-full object-contain p-1"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-gray-400">
                          Brand
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{brand.name}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {phase === "review" && products.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-gray-700" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900">Scrape finished with no products</p>
                <p className="text-sm text-gray-600">
                  Scanned {categoriesScanned} categor{categoriesScanned === 1 ? "y" : "ies"} across{" "}
                  {selectedBrands.map((brand) => brand.name).join(", ")} but found 0 products. Try a
                  different brand or check your login credentials.
                </p>
                <Button className="rounded-md" variant="outline" onClick={() => setPhase("select-brands")}>
                  Choose another brand
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {phase === "review" && products.length > 0 ? (
          <div ref={productsSectionRef}>
            <div className="mb-4 rounded-md border border-gray-200 bg-white p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-gray-700" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">Step 4 — Map fields and review data</p>
                  <p className="text-sm text-gray-600">
                    Found {products.length} product{products.length === 1 ? "" : "s"} from{" "}
                    {selectedBrands.map((brand) => brand.name).join(", ")}. Map scraped fields to your
                    Yellow Jersey product fields, review the full data table, then create listings.
                  </p>
                </div>
              </div>
            </div>
            <StoreFesportsScrapeReview
              products={products}
              selectedIds={selectedIds}
              onToggleProduct={toggleProduct}
              onToggleAll={toggleAllProducts}
              onCreateListings={createListings}
              isCreating={isCreating}
            />
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="rounded-md border border-gray-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-gray-700" />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Listings created successfully</p>
                  <p className="text-sm text-gray-600">
                    {createdCount > 0
                      ? `Added ${createdCount} product${createdCount === 1 ? "" : "s"} to your store catalogue`
                      : "No new products were added"}
                    {skippedDuplicates > 0
                      ? ` · Skipped ${skippedDuplicates} duplicate${skippedDuplicates === 1 ? "" : "s"}`
                      : ""}
                    . Images are uploading to Cloudinary in the background.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="rounded-md" onClick={() => router.push("/products")}>
                    <Package className="h-4 w-4" />
                    View product catalogue
                  </Button>
                  <Button className="rounded-md" variant="outline" onClick={() => setPhase("select-brands")}>
                    Scrape another brand
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
