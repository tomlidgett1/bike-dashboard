"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from '@/components/layout/app-sidebar/dashboard-icons';
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ============================================================
// Enhanced Image Gallery
// Grid layout based on image count:
// - 1 image: Single full-width image
// - 2 images: Two images stacked vertically
// - 3 images: First row: 1 large, Second row: 2 squares
// - 4 images: First row: 1 large, Second row: 3 squares
// - 5+ images: First row: 1 large, Second row: 3 squares (with +X more overlay)
// ============================================================

interface EnhancedImageGalleryProps {
  images: string[];
  productName: string;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  /** Desktop only: place panel beside the main hero image (matched height). */
  sidePanel?: React.ReactNode;
  /** Top-right overlay on the primary hero image (e.g. Ask Genie badge). */
  heroOverlay?: React.ReactNode;
}

export function EnhancedImageGallery({
  images,
  productName,
  currentIndex,
  onIndexChange,
  sidePanel,
  heroOverlay,
}: EnhancedImageGalleryProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [fullscreenIndex, setFullscreenIndex] = React.useState(0);
  const [heroHeight, setHeroHeight] = React.useState<number | undefined>();
  const touchStartXRef = React.useRef<number | null>(null);
  const heroRef = React.useRef<HTMLDivElement>(null);
  const thumbnailStripRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!sidePanel) return;
    const node = heroRef.current;
    if (!node) return;

    const updateHeight = () => {
      setHeroHeight(node.getBoundingClientRect().height);
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sidePanel, images.length]);

  // Next.js can only optimize images from hosts whitelisted in next.config.ts
  // (Cloudinary + Supabase). Raw external URLs — e.g. Serper-discovered retailer
  // images stored in product_images.external_url that haven't been uploaded to
  // Cloudinary yet — come from arbitrary hosts and would throw a "hostname not
  // configured" error. Render those directly with `unoptimized`.
  const isOptimizableHost = (src: string) =>
    src.includes("res.cloudinary.com") || src.includes("supabase.co");

  const goToPrevImage = React.useCallback(() => {
    onIndexChange(currentIndex === 0 ? images.length - 1 : currentIndex - 1);
  }, [currentIndex, images.length, onIndexChange]);

  const goToNextImage = React.useCallback(() => {
    onIndexChange(currentIndex === images.length - 1 ? 0 : currentIndex + 1);
  }, [currentIndex, images.length, onIndexChange]);

  const handlePrev = React.useCallback(() => {
    const next = fullscreenIndex === 0 ? images.length - 1 : fullscreenIndex - 1;
    setFullscreenIndex(next);
    onIndexChange(next);
  }, [fullscreenIndex, images.length, onIndexChange]);

  const handleNext = React.useCallback(() => {
    const next = fullscreenIndex === images.length - 1 ? 0 : fullscreenIndex + 1;
    setFullscreenIndex(next);
    onIndexChange(next);
  }, [fullscreenIndex, images.length, onIndexChange]);

  const openFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setIsFullscreen(true);
  };

  React.useEffect(() => {
    if (images.length <= 1) return;
    const strip = thumbnailStripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('[aria-current="true"]');
    active?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [currentIndex, images.length]);

  // Keyboard navigation for fullscreen
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape") setIsFullscreen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, isFullscreen]);

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-100 h-[400px]">
        <p className="text-gray-500">No images available</p>
      </div>
    );
  }

  const heroFrameClassName = "rounded-md border border-gray-200";

  // Reusable grid image component
  const GridImage = ({
    src, 
    index, 
    className,
    showOverlay = false,
    overlayCount = 0,
  }: { 
    src: string; 
    index: number; 
    className?: string;
    showOverlay?: boolean;
    overlayCount?: number;
  }) => (
    <button
      type="button"
      onClick={() => openFullscreen(index)}
      className={cn(
        "relative block bg-white overflow-hidden cursor-zoom-in transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2",
        className
      )}
      aria-label={`Open image ${index + 1} of ${images.length} in full screen`}
    >
      <Image
        src={src}
        alt={`${productName} - Image ${index + 1}`}
        fill
        unoptimized={!isOptimizableHost(src)}
        className="object-contain"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px"
        priority={index < 2} // Prioritize first 2 images for faster LCP
        placeholder="blur"
        blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2YzZjRmNiIvPjwvc3ZnPg=="
        quality={80} // Slightly lower quality for faster loading
      />
      {showOverlay && overlayCount > 0 && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <span className="text-white text-2xl font-semibold">+{overlayCount} more</span>
        </div>
      )}
    </button>
  );

  const handleCarouselTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX == null) return;

    const endX = event.changedTouches[0]?.clientX;
    if (typeof endX !== "number") return;

    const swipeThreshold = 50;
    const offsetX = endX - startX;
    if (Math.abs(offsetX) > swipeThreshold) {
      if (offsetX > 0) {
        goToPrevImage();
      } else {
        goToNextImage();
      }
    }
  };

  const heroFloatingControlClassName =
    "border border-black/5 bg-white/80 text-gray-800 shadow-sm backdrop-blur-md";

  const renderImageCarousel = ({
    mobileSquare = false,
  }: {
    mobileSquare?: boolean;
  } = {}) => (
    <div
      className={cn(
        "relative bg-gray-100 overflow-hidden",
        mobileSquare ? "aspect-square rounded-md" : cn("aspect-[4/3]", heroFrameClassName),
      )}
    >
      <div
        key={currentIndex}
        className="absolute inset-0 cursor-zoom-in"
        role="button"
        tabIndex={0}
        aria-label={`Open image ${currentIndex + 1} of ${images.length} in full screen`}
        onClick={() => openFullscreen(currentIndex)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openFullscreen(currentIndex);
          }
        }}
        onTouchStart={(event) => {
          touchStartXRef.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={handleCarouselTouchEnd}
      >
        <Image
          src={images[currentIndex]}
          alt={`${productName} - Image ${currentIndex + 1}`}
          fill
          unoptimized={!isOptimizableHost(images[currentIndex])}
          className="object-contain"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px"
          priority={currentIndex === 0}
          quality={85}
        />
      </div>

      <span
        className={cn(
          "absolute top-3 left-3 z-10 flex h-8 items-center rounded-full px-2.5 text-xs font-medium tabular-nums sm:hidden",
          heroFloatingControlClassName,
        )}
      >
        {currentIndex + 1} / {images.length}
      </span>

      <div className="absolute top-3 left-3 z-10 hidden items-center gap-2 sm:flex">
        <span
          className={cn(
            "flex h-8 items-center rounded-full px-2.5 text-xs font-medium tabular-nums",
            heroFloatingControlClassName,
          )}
        >
          {currentIndex + 1} / {images.length}
        </span>
        {images.length > 1 ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goToNextImage();
            }}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white",
              heroFloatingControlClassName,
            )}
            aria-label="Next image"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 sm:hidden">
        {images.length <= 8 ? (
          <div className="flex items-center gap-1.5">
            {images.map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onIndexChange(index);
                }}
                className={cn(
                  "rounded-md transition-all",
                  index === currentIndex
                    ? "h-2 w-6 bg-white shadow-sm"
                    : "h-2 w-2 bg-white/60 hover:bg-white/90",
                )}
                aria-label={`View image ${index + 1}`}
                aria-current={index === currentIndex}
              />
            ))}
          </div>
        ) : (
          <span className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-gray-900 shadow-sm">
            {currentIndex + 1} / {images.length}
          </span>
        )}
      </div>
      <span className="sr-only" aria-live="polite">
        Showing image {currentIndex + 1} of {images.length}
      </span>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          openFullscreen(currentIndex);
        }}
        className={cn(
          "absolute bottom-3 right-3 z-10 hidden h-8 items-center rounded-md px-3 text-xs font-medium transition-colors hover:bg-white sm:flex",
          heroFloatingControlClassName,
        )}
        aria-label={`View all ${images.length} product photos`}
      >
        View all {images.length} {images.length === 1 ? "photo" : "photos"}
      </button>
    </div>
  );

  const scrollThumbnailStrip = (direction: "left" | "right") => {
    const strip = thumbnailStripRef.current;
    if (!strip) return;
    const amount = direction === "right" ? 240 : -240;
    strip.scrollBy({ left: amount, behavior: "smooth" });
  };

  const renderThumbnailStrip = () => {
    if (images.length <= 1) return null;

    return (
      <div className="relative mt-3 hidden sm:block">
        <div
          ref={thumbnailStripRef}
          className="flex gap-2 overflow-x-auto scroll-smooth pb-1 pr-11 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={() => onIndexChange(index)}
              className={cn(
                "relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md transition-all",
                index === currentIndex
                  ? "border-2 border-gray-900"
                  : "border-2 border-transparent",
              )}
              aria-label={`View image ${index + 1}`}
              aria-current={index === currentIndex}
            >
              <Image
                src={image}
                alt={`${productName} thumbnail ${index + 1}`}
                fill
                unoptimized={!isOptimizableHost(image)}
                className="object-cover"
                sizes="72px"
                quality={60}
              />
            </button>
          ))}
        </div>

        {images.length > 4 ? (
          <button
            type="button"
            onClick={() => scrollThumbnailStrip("right")}
            className="absolute right-0 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            aria-label="Scroll thumbnails right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    );
  };

  const renderHeroBlock = ({
    heroRefProp,
    showThumbnails = false,
    mobileSquare = false,
  }: {
    heroRefProp?: React.Ref<HTMLDivElement>;
    showThumbnails?: boolean;
    mobileSquare?: boolean;
  }) => (
    <div className={cn("relative", mobileSquare && "px-4 pt-4")}>
      <div ref={heroRefProp} className="relative">
        {images.length === 1 ? (
          <div
            className={cn(
              mobileSquare ? "aspect-square" : "aspect-[4/3]",
            )}
          >
            <GridImage
              src={images[0]}
              index={0}
              className={cn(
                "h-full w-full",
                mobileSquare ? "rounded-md" : heroFrameClassName,
              )}
            />
          </div>
        ) : (
          renderImageCarousel({ mobileSquare })
        )}
        {renderHeroOverlays()}
      </div>
      {showThumbnails && renderThumbnailStrip()}
    </div>
  );

  const renderFullscreenModal = () => (
    <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[100] bg-black/90 animate-in fade-in duration-200"
        className="z-[101] h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden rounded-md bg-black p-0 ring-0 animate-in slide-in-from-bottom-4 zoom-in-95 duration-300 ease-out sm:max-w-none"
      >
        <DialogTitle className="sr-only">{productName} image gallery</DialogTitle>
        <div className="relative flex h-full w-full items-center justify-center p-4">
          <div className="relative h-full max-h-[90vh] w-full max-w-5xl">
            <Image
              src={images[fullscreenIndex]}
              alt={`${productName} - Fullscreen`}
              fill
              unoptimized={!isOptimizableHost(images[fullscreenIndex])}
              className="object-contain"
              sizes="100vw"
              priority
              quality={90}
            />
          </div>

          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 rounded-md bg-white p-2 shadow-lg transition-colors hover:bg-gray-100"
            aria-label="Close image gallery"
          >
            <X className="h-6 w-6 text-gray-900" />
          </button>

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-md bg-white/90 p-3 shadow-lg transition-colors hover:bg-white"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6 text-gray-900" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-md bg-white/90 p-3 shadow-lg transition-colors hover:bg-white"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6 text-gray-900" />
              </button>
            </>
          )}

          <div className="absolute bottom-4 left-1/2 flex max-w-[90vw] -translate-x-1/2 gap-2 overflow-x-auto rounded-md bg-black/50 p-2 backdrop-blur-sm">
            {images.map((image, index) => (
              <button
                key={index}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenIndex(index);
                }}
                className={cn(
                  "relative w-12 h-12 rounded-md overflow-hidden border-2 transition-all flex-shrink-0",
                  index === fullscreenIndex
                    ? "border-white"
                    : "border-transparent opacity-60 hover:opacity-100"
                )}
                aria-label={`View image ${index + 1}`}
                aria-current={index === fullscreenIndex}
              >
                <Image
                  src={image}
                  alt={`Thumbnail ${index + 1}`}
                  fill
                  unoptimized={!isOptimizableHost(image)}
                  className="object-cover"
                  sizes="48px"
                  quality={60}
                />
              </button>
            ))}
          </div>

          <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-md bg-white/90 px-4 py-2 text-sm font-medium backdrop-blur-sm">
            {fullscreenIndex + 1} / {images.length}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );

  const renderHeroOverlay = () =>
    heroOverlay ? (
      <div className="pointer-events-none absolute top-3 right-3 z-20 sm:hidden">
        <div className="pointer-events-auto">{heroOverlay}</div>
      </div>
    ) : null;

  const renderHeroOverlays = () => renderHeroOverlay();

  if (sidePanel) {
    return (
      <>
        {/* Mobile / tablet: stacked gallery + panel */}
        <div className="lg:hidden">
          <div className="sm:hidden">
            {renderHeroBlock({ mobileSquare: true })}
          </div>

          <div className="hidden sm:block">
            {renderHeroBlock({ showThumbnails: images.length > 1 })}
          </div>

          <div
            className="h-4 bg-gradient-to-b from-white to-gray-50"
            aria-hidden="true"
          />

          {sidePanel}
        </div>

        {/* Desktop: info panel locked to hero height */}
        <div className="hidden lg:flex lg:items-start lg:gap-x-3 xl:gap-x-4">
          <div className="min-w-0 w-[62%]">
            {renderHeroBlock({
              heroRefProp: heroRef,
              showThumbnails: images.length > 1,
            })}
          </div>

          <div
            className="min-w-0 w-[38%] shrink-0 overflow-hidden"
            style={heroHeight ? { height: heroHeight } : undefined}
          >
            {sidePanel}
          </div>
        </div>

        {renderFullscreenModal()}
      </>
    );
  }

  return (
    <>
      <div className="sm:hidden">
        {renderHeroBlock({ mobileSquare: true })}
      </div>

      <div className="hidden sm:block">
        {renderHeroBlock({ showThumbnails: images.length > 1 })}
      </div>

      {renderFullscreenModal()}
    </>
  );
}
