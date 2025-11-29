"use client";

import * as React from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, Heart } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Enhanced Image Gallery
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
  const [imageError, setImageError] = React.useState(false);

  const handlePrev = () => {
    onIndexChange(currentIndex === 0 ? images.length - 1 : currentIndex - 1);
  };

  const handleNext = () => {
    onIndexChange(currentIndex === images.length - 1 ? 0 : currentIndex + 1);
  };

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, isFullscreen]);

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-100 rounded-md h-full">
        <p className="text-gray-500">No images available</p>
      </div>
    );
  }

  return (
    <>
      {/* Scrollable Image Stack */}
      <div className="w-full max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-hide">
        <div className="flex flex-col gap-3">
          {images.map((image, index) => (
            <div key={index} className="relative w-full border border-gray-200">
              <Image
                src={image}
                alt={`${productName} - Image ${index + 1}`}
                width={1200}
                height={1200}
                className="w-full h-auto"
                priority={index === 0}
                sizes="(max-width: 1024px) 100vw, 60vw"
              />
            </div>
          ))}
        </div>
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
              <div className="relative w-full h-full" onClick={(e) => e.stopPropagation()}>
                <Image
                  src={images[currentIndex]}
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

              {/* Counter in Fullscreen */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium">
                {currentIndex + 1} / {images.length}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

