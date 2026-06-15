"use client";

import * as React from "react";
import Image from "next/image";
import {
  Sparkles,
  Loader2,
  ImageIcon,
  Wand2,
  Type,
  FileText,
  ListChecks,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Star,
  X,
  Plus,
  ZoomIn,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  buildSpeedSearchQuery,
  fetchSerperCandidates,
  type SpeedSearchCandidate,
  type SpeedWorkbenchProduct,
} from "@/lib/admin/image-qa-speed";
import type { MarketplaceProduct } from "@/lib/types/marketplace";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CanonicalImageRecord {
  id: string;
  cloudinary_url: string | null;
  external_url: string | null;
  is_primary: boolean | null;
  display_url: string | null;
}

type ImagePhase =
  | "idle"
  | "searching"
  | "selecting"
  | "ready"
  | "saving"
  | "done"
  | "no_results"
  | "error";

type TextStatus = "idle" | "running" | "done" | "error";

const MAX_IMAGES = 6;
const IMG_BUSY: ImagePhase[] = ["searching", "selecting", "saving"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSpeedProduct(p: MarketplaceProduct): SpeedWorkbenchProduct {
  return {
    id: p.canonical_product_id as string,
    normalized_name: p.display_name || p.description,
    display_name: p.display_name ?? null,
    upc: null,
    category: p.marketplace_category,
    manufacturer: null,
    marketplace_category: p.marketplace_category,
    marketplace_subcategory: p.marketplace_subcategory,
    image_review_search_query: null,
    store_product_name: p.display_name || p.description,
  };
}

async function readSSE(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Record<string, unknown>) => void,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        /* skip malformed */
      }
    }
  }
}

// ── Image section ─────────────────────────────────────────────────────────────

interface ImageState {
  phase: ImagePhase;
  candidates: SpeedSearchCandidate[];
  selected: SpeedSearchCandidate[];
  selectedUrls: string[];
  primaryUrl: string | null;
  reasoning?: string;
  error?: string;
  enhancedUrls: Record<string, string>;
  enhancingUrls: string[];
  showMore: boolean;
  savedCount?: number;
}

const emptyImage = (): ImageState => ({
  phase: "idle",
  candidates: [],
  selected: [],
  selectedUrls: [],
  primaryUrl: null,
  enhancedUrls: {},
  enhancingUrls: [],
  showMore: false,
});

