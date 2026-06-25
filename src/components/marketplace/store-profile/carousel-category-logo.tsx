"use client";

import * as React from "react";
import { MoveHorizontal } from "lucide-react";
import {
  ImagePlus,
  Loader2 as SpinnerIcon,
} from "@/components/layout/app-sidebar/dashboard-icons";
import { cn } from "@/lib/utils";

export const DEFAULT_CAROUSEL_LOGO_MAX_WIDTH = 96;
export const MIN_CAROUSEL_LOGO_MAX_WIDTH = 48;
export const MAX_CAROUSEL_LOGO_MAX_WIDTH = 200;

type CarouselCategoryLogoProps = {
  alt: string;
  logoUrl: string;
  logoMaxWidth?: number | null;
  isEditable?: boolean;
  uploading?: boolean;
  savingSize?: boolean;
  onUploadClick?: () => void;
  onLogoMaxWidthChange?: (width: number) => Promise<void> | void;
  className?: string;
};

function clampLogoMaxWidth(width: number) {
  return Math.round(
    Math.min(
      MAX_CAROUSEL_LOGO_MAX_WIDTH,
      Math.max(MIN_CAROUSEL_LOGO_MAX_WIDTH, width),
    ),
  );
}

export function resolveCarouselLogoMaxWidth(
  logoMaxWidth?: number | null,
): number {
  if (
    typeof logoMaxWidth === "number" &&
    Number.isFinite(logoMaxWidth) &&
    logoMaxWidth > 0
  ) {
    return clampLogoMaxWidth(logoMaxWidth);
  }
  return DEFAULT_CAROUSEL_LOGO_MAX_WIDTH;
}

export function CarouselCategoryLogo({
  alt,
  logoUrl,
  logoMaxWidth,
  isEditable = false,
  uploading = false,
  savingSize = false,
  onUploadClick,
  onLogoMaxWidthChange,
  className,
}: CarouselCategoryLogoProps) {
  const [maxWidth, setMaxWidth] = React.useState(() =>
    resolveCarouselLogoMaxWidth(logoMaxWidth),
  );
  const [isResizing, setIsResizing] = React.useState(false);
  const dragStartRef = React.useRef<{ x: number; width: number } | null>(null);
  const maxWidthRef = React.useRef(maxWidth);
  const isResizingRef = React.useRef(false);

  React.useEffect(() => {
    const next = resolveCarouselLogoMaxWidth(logoMaxWidth);
    setMaxWidth(next);
    maxWidthRef.current = next;
  }, [logoMaxWidth]);

  React.useEffect(() => {
    maxWidthRef.current = maxWidth;
  }, [maxWidth]);

  const persistWidth = React.useCallback(
    async (width: number) => {
      if (!onLogoMaxWidthChange) return;
      await onLogoMaxWidthChange(clampLogoMaxWidth(width));
    },
    [onLogoMaxWidthChange],
  );

  const finishResize = React.useCallback(() => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    setIsResizing(false);
    dragStartRef.current = null;
    void persistWidth(maxWidthRef.current);
  }, [persistWidth]);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    isResizingRef.current = true;
    setIsResizing(true);
    dragStartRef.current = { x: event.clientX, width: maxWidthRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleResizePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isResizingRef.current || !dragStartRef.current) return;
    const delta = event.clientX - dragStartRef.current.x;
    const next = clampLogoMaxWidth(dragStartRef.current.width + delta);
    setMaxWidth(next);
    maxWidthRef.current = next;
  };

  const handleResizePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishResize();
  };

  React.useEffect(() => {
    if (!isResizing) return;

    const handleWindowPointerUp = () => finishResize();

    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    return () => {
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [finishResize, isResizing]);

  return (
    <div
      className={cn(
        "group relative h-8 flex-shrink-0 inline-flex items-center",
        isResizing && "select-none",
        className,
      )}
    >
      <img
        src={logoUrl}
        alt={alt}
        draggable={false}
        style={{ maxWidth: `${maxWidth}px` }}
        className="h-full w-auto object-contain rounded-sm"
      />

      {isEditable && (
        <>
          <button
            type="button"
            onClick={onUploadClick}
            className={cn(
              "absolute inset-y-0 left-0 right-4 flex items-center justify-center rounded bg-white/70 transition-opacity cursor-pointer",
              isResizing ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100",
            )}
            title="Change logo"
          >
            {uploading ? (
              <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-gray-600" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5 text-gray-600" />
            )}
          </button>

          <button
            type="button"
            aria-label="Resize logo"
            title="Drag to resize logo"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            onPointerCancel={handleResizePointerUp}
            className={cn(
              "absolute -right-1 top-1/2 z-10 flex h-6 w-5 -translate-y-1/2 items-center justify-center rounded-md border border-gray-200 bg-white shadow-sm transition-opacity cursor-ew-resize",
              isResizing ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          >
            {savingSize ? (
              <SpinnerIcon className="h-3 w-3 animate-spin text-gray-500" />
            ) : (
              <MoveHorizontal className="h-3 w-3 text-gray-500" />
            )}
          </button>
        </>
      )}
    </div>
  );
}
