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
  
  const currentProduct = products[currentIndex];
  const x = useMotionValue(0);
  
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
    <div className="min-h-screen bg-gray-50 pt-20 pb-20">
      {/* Progress Header */}
      <div className="sticky top-16 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
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
              className="h-full bg-gray-900"
              initial={{ width: 0 }}
              animate={{ width: `${((currentIndex + 1) / products.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Quick Nav Dots (mobile) */}
          <div className="flex items-center justify-center gap-1.5 mt-3 sm:hidden">
            {products.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  setDirection(index > currentIndex ? 1 : -1);
                  setCurrentIndex(index);
                }}
                className={cn(
                  "h-2 rounded-full transition-all",
                  index === currentIndex
                    ? "w-6 bg-gray-900"
                    : "w-2 bg-gray-300"
                )}
                aria-label={`Go to product ${index + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Carousel Container */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="relative overflow-hidden">
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
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.2}
              onDragEnd={handleDragEnd}
              className="cursor-grab active:cursor-grabbing"
            >
              {renderProduct(currentProduct, handleChange)}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between gap-3 mt-6">
          {/* Back/Previous */}
          <div className="flex gap-2">
            {currentIndex === 0 && onBack ? (
              <Button
                variant="outline"
                onClick={onBack}
                className="rounded-md"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            ) : currentIndex > 0 ? (
              <Button
                variant="outline"
                onClick={handlePrevious}
                className="rounded-md"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            ) : (
              <div />
            )}
          </div>

          {/* Next/Finish */}
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

        {/* Keyboard Hints (desktop only) */}
        <div className="hidden sm:flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-1 bg-gray-100 rounded-md border border-gray-300">←</kbd>
            Previous
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-2 py-1 bg-gray-100 rounded-md border border-gray-300">→</kbd>
            Next
          </span>
        </div>
      </div>
    </div>
  );
}

