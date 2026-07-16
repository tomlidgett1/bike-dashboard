"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Bike,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  ImageIcon,
  Loader2,
  Sparkles,
  X,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BikeUrlDraft, BikeUrlImportResult } from "@/lib/scrapers/bike-url-types";
import {
  consumeSupplierSse,
  type SupplierLogEntry,
} from "@/lib/scrapers/supplier-logger";
import { MARKETPLACE_SUBCATEGORIES } from "@/lib/types/marketplace";
import { cn } from "@/lib/utils";

type Stage = "input" | "extracting" | "review" | "importing" | "done";

interface EditableSize {
  name: string;
  sku: string | null;
  qoh: string;
  included: boolean;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function LogPanel({ logs }: { logs: SupplierLogEntry[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [logs]);

  if (logs.length === 0) return null;
  return (
    <div
      ref={containerRef}
      className="max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] leading-5 text-gray-700"
    >
      {logs.map((entry) => (
        <div key={entry.id} className="border-b border-gray-200/80 py-1.5 last:border-b-0">
          <span className="text-gray-400">+{formatElapsed(entry.elapsedMs)}</span>{" "}
          <span className="font-semibold text-gray-800">{entry.step}</span>{" "}
          <span>{entry.message}</span>
        </div>
      ))}
    </div>
  );
}

export function StoreBikeUrlImport() {
  const [stage, setStage] = React.useState<Stage>("input");
  const [error, setError] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<SupplierLogEntry[]>([]);
  const [url, setUrl] = React.useState("");

  const [draft, setDraft] = React.useState<BikeUrlDraft | null>(null);
  const [name, setName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [subcategory, setSubcategory] = React.useState("Other");
  const [price, setPrice] = React.useState("");
  const [sizes, setSizes] = React.useState<EditableSize[]>([]);
  const [images, setImages] = React.useState<string[]>([]);
  const [heroImage, setHeroImage] = React.useState<string | null>(null);
  const [removedImages, setRemovedImages] = React.useState<string[]>([]);
  const [specsOpen, setSpecsOpen] = React.useState(false);
  const [importResult, setImportResult] = React.useState<BikeUrlImportResult | null>(null);

  const appendLog = React.useCallback((entry: SupplierLogEntry) => {
    setLogs((current) => [...current, entry]);
  }, []);

  const includedSizes = sizes.filter((size) => size.included);
  const priceNumber = Number(price);
  const canImport =
    images.length > 0 && Number.isFinite(priceNumber) && priceNumber > 0 && name.trim();

  const fetchBike = async () => {
    if (!url.trim()) return;
    setStage("extracting");
    setError(null);
    setLogs([]);

    try {
      const response = await fetch("/api/store/scrape/bike-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ url }),
      });
      const payload = await consumeSupplierSse<{ event: "result"; draft: BikeUrlDraft }>(
        response,
        appendLog,
      );
      const nextDraft = payload.draft;
      setDraft(nextDraft);
      setName(nextDraft.name);
      setBrand(nextDraft.brand ?? "");
      setDescription(nextDraft.description);
      setSubcategory(nextDraft.subcategory);
      setPrice(
        nextDraft.currency === "AUD" && nextDraft.price ? String(nextDraft.price) : "",
      );
      setSizes(
        nextDraft.sizes.map((size) => ({
          name: size.name,
          sku: size.sku,
          qoh: "1",
          included: true,
        })),
      );
      setImages(nextDraft.imageUrls);
      setHeroImage(nextDraft.heroImageUrl ?? nextDraft.imageUrls[0] ?? null);
      setRemovedImages([]);
      setImportResult(null);
      setStage("review");
    } catch (fetchError) {
      setStage("input");
      setError(
        fetchError instanceof Error ? fetchError.message : "YJ could not read this bike page.",
      );
    }
  };

  const removeImage = (imageUrl: string) => {
    setImages((current) => current.filter((candidate) => candidate !== imageUrl));
    setRemovedImages((current) => [...current, imageUrl]);
    setHeroImage((current) => {
      if (current !== imageUrl) return current;
      const remaining = images.filter((candidate) => candidate !== imageUrl);
      return remaining[0] ?? null;
    });
  };

  const restoreImage = (imageUrl: string) => {
    setRemovedImages((current) => current.filter((candidate) => candidate !== imageUrl));
    setImages((current) => [...current, imageUrl]);
  };

  const updateSize = (index: number, updates: Partial<EditableSize>) => {
    setSizes((current) =>
      current.map((size, candidate) =>
        candidate === index ? { ...size, ...updates } : size,
      ),
    );
  };

  const importBike = async () => {
    if (!draft || !canImport) return;
    setStage("importing");
    setError(null);

    const orderedImages = heroImage
      ? [heroImage, ...images.filter((candidate) => candidate !== heroImage)]
      : images;

    try {
      const response = await fetch("/api/store/scrape/bike-url/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft: { ...draft, name: name.trim(), brand: brand.trim() || null, description },
          price: priceNumber,
          sizes: includedSizes.map((size) => ({
            name: size.name,
            sku: size.sku,
            qoh: Math.max(0, Math.floor(Number(size.qoh) || 0)),
          })),
          imageUrls: orderedImages,
          heroImageUrl: heroImage,
          subcategory,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not import this bike.");
      }
      setImportResult(payload as BikeUrlImportResult);
      setStage("done");
    } catch (importError) {
      setStage("review");
      setError(
        importError instanceof Error ? importError.message : "Could not import this bike.",
      );
    }
  };

  const startOver = () => {
    setStage("input");
    setUrl("");
    setDraft(null);
    setError(null);
    setLogs([]);
    setImportResult(null);
  };

  /* ── Input / extracting ──────────────────────────────────────────── */

  if (stage === "input" || stage === "extracting") {
    return (
      <div className="space-y-6 p-6">
        <div className="mx-auto w-full max-w-2xl space-y-4 pt-6">
          <div className="rounded-md border border-gray-200 bg-white p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-gray-100 p-2">
                <Bike className="h-5 w-5 text-gray-700" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Build a bike page from the official product URL
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Paste a bike&apos;s page from the manufacturer&apos;s website. YJ reads the
                  whole page — every photo, the full spec sheet, all frame sizes — and builds a
                  polished Yellow Jersey product page you review before it goes live.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <Label htmlFor="bike-url">Official bike page URL</Label>
              <Input
                id="bike-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && stage === "input") void fetchBike();
                }}
                placeholder="https://www.focus-bikes.com/int/atlas-6-8-eqp"
                className="rounded-md"
                disabled={stage === "extracting"}
              />
              <p className="text-xs text-gray-500">
                Works with any brand site — Focus, Trek, Specialized, Giant, Merida…
              </p>
            </div>

            <div className="mt-4">
              <Button
                className="rounded-md"
                onClick={fetchBike}
                disabled={stage === "extracting" || !url.trim()}
              >
                {stage === "extracting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Reading the bike page…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Fetch this bike
                  </>
                )}
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-white p-4 text-sm text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          {stage === "extracting" ? <LogPanel logs={logs} /> : null}
        </div>
      </div>
    );
  }

  /* ── Done ────────────────────────────────────────────────────────── */

  if (stage === "done" && importResult) {
    return (
      <div className="p-6">
        <div className="mx-auto w-full max-w-2xl space-y-4 pt-6">
          <div className="rounded-md border border-gray-200 bg-white p-6 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-gray-700" />
            <h3 className="mt-3 text-sm font-semibold text-gray-900">
              {name || draft?.name} is in your catalogue
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-gray-600">
              {importResult.created} size{importResult.created === 1 ? "" : "s"} created
              {importResult.groupCreated ? " with a size picker" : ""} ·{" "}
              {importResult.imagesSaved} photos saved. Images keep uploading in the
              background.
            </p>
            {importResult.errors.length > 0 ? (
              <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 text-left text-xs text-gray-600">
                {importResult.errors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {importResult.masterProductId ? (
                <Button asChild className="rounded-md">
                  <Link
                    href={`/marketplace/product/${importResult.masterProductId}`}
                    target="_blank"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View the product page
                  </Link>
                </Button>
              ) : null}
              <Button variant="outline" className="rounded-md" onClick={startOver}>
                Import another bike
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Review ──────────────────────────────────────────────────────── */

  if (!draft) return null;

  return (
    <div className="space-y-4 p-6">
      <button
        type="button"
        onClick={startOver}
        disabled={stage === "importing"}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Different bike
      </button>

      {error ? (
        <div className="rounded-md border border-red-200 bg-white p-4 text-sm text-red-700">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Gallery */}
        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900">Photos</h3>
          <p className="mt-0.5 text-sm text-gray-600">
            {images.length} photo{images.length === 1 ? "" : "s"} from the official page. Click
            a photo to make it the hero shot.
          </p>

          {heroImage ? (
            <div className="mt-4 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
              <img
                src={heroImage}
                alt="Hero shot"
                className="mx-auto max-h-72 w-full object-contain"
              />
            </div>
          ) : (
            <div className="mt-4 flex h-40 items-center justify-center rounded-md border border-dashed border-gray-200 text-sm text-gray-500">
              <ImageIcon className="mr-2 h-4 w-4" />
              No photos kept
            </div>
          )}

          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {images.map((imageUrl) => (
              <div
                key={imageUrl}
                className={cn(
                  "group relative overflow-hidden rounded-md border bg-white",
                  imageUrl === heroImage ? "border-gray-800" : "border-gray-200",
                )}
              >
                <button
                  type="button"
                  onClick={() => setHeroImage(imageUrl)}
                  className="block h-16 w-full"
                >
                  <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(imageUrl)}
                  aria-label="Remove photo"
                  className="absolute right-0.5 top-0.5 rounded-md border border-gray-200 bg-white p-0.5 text-gray-600 opacity-0 transition-opacity hover:bg-gray-50 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          {removedImages.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {removedImages.slice(0, 6).map((imageUrl) => (
                <button
                  key={imageUrl}
                  type="button"
                  onClick={() => restoreImage(imageUrl)}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
                >
                  Restore photo
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div className="rounded-md border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900">Bike details</h3>
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bike-name">Product name</Label>
                <Input
                  id="bike-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="rounded-md"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bike-brand">Brand</Label>
                  <Input
                    id="bike-brand"
                    value={brand}
                    onChange={(event) => setBrand(event.target.value)}
                    className="rounded-md"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bicycle subcategory</Label>
                  <Select value={subcategory} onValueChange={setSubcategory}>
                    <SelectTrigger className="rounded-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKETPLACE_SUBCATEGORIES.Bicycles.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bike-price">Your price (AUD)</Label>
                <Input
                  id="bike-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder="e.g. 4999"
                  className="rounded-md"
                />
                <p className="text-xs text-gray-500">
                  {draft.price
                    ? `The official page shows ${draft.price.toLocaleString()} ${draft.currency ?? ""}. Set the price you sell it for.`
                    : "The official page does not show a price. Set the price you sell it for."}
                </p>
              </div>
              <p className="text-xs text-gray-500">
                {[
                  draft.modelYear ? `Model year ${draft.modelYear}` : null,
                  draft.bikeType,
                  draft.colors.length > 0 ? `Colours: ${draft.colors.join(", ")}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900">
              Sizes ({includedSizes.length} of {sizes.length} included)
            </h3>
            <p className="mt-0.5 text-sm text-gray-600">
              Each size becomes a variant with its own stock level.
            </p>
            {sizes.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">
                No sizes found on the page — the bike imports as a single product.
              </p>
            ) : (
              <div className="mt-3 space-y-1.5">
                {sizes.map((size, index) => (
                  <div
                    key={`${size.name}-${index}`}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2",
                      size.included ? "border-gray-300" : "border-gray-200 opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={size.included}
                      onChange={(event) => updateSize(index, { included: event.target.checked })}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                      {size.name}
                      {size.sku ? (
                        <span className="ml-2 text-[11px] font-normal text-gray-500">
                          SKU {size.sku}
                        </span>
                      ) : null}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-500">In stock</span>
                      <Input
                        type="number"
                        min={0}
                        value={size.qoh}
                        onChange={(event) => updateSize(index, { qoh: event.target.value })}
                        disabled={!size.included}
                        className="h-8 w-16 rounded-md text-center text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-gray-900">Description</h3>
        <p className="mt-0.5 text-sm text-gray-600">
          Written from the manufacturer&apos;s copy — edit anything you like.
        </p>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={8}
          className="mt-3 rounded-md text-sm"
        />
      </div>

      <div className="rounded-md border border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setSpecsOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        >
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Specifications</h3>
            <p className="mt-0.5 text-sm text-gray-600">
              {draft.specSections.length} section
              {draft.specSections.length === 1 ? "" : "s"} ·{" "}
              {draft.specSections.reduce((sum, section) => sum + section.specs.length, 0)}{" "}
              components from the official page. Shown on the product page as a spec sheet.
            </p>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-gray-500 transition-transform",
              specsOpen ? "rotate-180" : "",
            )}
          />
        </button>
        {specsOpen ? (
          <div className="grid gap-4 border-t border-gray-200 p-5 md:grid-cols-2">
            {draft.specSections.map((section) => (
              <div key={section.title} className="rounded-md border border-gray-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {section.title}
                </p>
                <dl className="mt-2 space-y-1">
                  {section.specs.map((spec) => (
                    <div key={`${section.title}-${spec.label}`} className="flex gap-2 text-xs">
                      <dt className="w-32 shrink-0 text-gray-500">{spec.label}</dt>
                      <dd className="min-w-0 flex-1 text-gray-800">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Sticky import bar */}
      <div className="sticky bottom-0 z-20 -mx-1 rounded-md border border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600">
            {sizes.length > 0 ? (
              <>
                <span className="font-medium text-gray-900">{includedSizes.length}</span> size
                {includedSizes.length === 1 ? "" : "s"} ·{" "}
              </>
            ) : null}
            {images.length} photo{images.length === 1 ? "" : "s"}
            {!canImport
              ? !name.trim()
                ? " · add a product name"
                : images.length === 0
                  ? " · keep at least one photo"
                  : " · set your AUD price to import"
              : priceNumber > 0
                ? ` · $${priceNumber.toLocaleString()}`
                : ""}
          </p>
          <Button
            className="rounded-md"
            onClick={importBike}
            disabled={!canImport || stage === "importing"}
          >
            {stage === "importing" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Import bike
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
