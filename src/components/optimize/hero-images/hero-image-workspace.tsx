"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Crown, ExternalLink, Loader2, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  HeroPipelineResult,
  RejectedCandidate,
  SelectedImage,
} from "@/lib/optimize/hero-images/types";

// eslint-disable-next-line @next/next/no-img-element
const Img = (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />;

interface ProductHit {
  product_id: string;
  name: string;
  brand: string | null;
  upc: string | null;
  search_query: string | null;
  current_image_url: string | null;
}

const REJECT_LABEL: Record<RejectedCandidate["reason"], string> = {
  dead_link: "Dead link",
  not_image: "Not an image",
  too_small: "Too small",
  bad_aspect: "Banner / bad shape",
  duplicate: "Duplicate (zoom/crop)",
  decode_failed: "Could not decode",
};

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function FunnelStat({ label, value, dim }: { label: string; value: number | string; dim?: boolean }) {
  return (
    <div className="rounded-md border border-border/60 bg-white px-3 py-2 text-center">
      <p className={cn("text-lg font-semibold", dim ? "text-muted-foreground" : "text-foreground")}>{value}</p>
      <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

function ImageMeta({ image }: { image: SelectedImage }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary">{image.width}×{image.height}</Badge>
      <Badge variant="secondary">bg {pct(image.whiteFraction)}</Badge>
      <Badge variant="secondary">hero {pct(image.heroScore)}</Badge>
      {image.isOfficial && <Badge variant="default">official</Badge>}
      {image.domain && <span className="text-[11px] text-muted-foreground">{image.domain}</span>}
    </div>
  );
}

export function HeroImageWorkspace() {
  const [name, setName] = React.useState("");
  const [brand, setBrand] = React.useState("");
  const [upc, setUpc] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState<string | null>(null);
  const [maxImages, setMaxImages] = React.useState(6);
  const [currentImage, setCurrentImage] = React.useState<string | null>(null);

  const [productQuery, setProductQuery] = React.useState("");
  const [productHits, setProductHits] = React.useState<ProductHit[]>([]);
  const [searchingProducts, setSearchingProducts] = React.useState(false);

  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<HeroPipelineResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showRejected, setShowRejected] = React.useState(false);

  // Debounced catalogue product search.
  React.useEffect(() => {
    const q = productQuery.trim();
    if (q.length < 2) {
      setProductHits([]);
      return;
    }
    let cancelled = false;
    setSearchingProducts(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/optimize/hero-images/product-search?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) setProductHits((data.products ?? []) as ProductHit[]);
      } finally {
        if (!cancelled) setSearchingProducts(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [productQuery]);

  function pickProduct(p: ProductHit) {
    setName(p.name);
    setBrand(p.brand ?? "");
    setUpc(p.upc ?? "");
    setSearchQuery(p.search_query);
    setCurrentImage(p.current_image_url);
    setProductQuery("");
    setProductHits([]);
  }

  async function run() {
    if (!name.trim()) {
      setError("Enter a product name (or pick a catalogue product).");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setShowRejected(false);
    try {
      const res = await fetch("/api/optimize/hero-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brand: brand.trim() || null,
          upc: upc.trim() || null,
          searchQuery,
          maxImages,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as HeroPipelineResult & { error?: string };
      if (!res.ok) {
        setError(data.error || "Pipeline failed");
      } else {
        setResult(data);
        if (!data.ok && data.error) setError(data.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pipeline failed");
    } finally {
      setRunning(false);
    }
  }

  const rejectedByReason = React.useMemo(() => {
    const map = new Map<RejectedCandidate["reason"], RejectedCandidate[]>();
    for (const r of result?.rejected ?? []) {
      const list = map.get(r.reason) ?? [];
      list.push(r);
      map.set(r.reason, list);
    }
    return [...map.entries()];
  }, [result]);

  return (
    <div className="space-y-6">
      {/* ── Input panel ── */}
      <div className="space-y-4 rounded-lg border border-border/60 bg-white p-4">
        <div className="relative">
          <Label className="mb-1.5 block text-xs">Find a catalogue product (optional)</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Search your products by name…"
              className="pl-8"
            />
            {searchingProducts && (
              <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          {productHits.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-white shadow-lg">
              {productHits.map((p) => (
                <button
                  key={p.product_id}
                  type="button"
                  onClick={() => pickProduct(p)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {p.current_image_url ? (
                    <Img src={p.current_image_url} className="size-8 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="size-8 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[p.brand, p.upc].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Label className="mb-1.5 block text-xs">Product name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bontrager Ion 200 RT front light" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Brand</Label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Bontrager" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">UPC / barcode</Label>
            <Input value={upc} onChange={(e) => setUpc(e.target.value)} placeholder="optional" />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">Images wanted</Label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={6}
                value={maxImages}
                onChange={(e) => setMaxImages(Number(e.target.value))}
                className="w-full"
              />
              <span className="w-6 text-center text-sm font-semibold tabular-nums">{maxImages}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {running ? "Running pipeline…" : "Find best photos"}
          </Button>
          {currentImage && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Current:</span>
              <Img src={currentImage} className="size-9 rounded object-cover ring-1 ring-border" />
            </div>
          )}
        </div>
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        )}
      </div>

      {running && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          <p className="text-sm">Harvesting searches → downloading &amp; measuring → de-duplicating → AI selection…</p>
          <p className="text-xs">This can take 20–40s — it downloads every candidate to check real quality.</p>
        </div>
      )}

      {/* ── Results ── */}
      {result && !running && (
        <div className="space-y-6">
          {/* Funnel */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <FunnelStat label="Harvested" value={result.stats.harvested} dim />
            <FunnelStat label="Passed quality" value={result.stats.afterPrefilter} dim />
            <FunnelStat label="After de-dup" value={result.stats.afterDedupe} dim />
            <FunnelStat label="Sent to AI" value={result.stats.sentToAi} dim />
            <FunnelStat label="Selected" value={result.stats.selected} />
            <FunnelStat label="Time" value={`${(result.timings.totalMs / 1000).toFixed(1)}s`} dim />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {result.modelsUsed.length > 0 && <span>Models: {result.modelsUsed.join(", ")}</span>}
            <span>· AI cost: ${result.costUsd.toFixed(4)}</span>
            <span>· Queries: {result.queriesUsed.length}</span>
          </div>

          {result.selected.length > 0 ? (
            <ResultCarousel key={result.selected.map((s) => s.url).join("|")} images={result.selected} />
          ) : (
            <div className="rounded-md border border-border/60 bg-white p-8 text-center">
              <p className="text-sm font-medium text-foreground">No usable images selected</p>
              <p className="mt-1 text-sm text-muted-foreground">{result.error || result.reasoning}</p>
            </div>
          )}

          {result.reasoning && result.selected.length > 0 && (
            <div className="rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">AI reasoning: </span>
              {result.reasoning}
            </div>
          )}

          {/* Transparency: rejects */}
          {result.rejected.length > 0 && (
            <div className="rounded-lg border border-border/60 bg-white">
              <button
                type="button"
                onClick={() => setShowRejected((s) => !s)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
              >
                <span>Filtered out ({result.rejected.length})</span>
                <span className="text-xs text-muted-foreground">{showRejected ? "Hide" : "Show"}</span>
              </button>
              {showRejected && (
                <div className="space-y-4 border-t border-border/60 p-4">
                  {rejectedByReason.map(([reason, items]) => (
                    <div key={reason} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{REJECT_LABEL[reason]}</Badge>
                        <span className="text-xs text-muted-foreground">{items.length}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                        {items.slice(0, 24).map((r, i) => (
                          <a
                            key={`${r.url}-${i}`}
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block overflow-hidden rounded border border-border bg-muted transition-opacity hover:opacity-100"
                            title={`${r.domain ?? ""} ${r.detail ?? ""} — click to open original`.trim()}
                          >
                            <Img src={r.url} className="aspect-square w-full object-cover opacity-70" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** All selected images in one carousel: main stage + thumbnail strip, click to
 *  open a full-screen lightbox of the actual image (keyboard ←/→/Esc). */
function ResultCarousel({ images }: { images: SelectedImage[] }) {
  const [active, setActive] = React.useState(0);
  const [lightbox, setLightbox] = React.useState(false);
  const current = images[active] ?? images[0];

  const go = React.useCallback(
    (delta: number) => setActive((i) => (i + delta + images.length) % images.length),
    [images.length],
  );

  React.useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, go]);

  return (
    <div className="space-y-3">
      {/* Main stage — click the image to view it full size */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-white">
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="block w-full cursor-zoom-in"
          title="Click to view the full image"
        >
          <Img src={current.url} className="mx-auto aspect-square w-full max-w-[460px] bg-white object-contain" />
        </button>

        {current.isPrimary && (
          <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-amber-400/95 px-2 py-0.5 text-[11px] font-semibold text-amber-950 shadow">
            <Crown className="size-3" /> Hero
          </span>
        )}
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
          {active + 1} / {images.length}
        </span>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow ring-1 ring-black/5 hover:bg-white"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1.5 shadow ring-1 ring-black/5 hover:bg-white"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {/* Meta + reason for the current image */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <ImageMeta image={current} />
          <a
            href={current.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open original <ExternalLink className="size-3" />
          </a>
        </div>
        {current.reason && <p className="text-xs text-muted-foreground">{current.reason}</p>}
      </div>

      {/* The whole gallery as one scrollable strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setActive(i)}
            title={img.isPrimary ? "Hero image" : `Image ${i + 1}`}
            className={cn(
              "relative size-16 shrink-0 overflow-hidden rounded-md border bg-white",
              i === active ? "border-amber-400 ring-2 ring-amber-300" : "border-border hover:border-foreground/30",
            )}
          >
            <Img src={img.thumbnailUrl || img.url} className="size-full bg-white object-contain" />
            {img.isPrimary && <Crown className="absolute left-0.5 top-0.5 size-3.5 text-amber-500 drop-shadow" />}
          </button>
        ))}
      </div>

      {/* Full-screen lightbox of the actual image */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="size-5" />
          </button>

          <Img
            src={current.url}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[92vw] object-contain"
          />

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(-1); }}
                aria-label="Previous image"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); go(1); }}
                aria-label="Next image"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}

          <div
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <span>
              {active + 1} / {images.length}
              {current.isPrimary ? " · Hero" : ""}
            </span>
            <span className="text-white/60">{current.width}×{current.height}</span>
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              Open original <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
