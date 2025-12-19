"use client";

import * as React from "react";
import Image from "next/image";
import { X, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// Uber Delivery Promo Banner - Minimalist Design
// Small, sleek banner highlighting 1-hour delivery
// ============================================================

export function UberDeliveryPromoBanner() {
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Check if banner was previously dismissed (persist for session)
  React.useEffect(() => {
    const dismissed = sessionStorage.getItem('uber-promo-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
    sessionStorage.setItem('uber-promo-dismissed', 'true');
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
          <div className="bg-black rounded-md px-4 py-2.5 flex items-center justify-between gap-3">
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

            {/* Dismiss Button */}
            <button
              onClick={handleDismiss}
              className="p-1 hover:bg-gray-800 rounded transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4 text-gray-500 hover:text-gray-300" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

