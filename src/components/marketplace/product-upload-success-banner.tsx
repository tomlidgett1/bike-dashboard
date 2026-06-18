"use client";

import * as React from "react";
import { CheckCircle2, X } from '@/components/layout/app-sidebar/dashboard-icons';
import { cn } from "@/lib/utils";

// ============================================================
// Product Upload Success Banner
// Shows after quick upload or Facebook import
// ============================================================

interface ProductUploadSuccessBannerProps {
  show: boolean;
  onClose: () => void;
}

export function ProductUploadSuccessBanner({ show, onClose }: ProductUploadSuccessBannerProps) {
  // Auto-dismiss after 10 seconds
  React.useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onClose();
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  if (!show) return null;

  return (
    <div className="overflow-hidden">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Product uploaded successfully!
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Your product will appear on the homepage within 5 minutes.
              </p>
            </div>

            <button
              onClick={onClose}
              className={cn(
                "flex-shrink-0 rounded-md p-1.5 text-gray-400",
                "hover:bg-gray-100 hover:text-gray-600",
                "transition-colors duration-200"
              )}
              aria-label="Close banner"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
