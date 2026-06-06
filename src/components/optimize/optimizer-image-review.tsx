"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Star,
  Wand2,
  X,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SpeedSearchCandidate } from "@/lib/admin/image-qa-speed";
import {
  type ImageRun,
  IMG_BUSY,
  MAX_SELECTED_IMAGES,
} from "@/components/optimize/optimizer-shared";

const IMG_PHASE_LABEL: Partial<Record<ImageRun["phase"], string>> = {
  queued: "Queued",
  searching: "Searching images…",
  selecting: "AI selecting…",
  ready: "Review picks",
  saving: "Saving…",
  no_results: "No images found",
  error: "Failed",
};

export function OptimizerImageReview({
  img,
  hasCanonical,
  onSetPrimary,
  onRemove,
  onAdd,
  onEnhance,
  onToggleAdditional,
  onApprove,
  onLightbox,
  saving,
  hideApproveAction = false,
}: {
  img: ImageRun;
  hasCanonical: boolean;
  onSetPrimary: (url: string) => void;
  onRemove: (url: string) => void;
  onAdd: (c: SpeedSearchCandidate) => void;
  onEnhance: (url: string) => void;
  onToggleAdditional: () => void;
  onApprove: () => void;
  onLightbox: (url: string) => void;
  saving: boolean;
  hideApproveAction?: boolean;
}) {
  const editable = img.phase === "ready";
  const done = img.phase === "done";

  if (img.phase === "no_results" || img.phase === "error") {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
        {img.error || "Image step failed"}
      </div>
    );
  }

  if (IMG_BUSY.includes(img.phase) && img.selectedUrls.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
        {IMG_PHASE_LABEL[img.phase]}
      </div>
    );
  }

  if (img.selectedUrls.length === 0) return null;

  const extra = img.candidates.filter((c) => !img.selectedUrls.includes(c.url));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {done ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Saved {img.savedCount ?? img.selectedUrls.length} photo
              {(img.savedCount ?? img.selectedUrls.length) === 1 ? "" : "s"}
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 text-primary" />
              Pick a primary photo, remove any you don&apos;t want, then approve.
            </>
          )}
        </div>
        {editable && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={img.reloading}
              onClick={onToggleAdditional}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent disabled:opacity-50"
            >
              {img.reloading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {img.showAdditional ? "Hide more" : "More images"}
            </button>
            {!hideApproveAction && (
              <Button type="button" size="sm" disabled={saving || !hasCanonical} onClick={onApprove}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Approve ({img.selectedUrls.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {!hasCanonical && (
        <p className="inline-flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3" />
          Can&apos;t save — sync from Lightspeed first.
        </p>
      )}

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {img.selectedUrls.map((url) => {
          const candidate = img.candidates.find((c) => c.url === url);
          const isEnhanced = !!img.enhancedUrls?.[url];
          const displaySrc = isEnhanced
            ? img.enhancedUrls![url]
            : candidate?.thumbnailUrl ?? url;
          const fullSrc = isEnhanced ? img.enhancedUrls![url] : url;
          const primary = url === img.primaryUrl;
          const isEnhancing = (img.enhancingUrls ?? []).includes(url);
          return (
            <div
              key={url}
              role="button"
              tabIndex={0}
              aria-label="View full image"
              onClick={() => onLightbox(fullSrc)}
              onKeyDown={(e) => e.key === "Enter" && onLightbox(fullSrc)}
              className={cn(
                "group relative aspect-square cursor-zoom-in overflow-hidden rounded-md border bg-muted",
                primary
                  ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                  : "border-border",
              )}
            >
              <Image src={displaySrc} alt="" fill unoptimized className="object-cover" />
              {primary && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Primary
                </span>
              )}
              {isEnhancing && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {editable && !isEnhancing && (
                <>
                  {img.selectedUrls.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove image"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(url);
                      }}
                      className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm transition hover:bg-background hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isEnhanced && (
                    <button
                      type="button"
                      aria-label="Remove background"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEnhance(url);
                      }}
                      className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] font-medium text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100"
                    >
                      <Wand2 className="h-2.5 w-2.5" />
                      BG
                    </button>
                  )}
                  {!primary && (
                    <button
                      type="button"
                      aria-label="Set as primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSetPrimary(url);
                      }}
                      className="absolute bottom-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100"
                    >
                      <Star className="h-3 w-3" />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {editable && img.showAdditional && (
        <div>
          {extra.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              No more candidates — all results are already selected.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  More candidates
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {extra.map((c) => {
                  const atMax = img.selectedUrls.length >= MAX_SELECTED_IMAGES;
                  return (
                    <div
                      key={c.url}
                      className="group relative aspect-square overflow-hidden rounded-md border border-dashed border-border bg-muted/50"
                    >
                      <Image
                        src={c.thumbnailUrl || c.url}
                        alt=""
                        fill
                        unoptimized
                        className="object-cover opacity-80"
                      />
                      {!atMax && (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:bg-foreground/30 group-hover:opacity-100">
                          <button
                            type="button"
                            aria-label="Add image"
                            onClick={() => onAdd(c)}
                            className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-[11px] font-medium text-foreground shadow-sm"
                          >
                            <Plus className="h-3 w-3" />
                            Add
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        aria-label="View full image"
                        onClick={() => onLightbox(c.url)}
                        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100 group-hover:opacity-100"
                      >
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
    </div>
  );
}
