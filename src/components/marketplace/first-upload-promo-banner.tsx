"use client";

import * as React from "react";
import Link from "next/link";
import { X, Gift, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// First Upload Promo Banner - Minimalist Design
// Small, sleek banner encouraging users to list their first product
// Matches the Uber banner style
// ============================================================

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

  // Don't show if:
  // - User has already uploaded products (logged in users only)
  // - User dismissed the banner
  if ((isLoggedIn && hasListings) || isDismissed) {
    return null;
  }

  // Determine the link destination based on login status
  const linkHref = isLoggedIn ? "/marketplace/sell" : "/auth/signup";
  const ctaText = isLoggedIn ? "List now" : "Sign up";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
        className="mb-4"
      >
        <Link href={linkHref}>
          <div className="bg-black rounded-md px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer hover:bg-gray-900 transition-colors group">
            <div className="flex items-center gap-3">
              {/* Gift Icon */}
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 bg-green-500 rounded-full">
                  <Gift className="h-4 w-4 text-white" />
                </div>
              </div>
              
              {/* Divider */}
              <div className="w-px h-4 bg-gray-600" />
              
              {/* Message */}
              <div className="flex items-center gap-2">
                <p className="text-sm text-white">
                  <span className="font-medium">List your first item, get $10 off</span>
                  <span className="text-gray-400 ml-1.5 hidden sm:inline">your next purchase</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* CTA indicator */}
              <span className="text-xs text-gray-400 hidden sm:inline group-hover:text-gray-300 transition-colors">
                {ctaText}
              </span>
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
        </Link>
      </motion.div>
    </AnimatePresence>
  );
}
