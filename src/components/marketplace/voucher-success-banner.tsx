"use client";

import * as React from "react";
import { X, Gift, DollarSign, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================
// Voucher Success Banner
// ============================================================
// Shows when user HAS an active voucher, telling them they can use it

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
        <div className="bg-white rounded-md px-4 py-3 flex items-center justify-between gap-3 border-2 border-green-500 shadow-sm">
          <div className="flex items-center gap-3 flex-1">
            {/* Success Icon */}
            <div className="flex items-center justify-center w-10 h-10 bg-green-100 rounded-full flex-shrink-0">
              <Check className="h-5 w-5 text-green-600" />
            </div>
            
            {/* Message */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900">
                  You've earned a ${discount} voucher!
                </p>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  <Gift className="h-3 w-3" />
                  Active
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">
                Automatically applies on purchases over ${minPurchase}
              </p>
            </div>
          </div>

          {/* Dismiss Button */}
          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

