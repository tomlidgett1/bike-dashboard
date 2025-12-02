"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, Heart } from "lucide-react";
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
  onLikeToggle?: () => void;
  isLiked?: boolean;
}

export function EnhancedImageGallery({
  images,
  productName,
  currentIndex,
  onIndexChange,
  onLikeToggle,
  isLiked = false,
}: EnhancedImageGalleryProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [fullscreenIndex, setFullscreenIndex] = React.useState(0);

  const handlePrev = () => {
    setFullscreenIndex(fullscreenIndex === 0 ? images.length - 1 : fullscreenIndex - 1);
  };

  const handleNext = () => {
    setFullscreenIndex(fullscreenIndex === images.length - 1 ? 0 : fullscreenIndex + 1);
  };

  const openFullscreen = (index: number) => {
    setFullscreenIndex(index);
    setIsFullscreen(true);
  };

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

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded-xl h-[400px]">
        <p className="text-gray-500">No images available</p>
      </div>
    );
  }

  // Reusable grid image component
  const GridImage = ({ 
    src, 
    index, 
    className,
    showOverlay = false,
    overlayCount = 0
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
        "relative bg-gray-100 rounded-xl overflow-hidden cursor-pointer transition-all duration-200 border border-gray-200",
        className
      )}
    >
      <Image
        src={src}
        alt={`${productName} - Image ${index + 1}`}
        fill
        className="object-cover"
        sizes="(max-width: 1024px) 50vw, 33vw"
      />
      {showOverlay && overlayCount > 0 && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <span className="text-white text-2xl font-semibold">+{overlayCount} more</span>
        </div>
      )}
    </div>
  );

  // Render grid based on image count
  const renderImageGrid = () => {
    const count = images.length;

    // 1 image: Single full-width image
    if (count === 1) {
      return (
        <div className="aspect-[4/3]">
          <GridImage src={images[0]} index={0} className="w-full h-full" />
        </div>
      );
    }

    // 2 images: Two images stacked vertically
    if (count === 2) {
      return (
        <div className="flex flex-col gap-2">
          <div className="aspect-[4/3]">
            <GridImage src={images[0]} index={0} className="w-full h-full" />
          </div>
          <div className="aspect-[4/3]">
            <GridImage src={images[1]} index={1} className="w-full h-full" />
          </div>
        </div>
      );
    }

    // 3 images: First row: 1 large, Second row: 2 squares
    if (count === 3) {
      return (
        <div className="flex flex-col gap-2">
          {/* First row: 1 large image */}
          <div className="aspect-[4/3]">
            <GridImage src={images[0]} index={0} className="w-full h-full" />
          </div>
          {/* Second row: 2 squares */}
          <div className="grid grid-cols-2 gap-2">
            <div className="aspect-square">
              <GridImage src={images[1]} index={1} className="w-full h-full" />
            </div>
            <div className="aspect-square">
              <GridImage src={images[2]} index={2} className="w-full h-full" />
            </div>
          </div>
        </div>
      );
    }

    // 4 images: First row: 1 large, Second row: 3 squares
    if (count === 4) {
      return (
        <div className="flex flex-col gap-2">
          {/* First row: 1 large image */}
          <div className="aspect-[4/3]">
            <GridImage src={images[0]} index={0} className="w-full h-full" />
          </div>
          {/* Second row: 3 squares */}
          <div className="grid grid-cols-3 gap-2">
            <div className="aspect-square">
              <GridImage src={images[1]} index={1} className="w-full h-full" />
            </div>
            <div className="aspect-square">
              <GridImage src={images[2]} index={2} className="w-full h-full" />
            </div>
            <div className="aspect-square">
              <GridImage src={images[3]} index={3} className="w-full h-full" />
            </div>
          </div>
        </div>
      );
    }

    // 5+ images: First row: 1 large, Second row: 3 squares (with +X more overlay on last)
    const extraCount = count > 4 ? count - 4 : 0;
    
    return (
      <div className="flex flex-col gap-2">
        {/* First row: 1 large image */}
        <div className="aspect-[4/3]">
          <GridImage src={images[0]} index={0} className="w-full h-full" />
        </div>
        {/* Second row: 3 squares */}
        <div className="grid grid-cols-3 gap-2">
          <div className="aspect-square">
            <GridImage src={images[1]} index={1} className="w-full h-full" />
          </div>
          <div className="aspect-square">
            <GridImage src={images[2]} index={2} className="w-full h-full" />
          </div>
          <div className="aspect-square">
            <GridImage 
              src={images[3]} 
              index={3} 
              className="w-full h-full"
              showOverlay={extraCount > 0}
              overlayCount={extraCount}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Main Gallery Grid */}
      <div className="relative">
        {renderImageGrid()}

        {/* Like Button - Top Left of first image */}
        {onLikeToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLikeToggle();
            }}
            className="absolute top-3 left-3 p-2.5 bg-white rounded-full shadow-md hover:shadow-lg transition-all z-10"
          >
            <Heart
              className={cn(
                "h-5 w-5 transition-colors",
                isLiked ? "fill-red-500 stroke-red-500" : "stroke-gray-700"
              )}
            />
          </button>
        )}
      </div>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black z-[100]"
              onClick={() => setIsFullscreen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-[101] flex items-center justify-center p-4"
              onClick={() => setIsFullscreen(false)}
            >
              <div className="relative w-full h-full max-w-5xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <Image
                  src={images[fullscreenIndex]}
                  alt={`${productName} - Fullscreen`}
                  fill
                  className="object-contain"
                  sizes="100vw"
                />
              </div>

              {/* Close Button */}
              <button
                onClick={() => setIsFullscreen(false)}
                className="absolute top-4 right-4 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100 transition-colors"
              >
                <X className="h-6 w-6 text-gray-900" />
              </button>

              {/* Navigation in Fullscreen */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrev();
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/90 rounded-full shadow-lg hover:bg-white transition-colors"
                  >
                    <ChevronLeft className="h-6 w-6 text-gray-900" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNext();
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/90 rounded-full shadow-lg hover:bg-white transition-colors"
                  >
                    <ChevronRight className="h-6 w-6 text-gray-900" />
                  </button>
                </>
              )}

              {/* Thumbnail Strip in Fullscreen */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-black/50 backdrop-blur-sm p-2 rounded-lg max-w-[90vw] overflow-x-auto">
                {images.map((image, index) => (
                  <button
                    key={index}
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
                  >
                    <Image
                      src={image}
                      alt={`Thumbnail ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="48px"
                    />
                  </button>
                ))}
              </div>

              {/* Counter in Fullscreen */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium">
                {fullscreenIndex + 1} / {images.length}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
