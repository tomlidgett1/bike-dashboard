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

  // Auto-rotate every 5 seconds
  React.useEffect(() => {
    if (banners.length <= 1 || isDismissed) return;

    const interval = setInterval(() => {
      setCurrentBanner(prev => {
        const currentIndex = banners.indexOf(prev);
        const nextIndex = (currentIndex + 1) % banners.length;
        return banners[nextIndex];
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [banners, isDismissed]);

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

  return (
    <div className="mb-4 relative">
      <AnimatePresence mode="wait">
        {/* Uber Banner */}
        {currentBanner === "uber" && (
          <motion.div
            key="uber"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            <div 
              onClick={handleUberClick}
              className="bg-black rounded-md px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-900 transition-colors group"
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
                    {banners.map((banner, index) => (
                      <button
                        key={banner}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentBanner(banner);
                        }}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${
                          currentBanner === banner ? "bg-white" : "bg-gray-600"
                        }`}
                      />
                    ))}
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
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
          >
            <Link href={firstUploadHref}>
              <div className="bg-yellow-500 rounded-md px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-yellow-600 transition-colors group">
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
                      {banners.map((banner, index) => (
                        <button
                          key={banner}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCurrentBanner(banner);
                          }}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${
                            currentBanner === banner ? "bg-yellow-900" : "bg-yellow-600"
                          }`}
                        />
                      ))}
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

