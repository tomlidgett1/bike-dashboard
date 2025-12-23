"use client";

import * as React from "react";
import { X, Check, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// Voucher Success Banner - Minimalist Design
// Simple banner matching the carousel style
// ============================================================

interface VoucherSuccessBannerProps {
  vouchers: Array<{
    id: string;
    voucher_type: string;
    amount_cents: number;
    min_purchase_cents: number;
    description: string;
  }>;
}

export function VoucherSuccessBanner({ vouchers }: VoucherSuccessBannerProps) {
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Check if banner was previously dismissed (persist for session)
  React.useEffect(() => {
    const dismissed = sessionStorage.getItem('voucher-success-dismissed');
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDismissed(true);
    sessionStorage.setItem('voucher-success-dismissed', 'true');
  };

  // Only show first_upload vouchers
  const firstUploadVouchers = vouchers.filter(v => v.voucher_type === 'first_upload');

  if (firstUploadVouchers.length === 0 || isDismissed) {
    return null;
  }

  const voucher = firstUploadVouchers[0];
  const discount = (voucher.amount_cents / 100).toFixed(0);
  const minPurchase = (voucher.min_purchase_cents / 100).toFixed(0);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
        className="mb-4"
      >
        <div className="bg-green-600 rounded-md px-4 py-2.5 min-h-[52px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Check Icon */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 bg-green-700 rounded-full">
                <Check className="h-4 w-4 text-white" />
              </div>
            </div>
            
            {/* Divider */}
            <div className="w-px h-4 bg-green-500" />
            
            {/* Message */}
            <div className="flex items-center gap-2">
              <p className="text-sm text-white">
                <span className="font-medium">You have a ${discount} voucher</span>
                <span className="text-green-100 ml-1.5 hidden sm:inline">· Auto-applies on orders ${minPurchase}+</span>
              </p>
            </div>
          </div>

          {/* Dismiss Button */}
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-green-700 rounded transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-green-200 hover:text-white" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