function ImageSection({
  product,
  img,
  onUpdate,
  onLightbox,
}: {
  product: MarketplaceProduct;
  img: ImageState;
  onUpdate: (patch: Partial<ImageState> | ((prev: ImageState) => Partial<ImageState>)) => void;
  onLightbox: (url: string) => void;
}) {
  const abortRef = React.useRef<AbortController | null>(null);
  const productRef = React.useRef(product);
  productRef.current = product;

  const startSearch = async () => {
    if (!product.canonical_product_id) {
      onUpdate({ phase: "error", error: "No canonical product — sync from Lightspeed first" });
      return;
    }
    abortRef.current = new AbortController();
    const sp = toSpeedProduct(product);
    try {
      onUpdate({ phase: "searching" });
      const query = buildSpeedSearchQuery(sp);
      const candidates = await fetchSerperCandidates(sp, query);
      if (candidates.length === 0) {
        onUpdate({ phase: "no_results", error: "No images found" });
        return;
      }
      onUpdate({ phase: "selecting", candidates });
      const selRes = await fetch("/api/admin/images/ai-select-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: sp.store_product_name || sp.normalized_name,
          brand: sp.manufacturer ?? undefined,
          upc: sp.upc ?? undefined,
          candidates,
          maxImages: MAX_IMAGES,
        }),
        signal: abortRef.current.signal,
      });
      const selJson = await selRes.json();
      if (!selRes.ok || !selJson.success || !selJson.primaryUrl) {
        throw new Error(selJson.error || "AI selection failed");
      }
      onUpdate({
        phase: "ready",
        selected: selJson.selectedCandidates,
        selectedUrls: selJson.selectedUrls,
        primaryUrl: selJson.primaryUrl,
        reasoning: selJson.reasoning,
        error: undefined,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      onUpdate({ phase: "error", error: (err as Error).message });
    } finally {
      abortRef.current = null;
    }
  };

  const cancelSearch = () => {
    abortRef.current?.abort();
    onUpdate(emptyImage());
  };

  const approve = async () => {
    if (!product.canonical_product_id || img.phase !== "ready" || !img.primaryUrl) return;
    const sp = toSpeedProduct(product);
    onUpdate({ phase: "saving" });
    try {
      const res = await fetch("/api/admin/images/approve-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonicalProductId: product.canonical_product_id,
          selectedCandidates: img.selected,
          primaryCandidateUrl: img.primaryUrl,
          searchQuery: buildSpeedSearchQuery(sp),
          rejectPending: true,
          quickMode: true,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      onUpdate({ phase: "done", savedCount: (json.savedImageIds ?? img.selectedUrls).length });
    } catch (err) {
      onUpdate({ phase: "ready", error: (err as Error).message });
    }
  };

  const loadMore = async () => {
    const p = productRef.current;
    const sp = toSpeedProduct(p);
    onUpdate({ showMore: true });
    try {
      const fresh = await fetchSerperCandidates(sp, buildSpeedSearchQuery(sp));
      onUpdate((prev) => {
        const existing = new Set(prev.candidates.map((c) => c.url));
        return { candidates: [...prev.candidates, ...fresh.filter((c) => !existing.has(c.url))] };
      });
    } catch {
      /* ignore */
    }
  };

  const enhance = async (url: string) => {
    if (!product.canonical_product_id) return;
    onUpdate((prev) => ({ enhancingUrls: [...prev.enhancingUrls, url] }));
    try {
      const res = await fetch("/api/admin/images/enhance-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, canonicalProductId: product.canonical_product_id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.url) throw new Error();
      const eUrl: string = json.url;
      const eThumb: string = json.thumbnailUrl ?? json.url;
      onUpdate((prev) => ({
        selectedUrls: prev.selectedUrls.map((u) => (u === url ? eUrl : u)),
        selected: prev.selected.map((c) => c.url === url ? { ...c, url: eUrl, thumbnailUrl: eThumb } : c),
        primaryUrl: prev.primaryUrl === url ? eUrl : prev.primaryUrl,
        enhancedUrls: { ...prev.enhancedUrls, [url]: eUrl },
        enhancingUrls: prev.enhancingUrls.filter((u) => u !== url),
      }));
    } catch {
      onUpdate((prev) => ({ enhancingUrls: prev.enhancingUrls.filter((u) => u !== url) }));
    }
  };

  const remove = (url: string) =>
    onUpdate((prev) => {
      if (prev.selectedUrls.length <= 1) return {};
      const selectedUrls = prev.selectedUrls.filter((u) => u !== url);
      const selected = prev.selected.filter((c) => c.url !== url);
      const primaryUrl = prev.primaryUrl === url ? selectedUrls[0] ?? null : prev.primaryUrl;
      return { selectedUrls, selected, primaryUrl };
    });

  const addCandidate = (c: SpeedSearchCandidate) =>
    onUpdate((prev) => {
      if (prev.selectedUrls.includes(c.url) || prev.selectedUrls.length >= MAX_IMAGES) return {};
      return {
        selectedUrls: [...prev.selectedUrls, c.url],
        selected: [...prev.selected, c],
        primaryUrl: prev.primaryUrl ?? c.url,
      };
    });

  const setPrimary = (url: string) => onUpdate({ primaryUrl: url });

  const idle = img.phase === "idle";
  const editable = img.phase === "ready";
  const done = img.phase === "done";
  const busy = IMG_BUSY.includes(img.phase);
  const isError = img.phase === "error" || img.phase === "no_results";

  const extra = img.candidates.filter((c) => !img.selectedUrls.includes(c.url));

  return (
    <div className="space-y-3">
      {/* Status / action row */}
      {idle && (
        <Button size="sm" onClick={() => void startSearch()} disabled={!product.canonical_product_id}>
          <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
          {img.selectedUrls.length > 0 ? "Search again" : "Search for photos"}
        </Button>
      )}

      {busy && img.selectedUrls.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {img.phase === "searching" ? "Searching the web…" : "AI selecting best photos…"}
          <button
            type="button"
            onClick={cancelSearch}
            className="ml-auto text-xs text-muted-foreground underline hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {img.error || "Image step failed"}
          <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={() => onUpdate(emptyImage())}>
            Retry
          </Button>
        </div>
      )}

      {/* Selected images grid */}
      {img.selectedUrls.length > 0 && (
        <>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            {done ? (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved {img.savedCount ?? img.selectedUrls.length} photo{(img.savedCount ?? img.selectedUrls.length) === 1 ? "" : "s"}
              </span>
            ) : editable ? (
              <span>AI picked {img.selectedUrls.length} — set primary, remove any you don&apos;t want</span>
            ) : busy ? (
              <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>
            ) : null}

            {editable && (
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => img.showMore ? onUpdate({ showMore: false }) : void loadMore()}
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[11px] hover:bg-accent"
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                  {img.showMore ? "Hide more" : "More options"}
                </button>
                <Button size="sm" className="h-7 text-xs" onClick={() => void approve()} disabled={!product.canonical_product_id}>
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  Approve ({img.selectedUrls.length})
                </Button>
              </div>
            )}

            {done && (
              <Button size="sm" variant="outline" className="ml-auto h-7 text-xs" onClick={() => void startSearch()}>
                <RefreshCw className="mr-1 h-3 w-3" /> Search again
              </Button>
            )}
          </div>

          {editable && img.reasoning && (
            <p className="text-[11px] italic text-muted-foreground">{img.reasoning}</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {img.selectedUrls.map((url) => {
              const cand = img.selected.find((c) => c.url === url);
              const isEnhanced = !!img.enhancedUrls[url];
              const displaySrc = isEnhanced ? img.enhancedUrls[url] : cand?.thumbnailUrl ?? url;
              const fullSrc = isEnhanced ? img.enhancedUrls[url] : url;
              const primary = url === img.primaryUrl;
              const isEnhancing = img.enhancingUrls.includes(url);
              return (
                <div
                  key={url}
                  role="button"
                  tabIndex={0}
                  onClick={() => onLightbox(fullSrc)}
                  onKeyDown={(e) => e.key === "Enter" && onLightbox(fullSrc)}
                  aria-label="View full image"
                  className={cn(
                    "group relative aspect-square cursor-zoom-in overflow-hidden rounded-md border bg-muted",
                    primary ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background" : "border-border",
                  )}
                >
                  <Image src={displaySrc} alt="" fill unoptimized className="object-cover" />
                  {primary && (
                    <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-primary px-1 py-0.5 text-[9px] font-medium text-primary-foreground">
                      <Star className="h-2 w-2 fill-current" />
                      {isEnhanced ? "Primary·BG" : "Primary"}
                    </span>
                  )}
                  {isEnhancing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                  {editable && !isEnhancing && (
                    <>
                      {img.selectedUrls.length > 1 && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); remove(url); }}
                          className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded bg-background/90 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100"
                          aria-label="Remove">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                      {!isEnhanced && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); void enhance(url); }}
                          className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded bg-background/90 px-1 py-0.5 text-[9px] font-medium opacity-0 group-hover:opacity-100"
                          aria-label="Remove background">
                          <Wand2 className="h-2 w-2" /> BG
                        </button>
                      )}
                      {!primary && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setPrimary(url); }}
                          className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded bg-background/90 opacity-0 group-hover:opacity-100"
                          aria-label="Set primary">
                          <Star className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* More candidates */}
          {editable && img.showMore && (
            <div className="mt-2">
              {extra.length === 0 ? (
                <p className="text-center text-[11px] text-muted-foreground">No additional options — all results selected.</p>
              ) : (
                <>
                  <div className="mb-1.5 flex items-center gap-2">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">More candidates</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto">
                    {extra.map((c) => {
                      const atMax = img.selectedUrls.length >= MAX_IMAGES;
                      return (
                        <div key={c.url} className="group relative aspect-square overflow-hidden rounded-md border border-dashed border-border bg-muted/50">
                          <Image src={c.thumbnailUrl || c.url} alt="" fill unoptimized className="object-cover opacity-80" />
                          {!atMax && (
                            <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition group-hover:bg-foreground/30 group-hover:opacity-100">
                              <button type="button" onClick={() => addCandidate(c)}
                                className="inline-flex items-center gap-0.5 rounded bg-background px-1.5 py-0.5 text-[10px] font-medium">
                                <Plus className="h-2.5 w-2.5" /> Add
                              </button>
                            </div>
                          )}
                          <button type="button" onClick={() => onLightbox(c.url)}
                            className="absolute right-1 top-1 h-5 w-5 flex items-center justify-center rounded bg-background/80 opacity-0 group-hover:opacity-100">
                            <ZoomIn className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Text section (title / description / specs) ─────────────────────────────────

function TextSection({
  label,
  icon: Icon,
  current,
  status,
  onRun,
  onSave,
  running,
  multiline = false,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  current: string | null | undefined;
  status: TextStatus;
  onRun: () => void;
  onSave: (value: string) => Promise<void>;
  running: boolean;
  multiline?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(current ?? "");
  const [saving, setSaving] = React.useState(false);
  const hasCurrent = !!current;
  const isDone = status === "done" || (hasCurrent && status === "idle");

  // Sync edit value if content changes externally (e.g. after generation)
  React.useEffect(() => {
    if (!editing) setEditValue(current ?? "");
  }, [current, editing]);

  const startEdit = () => {
    setEditValue(current ?? "");
    setEditing(true);
    setExpanded(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditValue(current ?? "");
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await onSave(editValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {status === "running" ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : isDone ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : status === "error" ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : (
            <Icon className="h-4 w-4 text-muted-foreground" />
          )}
          {label}
        </div>
        <div className="flex items-center gap-1.5">
          {hasCurrent && !editing && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              disabled={running || status === "running"}
              onClick={startEdit}
            >
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          )}
          <Button
            variant={isDone ? "outline" : "default"}
            size="sm"
            className="h-7 text-xs"
            disabled={running || status === "running" || editing}
            onClick={onRun}
          >
            {status === "running" ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" /> Working…</>
            ) : isDone ? (
              <><RefreshCw className="mr-1 h-3 w-3" /> Regenerate</>
            ) : (
              <><Sparkles className="mr-1 h-3 w-3" /> Generate</>
            )}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          {multiline ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-primary bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-y"
              autoFocus
            />
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded-md border border-primary bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveEdit();
                if (e.key === "Escape") cancelEdit();
              }}
            />
          )}
          <div className="flex items-center gap-1.5">
            <Button size="sm" className="h-7 text-xs" disabled={saving} onClick={() => void saveEdit()}>
              {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Save
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={saving} onClick={cancelEdit}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          {hasCurrent && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <p className={cn("whitespace-pre-wrap", !expanded && "line-clamp-3")}>{current}</p>
              {(current?.length ?? 0) > 200 && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 flex items-center gap-0.5 text-[11px] text-primary hover:underline"
                >
                  {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show more</>}
                </button>
              )}
            </div>
          )}

          {!hasCurrent && status === "idle" && (
            <p className="text-xs text-muted-foreground">Not yet generated — click Generate to create with AI.</p>
          )}

          {status === "error" && (
            <p className="text-xs text-destructive">Generation failed. Try again.</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Optimise panel (embeddable in Edit Listing) ───────────────────────────────

export interface ProductOptimizePanelProps {
  product: MarketplaceProduct;
  onProductUpdate?: (updates: Partial<MarketplaceProduct>) => void;
  /** When true, loads photos and runs panel effects */
  active?: boolean;
  /** Tighter layout when nested inside Edit Listing */
  embedded?: boolean;
}

export function ProductOptimizePanel({
  product,
  onProductUpdate,
  active = true,
  embedded = false,
}: ProductOptimizePanelProps) {
  const [running, setRunning] = React.useState(false);
  const [lightbox, setLightbox] = React.useState<string | null>(null);

  // Local mutable product state (tracks changes made in the panel)
  const [local, setLocal] = React.useState<MarketplaceProduct>(product);
  React.useEffect(() => {
    setLocal(product);
  }, [product]);

  const patchLocal = (updates: Partial<MarketplaceProduct>) => {
    setLocal((prev) => ({ ...prev, ...updates }));
    onProductUpdate?.(updates);
  };

  // Canonical images (fetched when panel is active)
  const [canonicalImages, setCanonicalImages] = React.useState<CanonicalImageRecord[]>([]);
  const [loadingImages, setLoadingImages] = React.useState(false);
  const [ciRemovingIds, setCiRemovingIds] = React.useState<string[]>([]);
  const [ciEnhancingIds, setCiEnhancingIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!active || !product.canonical_product_id) return;
    let cancelled = false;
    (async () => {
      setLoadingImages(true);
      try {
        const res = await fetch(
          `/api/admin/images/approved?canonicalProductId=${product.canonical_product_id}`,
        );
        const json = await res.json();
        if (!cancelled && json.success) setCanonicalImages(json.data ?? []);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoadingImages(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, product.canonical_product_id]);

  const removeCanonicalImage = async (imageId: string) => {
    if (!product.canonical_product_id) return;
    setCiRemovingIds((prev) => [...prev, imageId]);
    setCanonicalImages((prev) => prev.filter((ci) => ci.id !== imageId));
    try {
      await fetch("/api/admin/images/remove-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: product.canonical_product_id, imageId }),
      });
    } catch {
      // Refetch to restore accurate state on failure
      const res = await fetch(`/api/admin/images/approved?canonicalProductId=${product.canonical_product_id}`);
      const json = await res.json();
      if (json.success) setCanonicalImages(json.data ?? []);
    } finally {
      setCiRemovingIds((prev) => prev.filter((id) => id !== imageId));
    }
  };

  const setCanonicalPrimary = async (imageId: string) => {
    if (!product.canonical_product_id) return;
    setCanonicalImages((prev) => prev.map((ci) => ({ ...ci, is_primary: ci.id === imageId })));
    try {
      await fetch("/api/admin/images/set-primary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canonicalProductId: product.canonical_product_id, imageId }),
      });
    } catch {
      const res = await fetch(`/api/admin/images/approved?canonicalProductId=${product.canonical_product_id}`);
      const json = await res.json();
      if (json.success) setCanonicalImages(json.data ?? []);
    }
  };

  const enhanceCanonicalImage = async (imageId: string, url: string) => {
    if (!product.canonical_product_id) return;
    setCiEnhancingIds((prev) => [...prev, imageId]);
    try {
      const res = await fetch("/api/admin/images/enhance-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: url, canonicalProductId: product.canonical_product_id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.url) throw new Error(json.error || "Enhancement failed");
      const enhancedUrl: string = json.url;
      const publicId: string | undefined = json.publicId;
      await fetch("/api/admin/images/update-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId,
          canonicalProductId: product.canonical_product_id,
          cloudinaryUrl: enhancedUrl,
          cloudinaryPublicId: publicId ?? null,
        }),
      });
      setCanonicalImages((prev) =>
        prev.map((ci) =>
          ci.id === imageId
            ? { ...ci, cloudinary_url: enhancedUrl, display_url: enhancedUrl, external_url: null }
            : ci,
        ),
      );
    } catch {
      // silently fail — image unchanged
    } finally {
      setCiEnhancingIds((prev) => prev.filter((id) => id !== imageId));
    }
  };

  // Image state
  const [img, setImg] = React.useState<ImageState>(emptyImage());
  const patchImg = (patch: Partial<ImageState> | ((prev: ImageState) => Partial<ImageState>)) =>
    setImg((prev) => {
      const next = typeof patch === "function" ? patch(prev) : patch;
      return { ...prev, ...next };
    });

  // Text statuses
  const [titleStatus, setTitleStatus] = React.useState<TextStatus>("idle");
  const [descStatus, setDescStatus] = React.useState<TextStatus>("idle");
  const [specsStatus, setSpecsStatus] = React.useState<TextStatus>("idle");

  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Text generation ──────────────────────────────────────────────────────────

  const runTitle = async () => {
    setRunning(true);
    abortRef.current = new AbortController();
    setTitleStatus("running");
    try {
      const res = await fetch("/api/products/generate-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [local.id] }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("Failed");
      await readSSE(res.body, (event) => {
        if (event.productId !== local.id || event.event !== "product_complete") return;
        if (event.success && event.title) {
          patchLocal({ display_name: event.title as string });
          setTitleStatus("done");
        } else {
          setTitleStatus("error");
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") setTitleStatus("error");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const runDescriptions = async (mode: "both" | "description" | "specs") => {
    setRunning(true);
    abortRef.current = new AbortController();
    const doDesc = mode === "both" || mode === "description";
    const doSpecs = mode === "both" || mode === "specs";
    if (doDesc) setDescStatus("running");
    if (doSpecs) setSpecsStatus("running");
    try {
      const res = await fetch("/api/products/generate-product-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [local.id], mode }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error("Failed");
      await readSSE(res.body, (event) => {
        if (event.productId !== local.id) return;
        if (event.event === "product_complete") {
          if (event.success) {
            const updates: Partial<MarketplaceProduct> = {};
            if (doDesc && event.description) updates.product_description = event.description as string;
            if (doSpecs && event.specs) updates.product_specs = event.specs as string;
            patchLocal(updates);
            if (doDesc) setDescStatus("done");
            if (doSpecs) setSpecsStatus("done");
          } else {
            if (doDesc) setDescStatus("error");
            if (doSpecs) setSpecsStatus("error");
          }
        }
      });
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        if (doDesc) setDescStatus("error");
        if (doSpecs) setSpecsStatus("error");
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const saveField = async (field: "display_name" | "product_description" | "product_specs", value: string) => {
    const res = await fetch(`/api/products/${local.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error("Failed to save");
    patchLocal({ [field]: value });
  };

  const sectionClass = embedded ? "py-4" : "px-5 py-5";

  return (
    <>
      <div className={cn(embedded ? "space-y-4" : "space-y-0 divide-y divide-border")}>
        {/* Photos */}
        <section className={sectionClass}>
              <div className="mb-3 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Photos</h3>
              </div>
              {!product.canonical_product_id && (
                <p className="mb-3 text-xs text-muted-foreground">
                  This product isn&apos;t linked to a canonical product yet. Sync from Lightspeed to enable image search.
                </p>
              )}
              {/* Existing canonical images — fetched when drawer opens */}
              {img.phase === "idle" && (
                <div className="mb-4">
                  {loadingImages ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading photos…
                    </div>
                  ) : canonicalImages.length > 0 ? (
                    <>
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        {canonicalImages.length} approved photo{canonicalImages.length === 1 ? "" : "s"}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {canonicalImages.map((ci) => {
                          const url = ci.display_url || ci.cloudinary_url || ci.external_url;
                          if (!url) return null;
                          const isRemoving = ciRemovingIds.includes(ci.id);
                          return (
                            <div
                              key={ci.id}
                              className={cn(
                                "group relative aspect-square overflow-hidden rounded-lg border bg-muted",
                                ci.is_primary
                                  ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                                  : "border-border",
                                isRemoving && "opacity-40",
                              )}
                            >
                              {/* Clickable image */}
                              <div
                                role="button"
                                tabIndex={0}
                                aria-label="View full image"
                                onClick={() => !isRemoving && !ciEnhancingIds.includes(ci.id) && setLightbox(url)}
                                onKeyDown={(e) => e.key === "Enter" && !isRemoving && !ciEnhancingIds.includes(ci.id) && setLightbox(url)}
                                className="absolute inset-0 cursor-zoom-in"
                              >
                                <Image src={url} alt="" fill unoptimized className="object-cover" />
                              </div>

                              {/* Primary badge */}
                              {ci.is_primary && (
                                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow">
                                  <Star className="h-2.5 w-2.5 fill-current" /> Primary
                                </span>
                              )}

                              {/* Enhancing spinner */}
                              {ciEnhancingIds.includes(ci.id) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                </div>
                              )}

                              {!isRemoving && !ciEnhancingIds.includes(ci.id) && (
                                <>
                                  {/* Remove (X) — top-right, only when >1 photo */}
                                  {canonicalImages.length > 1 && (
                                    <button
                                      type="button"
                                      aria-label="Remove photo"
                                      title="Remove photo"
                                      onClick={(e) => { e.stopPropagation(); void removeCanonicalImage(ci.id); }}
                                      className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow opacity-0 transition hover:bg-background hover:text-foreground group-hover:opacity-100"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  {/* Remove background (Wand) — bottom-left */}
                                  {product.canonical_product_id && (
                                    <button
                                      type="button"
                                      aria-label="Remove background"
                                      title="Remove background & add white backdrop"
                                      onClick={(e) => { e.stopPropagation(); void enhanceCanonicalImage(ci.id, url); }}
                                      className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] font-medium text-foreground shadow opacity-0 transition hover:bg-background group-hover:opacity-100"
                                    >
                                      <Wand2 className="h-3 w-3" /> BG
                                    </button>
                                  )}

                                  {/* Set primary (Star) — bottom-right, non-primary only */}
                                  {!ci.is_primary && (
                                    <button
                                      type="button"
                                      aria-label="Set as primary"
                                      title="Set as primary photo"
                                      onClick={(e) => { e.stopPropagation(); void setCanonicalPrimary(ci.id); }}
                                      className="absolute bottom-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-foreground shadow opacity-0 transition hover:bg-background group-hover:opacity-100"
                                    >
                                      <Star className="h-3.5 w-3.5" />
                                    </button>
                                  )}

                                  {/* Zoom hint — center on hover */}
                                  <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 opacity-0 transition pointer-events-none group-hover:bg-foreground/10 group-hover:opacity-100">
                                    <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : product.canonical_product_id ? (
                    <p className="text-xs text-muted-foreground">No approved photos yet — search below to add some.</p>
                  ) : null}
                </div>
              )}
              <ImageSection
                product={product}
                img={img}
                onUpdate={patchImg}
                onLightbox={setLightbox}
              />
            </section>

            {/* Title */}
            <section className={sectionClass}>
              <TextSection
                label="Title"
                icon={Type}
                current={local.display_name || null}
                status={titleStatus}
                onRun={() => void runTitle()}
                onSave={(v) => saveField("display_name", v)}
                running={running}
              />
            </section>

            {/* Description */}
            <section className={sectionClass}>
              <TextSection
                label="Description"
                icon={FileText}
                current={local.product_description ?? null}
                status={descStatus}
                onRun={() => void runDescriptions("description")}
                onSave={(v) => saveField("product_description", v)}
                running={running}
                multiline
              />
            </section>

            {/* Specs */}
            <section className={sectionClass}>
              <TextSection
                label="Specs"
                icon={ListChecks}
                current={local.product_specs ?? null}
                status={specsStatus}
                onRun={() => void runDescriptions("specs")}
                onSave={(v) => saveField("product_specs", v)}
                running={running}
                multiline
              />
            </section>

            {/* Generate all shortcut */}
            {!running && (
              <section className={sectionClass}>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => {
                    void (async () => {
                      await runTitle();
                      await runDescriptions("both");
                    })();
                  }}
                  disabled={running}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Generate title + description + specs
                </Button>
              </section>
            )}
      </div>

      {running && embedded && (
        <div className="mt-3 flex justify-end">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={stop}>
            Stop AI
          </Button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-foreground/85 p-6 backdrop-blur-sm"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Full-size preview"
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            aria-label="Close"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg transition hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
