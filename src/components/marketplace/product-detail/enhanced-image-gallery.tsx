"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from '@/components/layout/app-sidebar/dashboard-icons';
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
  /** Hide count / nav controls on desktop while another overlay (e.g. category menu) is open. */
  suppressHeroControlsOnDesktop?: boolean;
}

export function EnhancedImageGallery({
  images,
  productName,
  currentIndex,
  onIndexChange,
  sidePanel,
  heroOverlay,
  suppressHeroControlsOnDesktop = false,
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

  const handlePrev = () => {
    const next = fullscreenIndex === 0 ? images.length - 1 : fullscreenIndex - 1;
    setFullscreenIndex(next);
    onIndexChange(next);
  };

  const handleNext = () => {
    const next = fullscreenIndex === images.length - 1 ? 0 : fullscreenIndex + 1;
    setFullscreenIndex(next);
    onIndexChange(next);
  };

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
  }, [isFullscreen, fullscreenIndex]);

  // Lock page scroll while the lightbox is open.
  React.useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isFullscreen]);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-100 h-[400px]">
        <p className="text-gray-500">No images available</p>
      </div>
    );
  }

  const heroFrameClassName = "rounded-md";

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
    <div
      onClick={() => openFullscreen(index)}
      className={cn(
        "relative bg-gray-100 overflow-hidden cursor-pointer transition-all duration-200",
        className
      )}
    >
      <Image
        src={src}
        alt={`${productName} - Image ${index + 1}`}
        fill
        unoptimized={!isOptimizableHost(src)}
        className="object-cover"
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
    </div>
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

  const heroOverlayControlClassName = cn(
    "z-10",
    suppressHeroControlsOnDesktop &&
      "lg:z-0 lg:opacity-0 lg:pointer-events-none transition-opacity duration-200",
  );

  const heroAspectClassName =
    images.length > 1 ? "aspect-[4/3] sm:aspect-[4/2.85]" : "aspect-[4/3]";

  const renderImageCarousel = ({
    mobileSquare = false,
  }: {
    mobileSquare?: boolean;
  } = {}) => (
    <div
      className={cn(
        "relative bg-gray-100 overflow-hidden",
        mobileSquare ? "aspect-square rounded-md" : cn(heroAspectClassName, heroFrameClassName),
      )}
    >
      <div
        key={currentIndex}
        className="absolute inset-0 cursor-pointer"
        onClick={() => openFullscreen(currentIndex)}
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
          className="object-cover"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 60vw, 800px"
          priority={currentIndex === 0}
          quality={85}
        />
      </div>

      <span
        className={cn(
          "absolute top-3 left-3 flex h-8 items-center rounded-full px-2.5 text-xs font-medium tabular-nums sm:hidden",
          heroOverlayControlClassName,
          heroFloatingControlClassName,
        )}
      >
        {currentIndex + 1} / {images.length}
      </span>

      <div className={cn("absolute top-3 left-3 hidden items-center gap-2 sm:flex", heroOverlayControlClassName)}>
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

      <div className={cn("absolute bottom-3 left-1/2 flex -translate-x-1/2 sm:hidden", heroOverlayControlClassName)}>
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
                "rounded-full transition-all",
                index === currentIndex
                  ? "h-2 w-6 bg-white shadow-sm"
                  : "h-2 w-2 bg-white/60 hover:bg-white/90",
              )}
              aria-label={`View image ${index + 1}`}
              aria-current={index === currentIndex}
            />
          ))}
        </div>
      </div>

      {renderThumbnailStrip({ overlay: true })}
    </div>
  );

  const scrollThumbnailStrip = (direction: "left" | "right") => {
    const strip = thumbnailStripRef.current;
    if (!strip) return;
    const amount = direction === "right" ? 240 : -240;
    strip.scrollBy({ left: amount, behavior: "smooth" });
  };

  const renderThumbnailStrip = ({ overlay = false }: { overlay?: boolean } = {}) => {
    if (images.length <= 1) return null;

    return (
      <div
        ref={thumbnailStripRef}
        className={cn(
          overlay
            ? cn(
                "absolute bottom-5 left-1/2 hidden w-full max-w-[calc(100%-2rem)] -translate-x-1/2 sm:flex sm:justify-center sm:gap-2",
                heroOverlayControlClassName,
              )
            : "relative mt-3 hidden sm:block",
        )}
      >
        <div
          className={cn(
            "flex gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            overlay ? "justify-center pb-0" : "pr-11 pb-1",
          )}
        >
          {images.map((image, index) => (
            <button
              key={index}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onIndexChange(index);
              }}
              className={cn(
                "relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md transition-all",
                overlay && "shadow-md",
                index === currentIndex
                  ? "border-2 border-gray-900 ring-2 ring-white"
                  : overlay
                    ? "border-2 border-white opacity-90 hover:opacity-100"
                    : "border-2 border-transparent opacity-80 hover:opacity-100",
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

        {!overlay && images.length > 4 ? (
          <button
            type="button"
            onClick={() => scrollThumbnailStrip("right")}
            className={cn(
              "absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50",
              heroOverlayControlClassName,
            )}
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
    mobileSquare = false,
  }: {
    heroRefProp?: React.Ref<HTMLDivElement>;
    mobileSquare?: boolean;
  } = {}) => (
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
    </div>
  );

  const renderFullscreenModal = () => {
    if (!isFullscreen || !mounted) return null;

    return createPortal(
      <>
        <div
          className="fixed inset-0 z-[100] bg-black"
          onClick={() => setIsFullscreen(false)}
        />
        <div
          className="fixed inset-0 z-[101] flex items-center justify-center p-4"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="relative h-full max-h-[90vh] w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
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
            onClick={() => setIsFullscreen(false)}
            className="absolute right-4 top-4 rounded-full bg-white p-2 shadow-lg transition-colors hover:bg-gray-100"
          >
            <X className="h-6 w-6 text-gray-900" />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 shadow-lg transition-colors hover:bg-white"
              >
                <ChevronLeft className="h-6 w-6 text-gray-900" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-3 shadow-lg transition-colors hover:bg-white"
              >
                <ChevronRight className="h-6 w-6 text-gray-900" />
              </button>
            </>
          )}

          <div className="absolute bottom-4 left-1/2 flex max-w-[90vw] -translate-x-1/2 gap-2 overflow-x-auto rounded-lg bg-black/50 p-2 backdrop-blur-sm">
            {images.map((image, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenIndex(index);
                }}
                className={cn(
                  "relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border-2 transition-all",
                  index === fullscreenIndex
                    ? "border-white"
                    : "border-transparent opacity-60 hover:opacity-100"
                )}
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

          <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/90 px-4 py-2 text-sm font-medium backdrop-blur-sm">
            {fullscreenIndex + 1} / {images.length}
          </div>
        </div>
      </>,
      document.body,
    );
  };

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
            {renderHeroBlock()}
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
        {renderHeroBlock()}
      </div>

      {renderFullscreenModal()}
    </>
  );
}
