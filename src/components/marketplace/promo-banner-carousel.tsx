"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Gift, ChevronRight, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// Promo Banner Carousel
// Auto-rotating carousel with Uber delivery and First Upload promo
// ============================================================

interface PromoBannerCarouselProps {
  /** Whether the user has uploaded any products */
  hasListings: boolean;
  /** Whether the user is logged in */
  isLoggedIn: boolean;
  /** Callback when navigating to stores */
  onNavigateToStores?: () => void;
}

type BannerType = "uber" | "first-upload";

export function PromoBannerCarousel({ 
  hasListings, 
  isLoggedIn,
  onNavigateToStores,
}: PromoBannerCarouselProps) {
  const [isDismissed, setIsDismissed] = React.useState(false);
  const [currentBanner, setCurrentBanner] = React.useState<BannerType>("uber");
  const [direction, setDirection] = React.useState(0);

  // Determine which banners to show
  const showFirstUploadBanner = !isLoggedIn || !hasListings;
  const banners: BannerType[] = showFirstUploadBanner ? ["uber", "first-upload"] : ["uber"];

  // Check if carousel was previously dismissed (persist for session)
  React.useEffect(() => {
    const dismissed = sessionStorage.getItem('promo-carousel-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  // Navigate to next/previous banner
  const navigate = React.useCallback((newDirection: number) => {
    if (banners.length <= 1) return;
    
    setDirection(newDirection);
    setCurrentBanner(prev => {
      const currentIndex = banners.indexOf(prev);
      let nextIndex: number;
      
      if (newDirection > 0) {
        // Next
        nextIndex = (currentIndex + 1) % banners.length;
      } else {
        // Previous
        nextIndex = currentIndex - 1;
        if (nextIndex < 0) nextIndex = banners.length - 1;
      }
      
      return banners[nextIndex];
    });
  }, [banners]);

  // Handle swipe
  const handleDragEnd = (_: any, info: { offset: { x: number } }) => {
    const swipeThreshold = 50;
    
    if (info.offset.x > swipeThreshold) {
      // Swiped right - go to previous
      navigate(-1);
    } else if (info.offset.x < -swipeThreshold) {
      // Swiped left - go to next
      navigate(1);
    }
  };

  // Auto-rotate every 8 seconds
  React.useEffect(() => {
    if (banners.length <= 1 || isDismissed) return;

    const interval = setInterval(() => {
      navigate(1);
    }, 8000);

    return () => clearInterval(interval);
  }, [banners, isDismissed, navigate]);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDismissed(true);
    sessionStorage.setItem('promo-carousel-dismissed', 'true');
  };

  const handleUberClick = () => {
    if (onNavigateToStores) {
      onNavigateToStores();
    }
  };

  // Determine the link destination for first upload banner
  const firstUploadHref = isLoggedIn ? "/marketplace/sell" : "/auth/signup";
  const firstUploadCta = isLoggedIn ? "List now" : "Sign up";

  if (isDismissed) {
    return null;
  }

  // Animation variants
  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  return (
    <div className="mb-4 relative overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        {/* Uber Banner */}
        {currentBanner === "uber" && (
          <motion.div
            key="uber"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            drag={banners.length > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            <div 
              onClick={handleUberClick}
              className="bg-black rounded-md px-4 py-2.5 min-h-[52px] flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-900 transition-colors group"
            >
              <div className="flex items-center gap-3">
                {/* Uber Logo */}
                <div className="flex items-center gap-2">
                  <Image 
                    src="/uber.jpg" 
                    alt="Uber" 
                    width={40} 
                    height={16}
                    quality={100}
                    className="object-contain"
                  />
                </div>
                
                {/* Divider */}
                <div className="w-px h-4 bg-gray-600" />
                
                {/* Message */}
                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-green-500" />
                  <p className="text-sm text-white">
                    <span className="font-medium">1-hour delivery</span>
                    <span className="text-gray-400 ml-1.5 hidden sm:inline">on select products from Melbourne stores</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Dots indicator */}
                {banners.length > 1 && (
                  <div className="flex items-center gap-1 mr-2">
                    {banners.map((banner) => {
                      const currentIndex = banners.indexOf(currentBanner);
                      const targetIndex = banners.indexOf(banner);
                      const dir = targetIndex > currentIndex ? 1 : -1;
                      
                      return (
                        <button
                          key={banner}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDirection(dir);
                            setCurrentBanner(banner);
                          }}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${
                            currentBanner === banner ? "bg-white" : "bg-gray-600"
                          }`}
                        />
                      );
                    })}
                  </div>
                )}
                
                {/* Shop Now indicator */}
                <span className="text-xs text-gray-400 hidden sm:inline group-hover:text-gray-300 transition-colors">Shop now</span>
                <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
                
                {/* Dismiss Button */}
                <button
                  onClick={handleDismiss}
                  className="p-1 hover:bg-gray-700 rounded transition-colors flex-shrink-0 ml-1"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4 text-gray-500 hover:text-gray-300" />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* First Upload Banner */}
        {currentBanner === "first-upload" && showFirstUploadBanner && (
          <motion.div
            key="first-upload"
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
            drag={banners.length > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            <Link href={firstUploadHref}>
              <div className="bg-yellow-500 rounded-md px-4 py-2.5 min-h-[52px] flex items-center justify-between gap-3 cursor-pointer hover:bg-yellow-600 transition-colors group">
                <div className="flex items-center gap-3">
                  {/* Gift Icon */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 bg-yellow-600 rounded-full">
                      <Gift className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  
                  {/* Divider */}
                  <div className="w-px h-4 bg-yellow-600" />
                  
                  {/* Message */}
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-yellow-950">
                      <span className="font-semibold">List your first item, get $10 off</span>
                      <span className="text-yellow-800 ml-1.5 hidden sm:inline">your next purchase</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {/* Dots indicator */}
                  {banners.length > 1 && (
                    <div className="flex items-center gap-1 mr-2">
                      {banners.map((banner) => {
                        const currentIndex = banners.indexOf(currentBanner);
                        const targetIndex = banners.indexOf(banner);
                        const dir = targetIndex > currentIndex ? 1 : -1;
                        
                        return (
                          <button
                            key={banner}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDirection(dir);
                              setCurrentBanner(banner);
                            }}
                            className={`w-1.5 h-1.5 rounded-full transition-colors ${
                              currentBanner === banner ? "bg-yellow-900" : "bg-yellow-600"
                            }`}
                          />
                        );
                      })}
                    </div>
                  )}
                  
                  {/* CTA indicator */}
                  <span className="text-xs text-yellow-800 hidden sm:inline group-hover:text-yellow-900 transition-colors font-medium">
                    {firstUploadCta}
                  </span>
                  <ChevronRight className="h-4 w-4 text-yellow-700 group-hover:text-yellow-900 transition-colors" />
                  
                  {/* Dismiss Button */}
                  <button
                    onClick={handleDismiss}
                    className="p-1 hover:bg-yellow-600 rounded transition-colors flex-shrink-0 ml-1"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4 text-yellow-700 hover:text-yellow-900" />
                  </button>
                </div>
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

