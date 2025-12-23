"use client";

import * as React from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ============================================================
// Bulk Product Carousel
// Swipeable carousel for reviewing and editing products
// Mobile-optimised with keyboard shortcuts for desktop
// ============================================================

interface ProductData {
  groupId: string;
  imageUrls: string[];
  suggestedName: string;
  aiData: any;
  isValid: boolean;
}

interface BulkProductCarouselProps {
  products: ProductData[];
  onUpdate: (groupId: string, data: any) => void;
  onComplete: () => void;
  onBack?: () => void;
  renderProduct: (product: ProductData, onChange: (data: any) => void) => React.ReactNode;
}

export function BulkProductCarousel({
  products,
  onUpdate,
  onComplete,
  onBack,
  renderProduct,
}: BulkProductCarouselProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [direction, setDirection] = React.useState(0);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);
  
  const currentProduct = products[currentIndex];
  const x = useMotionValue(0);

  // Detect if on mobile
  React.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Auto-save when navigating away
  const autoSave = async () => {
    // Products are saved in real-time via onChange in BulkProductCard
    return Promise.resolve();
  };

  const handleNext = async () => {
    if (currentIndex < products.length - 1) {
      await autoSave();
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
    } else {
      // Last product - go to review
      await autoSave();
      onComplete();
    }
  };

  const handlePrevious = async () => {
    if (currentIndex > 0) {
      await autoSave();
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleDragEnd = async (event: any, info: PanInfo) => {
    const swipeThreshold = 100;
    const swipeVelocity = 500;

    if (Math.abs(info.offset.x) > swipeThreshold || Math.abs(info.velocity.x) > swipeVelocity) {
      if (info.offset.x > 0) {
        // Swiped right (go to previous)
        await handlePrevious();
      } else {
        // Swiped left (go to next)
        await handleNext();
      }
    }
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex]);

  const handleChange = (data: any) => {
    onUpdate(currentProduct.groupId, data);
  };

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  };

  const swipeConfidenceThreshold = 10000;
  const swipePower = (offset: number, velocity: number) => {
    return Math.abs(offset) * velocity;
  };

  return (
    <div className={cn("min-h-screen bg-gray-50", isMobile ? "pt-14 pb-24" : "pt-20 pb-20")}>
      {/* Progress Header */}
      <div className={cn(
        "sticky z-40 bg-white border-b border-gray-200",
        isMobile ? "top-14" : "top-16 shadow-sm"
      )}>
        <div className={cn("mx-auto", isMobile ? "px-4 py-3" : "max-w-4xl px-4 py-4")}>
          {/* Mobile: Compact header */}
          {isMobile ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs font-bold">
                  {currentIndex + 1}
                </span>
                <span className="text-sm font-medium text-gray-600">of {products.length}</span>
              </div>
              {/* Progress dots */}
              <div className="flex items-center gap-1">
                {products.slice(0, 6).map((_, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setDirection(index > currentIndex ? 1 : -1);
                      setCurrentIndex(index);
                    }}
                    className={cn(
                      "rounded-full transition-all",
                      index === currentIndex
                        ? "h-2 w-4 bg-[#FFC72C]"
                        : "h-2 w-2 bg-gray-300"
                    )}
                    aria-label={`Go to product ${index + 1}`}
                  />
                ))}
                {products.length > 6 && (
                  <span className="text-xs text-gray-400 ml-1">+{products.length - 6}</span>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">
                  Review Products
                </h2>
                <span className="text-sm text-gray-600">
                  {currentIndex + 1} of {products.length}
                </span>
              </div>
              {/* Progress Bar */}
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-[#FFC72C]"
                  initial={{ width: 0 }}
                  animate={{ width: `${((currentIndex + 1) / products.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Carousel Container */}
      <div className={cn("mx-auto", isMobile ? "px-0 pb-4" : "max-w-4xl px-4 py-6")}>
        <div className={cn("relative", !isMobile && "overflow-hidden")}>
          <AnimatePresence initial={false} custom={direction} mode="wait">
            <motion.div
              key={currentIndex}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              drag={isMobile ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={isMobile ? handleDragEnd : undefined}
              className={cn(isMobile && "cursor-grab active:cursor-grabbing")}
            >
              {renderProduct(currentProduct, handleChange)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation Buttons - Desktop only inline */}
        {!isMobile && (
          <div className="flex items-center justify-between gap-3 mt-6">
            <div className="flex gap-2">
              {currentIndex === 0 && onBack ? (
                <Button variant="outline" onClick={onBack} className="rounded-md">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              ) : currentIndex > 0 ? (
                <Button variant="outline" onClick={handlePrevious} className="rounded-md">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
              ) : (
                <div />
              )}
            </div>
            <div className="flex gap-2">
              {currentIndex < products.length - 1 ? (
                <Button
                  onClick={handleNext}
                  disabled={!currentProduct.isValid}
                  className="rounded-md bg-gray-900 hover:bg-gray-800"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={onComplete}
                  disabled={!currentProduct.isValid || isSaving}
                  className="rounded-md bg-gray-900 hover:bg-gray-800"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Review All
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Keyboard Hints (desktop only) */}
        {!isMobile && (
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-gray-100 rounded-md border border-gray-300">←</kbd>
              Previous
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-2 py-1 bg-gray-100 rounded-md border border-gray-300">→</kbd>
              Next
            </span>
          </div>
        )}
      </div>

      {/* Mobile Fixed Bottom Navigation */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40">
          <div className="flex gap-3">
            {currentIndex > 0 ? (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="rounded-xl h-12 px-4"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : onBack ? (
              <Button
                variant="outline"
                onClick={onBack}
                className="rounded-xl h-12 px-4"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            ) : null}
            
            {currentIndex < products.length - 1 ? (
              <Button
                onClick={handleNext}
                disabled={!currentProduct.isValid}
                className="flex-1 rounded-xl h-12 bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
              >
                Next Product
                <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={onComplete}
                disabled={!currentProduct.isValid || isSaving}
                className="flex-1 rounded-xl h-12 bg-[#FFC72C] hover:bg-[#E6B328] text-gray-900 font-semibold disabled:opacity-40"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-5 w-5 mr-2" />
                    Review All
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

