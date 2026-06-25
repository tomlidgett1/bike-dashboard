"use client";

import * as React from "react";
import Image from "next/image";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Star,
  Wand2,
  X,
  ZoomIn,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SpeedSearchCandidate } from "@/lib/admin/image-qa-speed";
import {
  type ImageRun,
  IMG_BUSY,
  MAX_SELECTED_IMAGES,
} from "@/components/optimize/optimizer-shared";

export function OptimizerImageReview({
  img,
  hasCanonical,
  onSetPrimary,
  onRemove,
  onAdd,
  onEnhance,
  onToggleAdditional,
  onApprove,
  onRerunSearch,
  onEnhanceDisplayReady,
  onLightbox,
  saving,
  hideApproveAction = false,
  hideToolbar = false,
  size = "default",
  serperQuery,
  onSerperQueryChange,
  onCustomSearch,
  searchDisabled = false,
}: {
  img: ImageRun;
  hasCanonical: boolean;
  onSetPrimary: (url: string) => void;
  onRemove: (url: string) => void;
  onAdd: (c: SpeedSearchCandidate) => void;
  onEnhance: (url: string) => void;
  onToggleAdditional: () => void;
  onApprove: () => void;
  onRerunSearch?: () => void;
  onEnhanceDisplayReady?: (originalUrl: string) => void;
  onLightbox: (url: string) => void;
  saving: boolean;
  hideApproveAction?: boolean;
  hideToolbar?: boolean;
  size?: "default" | "large" | "compact";
  serperQuery?: string;
  onSerperQueryChange?: (query: string) => void;
  onCustomSearch?: () => void;
  searchDisabled?: boolean;
}) {
  const editable = img.phase === "ready";
  const done = img.phase === "done";
  const selectedUrlsKey = img.selectedUrls.join("|");
  const enhancedUrlsKey = JSON.stringify(img.enhancedUrls ?? {});
  const [loadedDisplaySrcs, setLoadedDisplaySrcs] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    setLoadedDisplaySrcs({});
  }, [selectedUrlsKey, enhancedUrlsKey]);

  React.useEffect(() => {
    if (!onEnhanceDisplayReady) return;
    for (const url of img.selectedUrls) {
      const enhanced = img.enhancedUrls?.[url];
      if (!enhanced) continue;
      if ((img.enhancingUrls ?? []).includes(url) && loadedDisplaySrcs[enhanced]) {
        onEnhanceDisplayReady(url);
      }
    }
  }, [
    img.enhancingUrls,
    img.enhancedUrls,
    img.selectedUrls,
    loadedDisplaySrcs,
    onEnhanceDisplayReady,
  ]);

  if (img.phase === "no_results" || img.phase === "error") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {img.error || "Image step failed"}
        </div>
        {!hideToolbar && onCustomSearch && onSerperQueryChange ? (
          <OptimizerPhotoToolbar
            img={img}
            hasCanonical={hasCanonical}
            saving={saving}
            hideApproveAction
            showMoreImages={false}
            serperQuery={serperQuery ?? ""}
            onSerperQueryChange={onSerperQueryChange}
            onCustomSearch={onCustomSearch}
            onToggleAdditional={onToggleAdditional}
            onRerunSearch={onRerunSearch}
            onApprove={onApprove}
            searchDisabled={searchDisabled}
          />
        ) : null}
      </div>
    );
  }

  if (IMG_BUSY.includes(img.phase) && img.selectedUrls.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin" />
        Finding images
      </div>
    );
  }

  if (img.selectedUrls.length === 0) return null;

  const extra = img.candidates.filter((c) => !img.selectedUrls.includes(c.url));
  const selectedGridClass =
    size === "compact"
      ? "flex gap-1.5 overflow-x-auto pb-0.5"
      : size === "large"
        ? "grid grid-cols-2 gap-4 sm:grid-cols-3"
        : "grid grid-cols-4 gap-2 sm:grid-cols-6";
  const extraScrollClass =
    size === "compact"
      ? "max-h-14 overflow-x-auto pb-0.5"
      : size === "large"
        ? "max-h-96 overflow-y-auto"
        : "max-h-72 overflow-y-auto";
  const extraGridClass =
    size === "compact"
      ? "flex w-full gap-1.5"
      : size === "large"
        ? "grid w-full grid-cols-3 gap-3 sm:grid-cols-4"
        : "grid w-full grid-cols-4 gap-2 sm:grid-cols-6";
  const thumbClass =
    size === "compact"
      ? "relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted"
      : "group relative aspect-square w-full min-w-0 cursor-zoom-in overflow-hidden rounded-md border bg-muted";

  return (
    <div className={cn("w-full min-w-0", size === "compact" ? "space-y-1" : "space-y-3")}>
      {size !== "compact" && !hideToolbar && (done || editable) ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            done ? "justify-between" : "justify-end",
          )}
        >
          {done ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              Saved {img.savedCount ?? img.selectedUrls.length} photo
              {(img.savedCount ?? img.selectedUrls.length) === 1 ? "" : "s"}
            </div>
          ) : null}
          {editable ? (
            <OptimizerPhotoToolbar
              img={img}
              hasCanonical={hasCanonical}
              saving={saving}
              hideApproveAction={hideApproveAction}
              onToggleAdditional={onToggleAdditional}
              onRerunSearch={onRerunSearch}
              onApprove={onApprove}
              serperQuery={serperQuery}
              onSerperQueryChange={onSerperQueryChange}
              onCustomSearch={onCustomSearch}
              searchDisabled={searchDisabled}
            />
          ) : null}
        </div>
      ) : size !== "compact" && hideToolbar && done ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          Saved {img.savedCount ?? img.selectedUrls.length} photo
          {(img.savedCount ?? img.selectedUrls.length) === 1 ? "" : "s"}
        </div>
      ) : size === "compact" && editable ? (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            disabled={img.reloading}
            onClick={onToggleAdditional}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-accent disabled:opacity-50"
          >
            {img.reloading ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <RefreshCw className="h-2.5 w-2.5" />
            )}
            More
          </button>
        </div>
      ) : null}

      {!hasCanonical && (
        <p
          className={cn(
            "inline-flex items-center gap-1 text-destructive",
            size === "compact" ? "text-[10px]" : "text-xs",
          )}
        >
          <AlertCircle className={size === "compact" ? "h-2.5 w-2.5" : "h-3 w-3"} />
          Can&apos;t save — sync from Lightspeed first.
        </p>
      )}

      <div className={cn(selectedGridClass, size !== "compact" && "w-full")}>
        {img.selectedUrls.map((url) => {
          const candidate = img.candidates.find((c) => c.url === url);
          const isEnhanced = !!img.enhancedUrls?.[url];
          const displaySrc = isEnhanced
            ? img.enhancedUrls![url]
            : candidate?.thumbnailUrl ?? url;
          const fullSrc = isEnhanced ? img.enhancedUrls![url] : url;
          const primary = url === img.primaryUrl;
          const isEnhancing = (img.enhancingUrls ?? []).includes(url);
          const displayLoaded = !!loadedDisplaySrcs[displaySrc];
          const showEnhanceOverlay = isEnhancing || (isEnhanced && !displayLoaded);
          return (
            <div
              key={url}
              role="button"
              tabIndex={0}
              aria-label="View full image"
              onClick={() => onLightbox(fullSrc)}
              onKeyDown={(e) => e.key === "Enter" && onLightbox(fullSrc)}
              className={cn(
                thumbClass,
                size !== "compact" && "cursor-zoom-in",
                primary
                  ? size === "compact"
                    ? "border-primary ring-1 ring-primary"
                    : "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                  : "border-border",
              )}
            >
              <Image
                src={displaySrc}
                alt=""
                fill
                unoptimized
                className="object-cover"
                onLoad={() => {
                  setLoadedDisplaySrcs((prev) =>
                    prev[displaySrc] ? prev : { ...prev, [displaySrc]: true },
                  );
                  if (isEnhanced) {
                    onEnhanceDisplayReady?.(url);
                  }
                }}
              />
              {primary && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
                  <Star className="h-2.5 w-2.5 fill-current" />
                  Primary
                </span>
              )}
              {showEnhanceOverlay && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {editable && !showEnhanceOverlay && (
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
            <p
              className={cn(
                "text-center text-muted-foreground",
                size === "compact" ? "text-[10px]" : "text-xs",
              )}
            >
              No more candidates.
            </p>
          ) : (
            <>
              {size !== "compact" ? (
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    More candidates
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <div className={extraScrollClass}>
                <div className={extraGridClass}>
                {extra.map((c) => {
                  const atMax = img.selectedUrls.length >= MAX_SELECTED_IMAGES;
                  return (
                    <div
                      key={c.url}
                      className={cn(
                        "group overflow-hidden rounded-md border border-dashed border-border bg-muted/50",
                        size === "compact"
                          ? "relative h-12 w-12 shrink-0"
                          : "relative aspect-square w-full min-w-0",
                      )}
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
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function OptimizerSerperQueryField({
  value,
  onChange,
  onSearch,
  disabled = false,
  className,
}: {
  value: string;
  onChange: (query: string) => void;
  onSearch: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 max-w-full items-center gap-1 sm:max-w-xs", className)}>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !disabled && value.trim()) {
            event.preventDefault();
            onSearch();
          }
        }}
        placeholder="Serper image search"
        disabled={disabled}
        className="h-8 min-w-0 flex-1 rounded-md text-xs"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || !value.trim()}
        onClick={onSearch}
        title="Search with custom query"
      >
        <Search className="size-4" />
      </Button>
    </div>
  );
}

export function OptimizerPhotoToolbar({
  img,
  hasCanonical,
  saving,
  hideApproveAction = false,
  showMoreImages = true,
  onToggleAdditional,
  onRerunSearch,
  onApprove,
  className,
  serperQuery,
  onSerperQueryChange,
  onCustomSearch,
  searchDisabled = false,
}: {
  img: ImageRun;
  hasCanonical: boolean;
  saving: boolean;
  hideApproveAction?: boolean;
  showMoreImages?: boolean;
  onToggleAdditional: () => void;
  onRerunSearch?: () => void;
  onApprove: () => void;
  className?: string;
  serperQuery?: string;
  onSerperQueryChange?: (query: string) => void;
  onCustomSearch?: () => void;
  searchDisabled?: boolean;
}) {
  const showSerperQuery = Boolean(onCustomSearch && onSerperQueryChange);

  return (
    <div className={cn("flex flex-wrap items-center justify-end gap-1.5", className)}>
      {showSerperQuery ? (
        <OptimizerSerperQueryField
          value={serperQuery ?? ""}
          onChange={onSerperQueryChange!}
          onSearch={onCustomSearch!}
          disabled={searchDisabled || img.reloading}
        />
      ) : null}
      {showMoreImages ? (
        <Button type="button" size="sm" variant="outline" disabled={img.reloading} onClick={onToggleAdditional}>
          {img.reloading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {img.showAdditional ? "Hide more" : "More images"}
        </Button>
      ) : null}
      {!hideApproveAction ? (
        <>
          {onRerunSearch ? (
            <Button type="button" size="sm" disabled={searchDisabled} onClick={onRerunSearch}>
              <Search className="size-4" />
              Rerun search
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={saving || !hasCanonical} onClick={onApprove}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Approve ({img.selectedUrls.length})
          </Button>
        </>
      ) : null}
    </div>
  );
}
