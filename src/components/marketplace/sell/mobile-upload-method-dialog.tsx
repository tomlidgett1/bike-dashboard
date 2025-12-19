"use client";

import * as React from "react";
import { Upload, ChevronRight, Sparkles } from "lucide-react";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";

// ============================================================
// Mobile Upload Method Dialog
// Native bottom sheet design optimised for mobile
// Uses Radix Sheet for smooth, hardware-accelerated animations
// ============================================================

interface MobileUploadMethodDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectQuick: () => void;
  onSelectFacebook: () => void;
  onSelectBulk: () => void;
}

export function MobileUploadMethodDialog({
  isOpen,
  onClose,
  onSelectQuick,
  onSelectFacebook,
  onSelectBulk,
}: MobileUploadMethodDialogProps) {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="bottom" 
        className="rounded-t-2xl p-0 overflow-hidden gap-0"
        showCloseButton={false}
      >
        {/* Handle Bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="px-5 pb-3">
          <h2 className="text-xl font-semibold text-gray-900">
            List Your Item
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Choose how you'd like to create your listing
          </p>
        </div>
        
        {/* Options */}
        <div className="px-4 pb-8 space-y-2">
          {/* Recommended: Quick Upload */}
          <button
            onClick={() => {
              onClose();
              onSelectQuick();
            }}
            className="w-full active:scale-[0.98] transition-transform"
          >
            <div className="bg-white border border-gray-300 rounded-xl p-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-6 w-6 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <h3 className="text-base font-semibold text-gray-900">
                    Quick Upload
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    AI fills in details from your photos
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          </button>

          {/* Facebook Import */}
          <button
            onClick={() => {
              onClose();
              onSelectFacebook();
            }}
            className="w-full active:scale-[0.98] transition-transform"
          >
            <div className="bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Image src="/facebook.png" alt="Facebook" width={24} height={24} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <h3 className="text-base font-semibold text-gray-900">
                    Import from Facebook
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Paste a Marketplace link
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          </button>

          {/* Bulk Upload */}
          <button
            onClick={() => {
              onClose();
              onSelectBulk();
            }}
            className="w-full active:scale-[0.98] transition-transform"
          >
            <div className="bg-white border border-gray-200 rounded-xl p-4 active:bg-gray-50">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Upload className="h-6 w-6 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <h3 className="text-base font-semibold text-gray-900">
                    Bulk Upload
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    List multiple items at once
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
              </div>
            </div>
          </button>
        </div>
        
        {/* Safe area padding for iOS */}
        <div className="h-safe-area-inset-bottom" />
      </SheetContent>
    </Sheet>
  );
}

