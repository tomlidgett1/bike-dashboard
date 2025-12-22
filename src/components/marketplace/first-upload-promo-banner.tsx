"use client";

import * as React from "react";
import Link from "next/link";
import { X, Gift, ChevronRight, DollarSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// First Upload Promo Banner
// ============================================================
// Displays a promotional banner encouraging users to list their
// first product in exchange for a $10 voucher.
// Only shown to users who have never uploaded a product.

interface FirstUploadPromoBannerProps {
  /** Whether the user has uploaded any products */
  hasListings: boolean;
  /** Whether the user is logged in */
  isLoggedIn: boolean;
}

export function FirstUploadPromoBanner({ 
  hasListings, 
  isLoggedIn 
}: FirstUploadPromoBannerProps) {
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Check if banner was previously dismissed (persist for session)
  React.useEffect(() => {
    const dismissed = sessionStorage.getItem('first-upload-promo-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDismissed(true);
    sessionStorage.setItem('first-upload-promo-dismissed', 'true');
  };

  // Debug logging
  React.useEffect(() => {
    console.log('[FirstUploadPromoBanner] State:', {
      hasListings,
      isDismissed,
      isLoggedIn,
      shouldShow: !hasListings && !isDismissed && isLoggedIn,
    });
  }, [hasListings, isDismissed, isLoggedIn]);

  // Don't show if:
  // - User has already uploaded products
  // - User dismissed the banner
  // - User is not logged in (they need to sign up first)
  if (hasListings || isDismissed || !isLoggedIn) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
        className="mb-4"
      >
        <Link href="/marketplace/sell">
          <div className="bg-gradient-to-r from-amber-500 to-yellow-500 rounded-md px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:from-amber-600 hover:to-yellow-600 transition-all group shadow-sm">
            <div className="flex items-center gap-3">
              {/* Gift Icon */}
              <div className="flex items-center justify-center w-8 h-8 bg-white/20 rounded-full">
                <Gift className="h-4 w-4 text-white" />
              </div>
              
              {/* Divider */}
              <div className="w-px h-4 bg-white/30" />
              
              {/* Message */}
              <div className="flex items-center gap-2">
                <p className="text-sm text-white">
                  <span className="font-semibold">Sell your first item</span>
                  <span className="text-white/90 ml-1.5">
                    <span className="hidden sm:inline">and get </span>
                    <span className="inline-flex items-center gap-0.5 font-bold">
                      <DollarSign className="h-3.5 w-3.5" />10 off
                    </span>
                    <span className="hidden sm:inline"> your next purchase</span>
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* CTA indicator */}
              <span className="text-xs text-white/80 hidden sm:inline group-hover:text-white transition-colors font-medium">
                List now
              </span>
              <ChevronRight className="h-4 w-4 text-white/70 group-hover:text-white transition-colors" />
              
              {/* Dismiss Button */}
              <button
                onClick={handleDismiss}
                className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0 ml-1"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4 text-white/70 hover:text-white" />
              </button>
            </div>
          </div>
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}

