"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { X, Zap, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// Uber Delivery Promo Banner - Minimalist Design
// Small, sleek banner highlighting 1-hour delivery
// Clicks through to Ashburton Cycles store page
// ============================================================

// Ashburton Cycles store ID (hardcoded for now)
const ASHBURTON_CYCLES_STORE_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

interface UberDeliveryPromoBannerProps {
  onNavigateToStores?: () => void;
}

export function UberDeliveryPromoBanner({ onNavigateToStores }: UberDeliveryPromoBannerProps) {
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Check if banner was previously dismissed (persist for session)
  React.useEffect(() => {
    const dismissed = sessionStorage.getItem('uber-promo-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDismissed(true);
    sessionStorage.setItem('uber-promo-dismissed', 'true');
  };

  const handleClick = () => {
    if (onNavigateToStores) {
      onNavigateToStores();
    }
  };

  return (
    <AnimatePresence>
      {!isDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
          className="mb-4"
        >
          <div 
            onClick={handleClick}
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
    </AnimatePresence>
  );
}

