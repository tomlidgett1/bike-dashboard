"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { Gift, ChevronRight, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MARKETPLACE_PROMO_BANNERS_ENABLED } from "@/lib/marketplace-feature-flags";

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
  const [currentBanner, setCurrentBanner] = React.useState<BannerType>("uber");
  const [direction, setDirection] = React.useState(0);

  const showFirstUploadBanner = !isLoggedIn || !hasListings;
  const banners = React.useMemo<BannerType[]>(
    () => (showFirstUploadBanner ? ["uber", "first-upload"] : ["uber"]),
    [showFirstUploadBanner]
  );

  const navigate = React.useCallback(
    (newDirection: number) => {
      if (banners.length <= 1) return;

      setDirection(newDirection);
      setCurrentBanner((prev) => {
        const currentIndex = banners.indexOf(prev);
        let nextIndex: number;

        if (newDirection > 0) {
          nextIndex = (currentIndex + 1) % banners.length;
        } else {
          nextIndex = currentIndex - 1;
          if (nextIndex < 0) nextIndex = banners.length - 1;
        }

        return banners[nextIndex];
      });
    },
    [banners]
  );

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    const swipeThreshold = 50;

    if (info.offset.x > swipeThreshold) {
      navigate(-1);
    } else if (info.offset.x < -swipeThreshold) {
      navigate(1);
    }
  };

  React.useEffect(() => {
    if (banners.length <= 1) return;

    const interval = setInterval(() => {
      navigate(1);
    }, 8000);

    return () => clearInterval(interval);
  }, [banners, navigate]);

  const handleUberClick = () => {
    if (onNavigateToStores) {
      onNavigateToStores();
    }
  };

  const firstUploadHref = isLoggedIn ? "/marketplace/sell" : "/auth/signup";
  const firstUploadCta = isLoggedIn ? "List now" : "Sign up";

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 56 : -56,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -56 : 56,
      opacity: 0,
    }),
  };

  if (!MARKETPLACE_PROMO_BANNERS_ENABLED) {
    return null;
  }

  return (
    <div className="relative overflow-hidden">
      <AnimatePresence mode="wait" custom={direction} initial={false}>
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
              className="bg-black rounded-lg px-3.5 sm:px-4 py-2.5 min-h-[48px] sm:min-h-[52px] flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-900 transition-colors group"
            >
              <div className="flex items-center gap-3">
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

                <div className="w-px h-4 bg-gray-600" />

                <div className="flex items-center gap-2">
                  <Zap className="h-3.5 w-3.5 text-green-500" />
                  <p className="text-sm text-white">
                    <span className="font-medium">1-hour delivery</span>
                    <span className="text-gray-400 ml-1.5 hidden sm:inline">
                      on select products from Melbourne stores
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
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

                <span className="text-xs text-gray-400 hidden sm:inline group-hover:text-gray-300 transition-colors">
                  Shop now
                </span>
                <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
              </div>
            </div>
          </motion.div>
        )}

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
              <div className="bg-[#ffde59] rounded-lg px-3.5 sm:px-4 py-2.5 min-h-[48px] sm:min-h-[52px] flex items-center justify-between gap-3 cursor-pointer hover:bg-[#f0cf45] transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 bg-[#f0cf45] rounded-full">
                      <Gift className="h-4 w-4 text-gray-900" />
                    </div>
                  </div>

                  <div className="w-px h-4 bg-[#f0cf45]" />

                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-900">
                      <span className="font-semibold">
                        List your first item, get $10 off
                      </span>
                      <span className="text-gray-800 ml-1.5 hidden sm:inline">
                        your next purchase
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
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
                              currentBanner === banner
                                ? "bg-gray-900"
                                : "bg-[#f0cf45]"
                            }`}
                          />
                        );
                      })}
                    </div>
                  )}

                  <span className="text-xs text-gray-800 hidden sm:inline group-hover:text-gray-900 transition-colors font-medium">
                    {firstUploadCta}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-700 group-hover:text-gray-900 transition-colors" />
                </div>
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
