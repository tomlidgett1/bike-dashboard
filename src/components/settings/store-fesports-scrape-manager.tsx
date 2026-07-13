"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  Package,
  ScanSearch,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FEsportsScrapedProduct } from "@/lib/scrapers/fesports-scraper";
import { FESPORTS_DEFAULT_START_URL } from "@/lib/scrapers/fesports-scraper";

type ScrapePhase = "idle" | "logging-in" | "discovering" | "scraping" | "review" | "creating" | "done" | "error";

type CookieParam = {
  name: string;
  value: string;
  domain?: string;
  path?: string;
};

interface ScrapeProgress {
  categoriesTotal: number;
  categoriesDone: number;
  productsFound: number;
  imagesFound: number;
  currentCategory: string | null;
}

function emptyProgress(): ScrapeProgress {
  return {
    categoriesTotal: 0,
    categoriesDone: 0,
    productsFound: 0,
    imagesFound: 0,
    currentCategory: null,
  };
}

export function StoreFesportsScrapeManager() {
  const router = useRouter();
  const [phase, setPhase] = React.useState<ScrapePhase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [startUrl, setStartUrl] = React.useState(FESPORTS_DEFAULT_START_URL);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [accountLabel, setAccountLabel] = React.useState<string | null>(null);
  const [cookies, setCookies] = React.useState<CookieParam[] | null>(null);
  const [progress, setProgress] = React.useState<ScrapeProgress>(emptyProgress);
  const [products, setProducts] = React.useState<FEsportsScrapedProduct[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [createdCount, setCreatedCount] = React.useState(0);
  const [skippedDuplicates, setSkippedDuplicates] = React.useState(0);

  const isBusy = ["logging-in", "discovering", "scraping", "creating"].includes(phase);
  const selectedProducts = products.filter((product) => selectedIds.has(product.productId));

  const toggleProduct = (productId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(products.map((product) => product.productId)));
  };

  const runScrape = async () => {
    setError(null);
    setCreatedCount(0);
    setSkippedDuplicates(0);
    setProducts([]);
    setSelectedIds(new Set());
    setProgress(emptyProgress());

    let sessionCookies = cookies;

    try {
      if (email && password) {
        setPhase("logging-in");
        const sessionRes = await fetch("/api/store/scrape/fesports/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const sessionData = await sessionRes.json();
        if (!sessionRes.ok) {
          throw new Error(sessionData.error ?? "Failed to log in to FEsports");
        }
        sessionCookies = sessionData.cookies ?? null;
        setCookies(sessionCookies);
        setAccountLabel(sessionData.accountLabel ?? null);
      } else {
        setCookies(null);
        setAccountLabel(null);
      }

      setPhase("discovering");
      const discoverRes = await fetch("/api/store/scrape/fesports/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startUrl,
          cookies: sessionCookies,
        }),
      });
      const discoverData = await discoverRes.json();
      if (!discoverRes.ok) {
        throw new Error(discoverData.error ?? "Failed to discover categories");
      }

      const categories: string[] = discoverData.categories ?? [];
      setProgress((current) => ({ ...current, categoriesTotal: categories.length }));
      setPhase("scraping");

      const merged = new Map<string, FEsportsScrapedProduct>();

      for (let index = 0; index < categories.length; index++) {
        const categoryUrl = categories[index];
        setProgress((current) => ({
          ...current,
          categoriesDone: index,
          currentCategory: categoryUrl,
        }));

        const categoryRes = await fetch("/api/store/scrape/fesports/category", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            categoryUrl,
            cookies: sessionCookies,
            downloadImages: true,
          }),
        });
        const categoryData = await categoryRes.json();
        if (!categoryRes.ok) {
          throw new Error(categoryData.error ?? `Failed to scrape ${categoryUrl}`);
        }

        for (const product of (categoryData.products ?? []) as FEsportsScrapedProduct[]) {
          merged.set(product.productId, product);
        }

        const mergedProducts = [...merged.values()];
        setProducts(mergedProducts);
        setSelectedIds(new Set(mergedProducts.map((product) => product.productId)));
        setProgress((current) => ({
          ...current,
          categoriesDone: index + 1,
          productsFound: mergedProducts.length,
          imagesFound: mergedProducts.reduce((sum, product) => sum + product.imageUrls.length, 0),
          currentCategory: categoryUrl,
        }));
      }

      setPhase("review");
    } catch (scrapeError) {
      setPhase("error");
      setError(scrapeError instanceof Error ? scrapeError.message : "Scrape failed");
    }
  };

  const createListings = async () => {
    if (!selectedProducts.length) return;
    setPhase("creating");
    setError(null);

    try {
      const response = await fetch("/api/store/scrape/fesports/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: selectedProducts }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create listings");
      }

      setCreatedCount(data.created ?? 0);
      setSkippedDuplicates(data.skippedDuplicates ?? 0);
      setPhase("done");
    } catch (createError) {
      setPhase("error");
      setError(createError instanceof Error ? createError.message : "Failed to create listings");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-6 p-6">
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-gray-100 p-2">
              <Globe className="h-5 w-5 text-gray-700" />
            </div>
            <div className="min-w-0 flex-1 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">FE Sports catalogue</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Scan the FEsports B2B catalogue, download product images, and create store listings
                  automatically.
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
                <div className="space-y-2 md:col-span-2">
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
                <Button
                  className="rounded-md"
                  onClick={runScrape}
                  disabled={isBusy || !startUrl.trim()}
                >
                  {isBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Scanning…
                    </>
                  ) : (
                    <>
                      <ScanSearch className="h-4 w-4" />
                      Scan catalogue
                    </>
                  )}
                </Button>
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
                    : phase === "discovering"
                      ? "Discovering categories…"
                      : phase === "scraping"
                        ? "Scraping products and downloading images…"
                        : "Creating listings…"}
                </p>
                <p className="text-sm text-gray-600">
                  {progress.categoriesTotal > 0
                    ? `${progress.categoriesDone}/${progress.categoriesTotal} categories · ${progress.productsFound} products · ${progress.imagesFound} images`
                    : "Initialising scrape"}
                </p>
                {progress.currentCategory ? (
                  <p className="mt-1 truncate text-xs text-gray-500">{progress.currentCategory}</p>
                ) : null}
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

        {phase === "done" ? (
          <div className="rounded-md border border-gray-200 bg-white p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-gray-700" />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Listings created</p>
                  <p className="text-sm text-gray-600">
                    Created {createdCount} product{createdCount === 1 ? "" : "s"}
                    {skippedDuplicates > 0 ? ` · Skipped ${skippedDuplicates} duplicates` : ""}.
                    Images are uploading to Cloudinary in the background.
                  </p>
                </div>
                <Button className="rounded-md" variant="outline" onClick={() => router.push("/products")}>
                  <Package className="h-4 w-4" />
                  View product catalogue
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {products.length > 0 ? (
          <div className="rounded-md border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Scraped products</h3>
                <p className="text-sm text-gray-600">
                  {products.length} products found · {selectedProducts.length} selected
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="rounded-md" onClick={toggleAll}>
                  {selectedIds.size === products.length ? "Deselect all" : "Select all"}
                </Button>
                <Button
                  className="rounded-md"
                  onClick={createListings}
                  disabled={!selectedProducts.length || isBusy}
                >
                  <Download className="h-4 w-4" />
                  Create {selectedProducts.length} listing{selectedProducts.length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {products.map((product) => {
                const isSelected = selectedIds.has(product.productId);
                const primaryImage = product.imageUrls[0] ?? null;
                return (
                  <label
                    key={product.productId}
                    className={cn(
                      "flex cursor-pointer gap-4 px-5 py-4 transition-colors",
                      isSelected ? "bg-gray-50" : "hover:bg-gray-50/70",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleProduct(product.productId)}
                      className="mt-1"
                    />
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                      {primaryImage ? (
                        <Image
                          src={primaryImage}
                          alt={product.name}
                          width={64}
                          height={64}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-400">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{product.name}</p>
                          <p className="text-xs text-gray-500">
                            {[product.brand, product.sku].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="text-right text-sm text-gray-700">
                          {product.price != null ? `$${product.price.toFixed(2)}` : "—"}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        <span>SOH: {product.soh ?? "—"}</span>
                        <span>{product.imageUrls.length} images</span>
                        {product.variants.length > 0 ? (
                          <span>{product.variants.length} variants</span>
                        ) : null}
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900"
                          onClick={(event) => event.stopPropagation()}
                        >
                          View on FEsports
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
